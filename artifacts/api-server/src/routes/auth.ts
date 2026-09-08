import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { logger } from "../lib/logger";

type PendingAuth = { verifier: string; createdAt: number };
type SessionUser = { id: string; name: string; avatarUrl?: string };

const router: IRouter = Router();
const pending = new Map<string, PendingAuth>();
const SESSION_COOKIE = "vk_session";
const STATE_COOKIE = "vk_oauth_state";
const pendingTtl = 10 * 60 * 1000;

function cookieValue(request: Request, name: string): string | undefined {
  const cookies = request.headers.cookie?.split(";") ?? [];
  const entry = cookies.find((item) => item.trim().startsWith(`${name}=`));
  return entry?.trim().slice(name.length + 1);
}

function cookieHeader(name: string, value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

function makeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function encodeSession(user: SessionUser): string | undefined {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return undefined;
  const payload = Buffer.from(JSON.stringify(user)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function decodeSession(value?: string): SessionUser | undefined {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !value) return undefined;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return undefined;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (signature.length !== expected.length) return undefined;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return undefined;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionUser;
  } catch {
    return undefined;
  }
}

function clearExpiredStates() {
  const now = Date.now();
  for (const [state, value] of pending) {
    if (now - value.createdAt > pendingTtl) pending.delete(state);
  }
}

export function currentSession(request: Request): SessionUser | undefined {
  return decodeSession(cookieValue(request, SESSION_COOKIE));
}

export function requireAuth(request: Request, response: Response, next: NextFunction): void {
  if (currentSession(request)) {
    next();
    return;
  }
  response.status(401).json({ error: "VK authentication required" });
}

router.get("/auth/session", (req, res): void => {
  const user = currentSession(req);
  res.json(user ? { authenticated: true, user } : { authenticated: false });
});

function startVkLogin(req: Request, res: Response): void {
  const clientId = process.env.VK_CLIENT_ID;
  const redirectUri = process.env.VK_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    res.redirect("/login?error=vk_not_configured");
    return;
  }

  clearExpiredStates();
  const state = randomUUID();
  const verifier = randomBytes(32).toString("base64url");
  pending.set(state, { verifier, createdAt: Date.now() });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    code_challenge: makeChallenge(verifier),
    code_challenge_method: "S256",
  });

  res.setHeader("Set-Cookie", cookieHeader(STATE_COOKIE, state, 600));
  res.redirect(`https://id.vk.com/authorize?${params.toString()}`);
}

async function completeVkLogin(req: Request, res: Response): Promise<void> {
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const storedState = cookieValue(req, STATE_COOKIE);
  const auth = state ? pending.get(state) : undefined;
  const clientId = process.env.VK_CLIENT_ID;
  const redirectUri = process.env.VK_REDIRECT_URI;

  if (!code || !state || !storedState || state !== storedState || !auth || !clientId || !redirectUri) {
    res.redirect("/login?error=vk_state");
    return;
  }
  pending.delete(state);

  try {
    const tokenResponse = await fetch("https://id.vk.com/oauth2/auth", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: auth.verifier,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenResponse.ok) {
      logger.warn({ status: tokenResponse.status }, "VK token exchange failed");
      res.redirect("/login?error=vk_token");
      return;
    }
    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token) {
      res.redirect("/login?error=vk_token");
      return;
    }

    const profileResponse = await fetch("https://id.vk.com/oauth2/user_info", {
      headers: { Authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!profileResponse.ok) {
      logger.warn({ status: profileResponse.status }, "VK profile request failed");
      res.redirect("/login?error=vk_profile");
      return;
    }
    const profile = (await profileResponse.json()) as {
      user?: { user_id?: string; first_name?: string; last_name?: string; avatar?: string };
    };
    const vkUser = profile.user;
    const user = encodeSession({
      id: vkUser?.user_id ?? "vk-user",
      name: [vkUser?.first_name, vkUser?.last_name].filter(Boolean).join(" ") || "Пользователь VK",
      avatarUrl: vkUser?.avatar,
    });
    if (!user) {
      res.redirect("/login?error=session");
      return;
    }
    res.setHeader("Set-Cookie", [
      cookieHeader(SESSION_COOKIE, user, 60 * 60 * 24 * 30),
      cookieHeader(STATE_COOKIE, "", 0),
    ]);
    res.redirect("/app");
  } catch (error) {
    logger.warn({ err: error }, "VK OAuth callback failed");
    res.redirect("/login?error=vk_unavailable");
  }
}

router.get("/auth/vk", (req, res): void => {
  if (typeof req.query.code === "string" && typeof req.query.state === "string") {
    void completeVkLogin(req, res);
    return;
  }
  startVkLogin(req, res);
});

router.get("/auth/vk/callback", (req, res): void => {
  void completeVkLogin(req, res);
});

router.post("/auth/logout", (_req, res): void => {
  res.setHeader("Set-Cookie", cookieHeader(SESSION_COOKIE, "", 0));
  res.status(204).end();
});

export default router;