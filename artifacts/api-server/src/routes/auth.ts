import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { authUsersTable, db } from "@workspace/db";

type SessionUser = { id: string; name: string; email: string };
const router: IRouter = Router();
const SESSION_COOKIE = "email_session";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cookieValue(request: Request, name: string): string | undefined {
  return request.headers.cookie?.split(";").find((item) => item.trim().startsWith(`${name}=`))?.trim().slice(name.length + 1);
}

function cookieHeader(name: string, value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

function encodeSession(user: SessionUser): string | undefined {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return undefined;
  const payload = Buffer.from(JSON.stringify(user)).toString("base64url");
  const signature = createHash("sha256").update(`${secret}.${payload}`).digest("base64url");
  return `${payload}.${signature}`;
}

function decodeSession(value?: string): SessionUser | undefined {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !value) return undefined;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return undefined;
  const expected = createHash("sha256").update(`${secret}.${payload}`).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return undefined;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionUser; } catch { return undefined; }
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, value] = stored.split(":");
  if (!salt || !value) return false;
  const expected = Buffer.from(value, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function setSession(response: Response, user: SessionUser): boolean {
  const value = encodeSession(user);
  if (!value) return false;
  response.setHeader("Set-Cookie", cookieHeader(SESSION_COOKIE, value, 60 * 60 * 24 * 30));
  return true;
}

export function currentSession(request: Request): SessionUser | undefined {
  return decodeSession(cookieValue(request, SESSION_COOKIE));
}

export function requireAuth(request: Request, response: Response, next: NextFunction): void {
  if (currentSession(request)) { next(); return; }
  response.status(401).json({ error: "Требуется войти в аккаунт" });
}

router.get("/auth/session", (req, res): void => {
  const user = currentSession(req);
  res.json(user ? { authenticated: true, user } : { authenticated: false });
});

router.post("/auth/register", async (req, res): Promise<void> => {
  const body = req.body as { email?: string; password?: string; name?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const name = body.name?.trim() || email.split("@")[0] || "Пользователь";
  if (!emailPattern.test(email) || password.length < 8) {
    res.status(400).json({ error: "Укажите корректную почту и пароль минимум из 8 символов" });
    return;
  }
  const existing = await db.select({ id: authUsersTable.id }).from(authUsersTable).where(eq(authUsersTable.email, email));
  if (existing.length) {
    res.status(409).json({ error: "Аккаунт с этой почтой уже существует" });
    return;
  }
  const [created] = await db.insert(authUsersTable).values({ email, name, passwordHash: hashPassword(password) }).returning();
  if (!setSession(res, { id: String(created.id), name: created.name, email: created.email })) {
    res.status(500).json({ error: "SESSION_SECRET не настроен" });
    return;
  }
  res.status(201).json({ authenticated: true, user: { id: String(created.id), name: created.name, email: created.email } });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const body = req.body as { email?: string; password?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  const [user] = await db.select().from(authUsersTable).where(eq(authUsersTable.email, email));
  if (!user || !verifyPassword(body.password ?? "", user.passwordHash)) {
    res.status(401).json({ error: "Неверная почта или пароль" });
    return;
  }
  if (!setSession(res, { id: String(user.id), name: user.name, email: user.email })) {
    res.status(500).json({ error: "SESSION_SECRET не настроен" });
    return;
  }
  res.json({ authenticated: true, user: { id: String(user.id), name: user.name, email: user.email } });
});

router.post("/auth/logout", (_req, res): void => {
  res.setHeader("Set-Cookie", cookieHeader(SESSION_COOKIE, "", 0));
  res.status(204).end();
});

export default router;