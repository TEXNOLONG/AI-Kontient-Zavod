import { Router, type IRouter } from "express";
import { and, eq, lte } from "drizzle-orm";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { URLSearchParams } from "node:url";
import {
  db,
  postsTable,
  publishingJobsTable,
  socialChannelsTable,
} from "@workspace/db";
import { currentSession } from "./auth";
import {
  encryptCredentials,
  publishToChannel,
  testChannelConnection,
  type ChannelCredentials,
  type Platform,
} from "../lib/publishing";

const router: IRouter = Router();
const platforms = new Set<Platform>(["vk", "ok", "max", "telegram", "zen"]);
const VK_OAUTH_COOKIE = "vk_oauth_state";
const VK_OAUTH_TTL_SECONDS = 10 * 60;

function userId(req: Parameters<typeof currentSession>[0]): string {
  return currentSession(req)?.id ?? "";
}

function channelDto(channel: typeof socialChannelsTable.$inferSelect) {
  return {
    id: channel.id,
    platform: channel.platform,
    name: channel.name,
    target: channel.target,
    status: channel.status,
    lastError: channel.lastError,
    createdAt: channel.createdAt,
  };
}

function oauthConfig() {
  const clientId = process.env.VK_CLIENT_ID;
  const redirectUri = process.env.VK_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new Error("VK_CLIENT_ID и VK_OAUTH_REDIRECT_URI должны быть настроены");
  }
  return { clientId, redirectUri };
}

function signedOauthState(payload: Record<string, string | number>): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be configured");
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function readOauthState(value: string | undefined): Record<string, string | number> | undefined {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !value) return undefined;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return undefined;
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  if (signature.length !== expected.length) return undefined;
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (!timingSafeEqual(actual, expectedBuffer)) {
    return undefined;
  }
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, string | number>;
  } catch {
    return undefined;
  }
}

function cookieValue(request: Parameters<typeof currentSession>[0], name: string): string | undefined {
  return request.headers.cookie?.split(";")
    .find((item) => item.trim().startsWith(`${name}=`))
    ?.trim()
    .slice(name.length + 1);
}

function oauthCookie(value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${VK_OAUTH_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

function successRedirect(status: "connected" | "error", message?: string): string {
  const target = process.env.VK_OAUTH_SUCCESS_URL ?? "/settings";
  const separator = target.includes("?") ? "&" : "?";
  return `${target}${separator}vk=${status}${message ? `&message=${encodeURIComponent(message)}` : ""}`;
}

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

router.get("/channels/vk/oauth/start", (req, res): void => {
  const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
  const target = typeof req.query.target === "string" ? req.query.target.trim() : "";
  if (!name || !target) {
    res.status(400).json({ error: "Название и ID VK-сообщества обязательны" });
    return;
  }
  try {
    const { clientId, redirectUri } = oauthConfig();
    const session = currentSession(req);
    if (!session) {
      res.status(401).json({ error: "Требуется войти в аккаунт" });
      return;
    }
    const state = randomBytes(24).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const signedState = signedOauthState({
      state,
      verifier,
      userId: session.id,
      name,
      target,
      expiresAt: Date.now() + VK_OAUTH_TTL_SECONDS * 1000,
    });
    res.setHeader("Set-Cookie", oauthCookie(signedState, VK_OAUTH_TTL_SECONDS));
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: "S256",
      scope: "wall groups offline",
    });
    res.redirect(`https://id.vk.com/authorize?${params}`);
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "VK OAuth не настроен" });
  }
});

router.get("/channels/vk/oauth/callback", async (req, res): Promise<void> => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const saved = readOauthState(decodeURIComponent(cookieValue(req, VK_OAUTH_COOKIE) ?? ""));
  const session = currentSession(req);
  const expiresAt = Number(saved?.expiresAt);
  if (!code || !state || !saved || saved.state !== state || !Number.isFinite(expiresAt) || expiresAt < Date.now() || !session || saved.userId !== session.id) {
    res.redirect(successRedirect("error", "VK авторизация не подтверждена или истекла"));
    return;
  }
  try {
    const { clientId, redirectUri } = oauthConfig();
    const tokenResponse = await fetch("https://id.vk.com/oauth2/auth", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        code,
        code_verifier: String(saved.verifier),
        grant_type: "authorization_code",
        ...(process.env.VK_CLIENT_SECRET ? { client_secret: process.env.VK_CLIENT_SECRET } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await tokenResponse.json().catch(() => ({}))) as {
      access_token?: unknown;
      refresh_token?: unknown;
      expires_in?: unknown;
      user_id?: unknown;
      error?: unknown;
      error_description?: unknown;
    };
    if (!tokenResponse.ok || !payload.access_token) {
      throw new Error(String(payload.error_description ?? payload.error ?? `VK OAuth HTTP ${tokenResponse.status}`));
    }
    const credentials: ChannelCredentials = {
      token: String(payload.access_token),
      refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : undefined,
      expiresAt: typeof payload.expires_in === "number" ? Date.now() + payload.expires_in * 1000 : undefined,
      vkUserId: payload.user_id == null ? undefined : String(payload.user_id),
    };
    const [channel] = await db.insert(socialChannelsTable).values({
      userId: session.id,
      platform: "vk",
      name: String(saved.name),
      target: String(saved.target),
      credentials: encryptCredentials(credentials),
      status: "connected",
    }).returning();
    res.setHeader("Set-Cookie", oauthCookie("", 0));
    if (!channel) throw new Error("VK-канал не удалось сохранить");
    res.redirect(successRedirect("connected", channel.name));
  } catch (error) {
    res.setHeader("Set-Cookie", oauthCookie("", 0));
    res.redirect(successRedirect("error", error instanceof Error ? error.message : "VK авторизация не удалась"));
  }
});

router.get("/channels", async (req, res): Promise<void> => {
  const channels = await db.select().from(socialChannelsTable).where(eq(socialChannelsTable.userId, userId(req)));
  res.json(channels.map(channelDto));
});

router.post("/channels", async (req, res): Promise<void> => {
  const body = req.body as {
    platform?: Platform;
    name?: string;
    target?: string;
    token?: string;
    applicationKey?: string;
    applicationSecret?: string;
    sessionSecret?: string;
  };
  if (!body.platform || !platforms.has(body.platform) || !body.name?.trim() || !body.target?.trim()) {
    res.status(400).json({ error: "platform, name и target обязательны" });
    return;
  }
  if (body.platform === "vk") {
    res.status(400).json({ error: "VK подключается через кнопку «Войти через VK»" });
    return;
  }
  if (!body.token?.trim()) {
    res.status(400).json({ error: "Токен или webhook обязателен" });
    return;
  }
  const [channel] = await db.insert(socialChannelsTable).values({
    userId: userId(req),
    platform: body.platform,
    name: body.name.trim(),
    target: body.target.trim(),
    credentials: encryptCredentials({
      token: body.token.trim(),
      applicationKey: body.applicationKey?.trim(),
      applicationSecret: body.applicationSecret?.trim(),
      sessionSecret: body.sessionSecret?.trim(),
    }),
  }).returning();
  res.status(201).json(channelDto(channel));
});

router.delete("/channels/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.delete(socialChannelsTable).where(and(eq(socialChannelsTable.id, id), eq(socialChannelsTable.userId, userId(req))));
  res.status(204).end();
});

router.post("/channels/:id/test", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [channel] = await db.select().from(socialChannelsTable)
    .where(and(eq(socialChannelsTable.id, id), eq(socialChannelsTable.userId, userId(req))));
  if (!channel) {
    res.status(404).json({ error: "Канал не найден" });
    return;
  }
  try {
    const message = await testChannelConnection(channel);
    res.json({ ok: true, message: `${message}. Тестовый пост выполняется только из календаря.` });
  } catch (error) {
    await db.update(socialChannelsTable).set({
      status: "error",
      lastError: error instanceof Error ? error.message : "Не удалось проверить подключение",
    }).where(eq(socialChannelsTable.id, channel.id));
    res.status(400).json({ error: error instanceof Error ? error.message : "Не удалось проверить подключение" });
  }
});

router.get("/publishing/jobs", async (req, res): Promise<void> => {
  const jobs = await db.select({
    id: publishingJobsTable.id,
    postId: publishingJobsTable.postId,
    channelId: publishingJobsTable.channelId,
    scheduledAt: publishingJobsTable.scheduledAt,
    status: publishingJobsTable.status,
    externalId: publishingJobsTable.externalId,
    error: publishingJobsTable.error,
    publishedAt: publishingJobsTable.publishedAt,
  }).from(publishingJobsTable).where(eq(publishingJobsTable.userId, userId(req)));
  res.json(jobs);
});

router.post("/publishing/publish", async (req, res): Promise<void> => {
  const body = req.body as { postId?: number; channelIds?: number[] };
  if (!body.postId || !body.channelIds?.length) {
    res.status(400).json({ error: "postId и channelIds обязательны" });
    return;
  }
  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, Number(body.postId)));
  if (!post) {
    res.status(404).json({ error: "Публикация не найдена" });
    return;
  }
  const channels = await db.select().from(socialChannelsTable).where(
    and(eq(socialChannelsTable.userId, userId(req)), eq(socialChannelsTable.status, "connected")),
  );
  const selected = channels.filter((channel) => body.channelIds?.includes(channel.id));
  if (!selected.length) {
    res.status(400).json({ error: "Нет доступных подключённых каналов" });
    return;
  }
  const results = [];
  for (const channel of selected) {
    try {
      const externalId = await publishToChannel(channel, post.text, async (credentials) => {
        await db.update(socialChannelsTable).set({ credentials: encryptCredentials(credentials) }).where(eq(socialChannelsTable.id, channel.id));
      });
      results.push({ channelId: channel.id, status: "published", externalId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка публикации";
      await db.update(socialChannelsTable).set({ status: "error", lastError: message }).where(eq(socialChannelsTable.id, channel.id));
      results.push({ channelId: channel.id, status: "failed", error: message });
    }
  }
  if (results.some((result) => result.status === "published")) {
    await db.update(postsTable).set({ status: "published" }).where(eq(postsTable.id, post.id));
  }
  res.json({ results });
});

export async function processDuePublishingJobs(): Promise<void> {
  const jobs = await db.select().from(publishingJobsTable).where(
    and(eq(publishingJobsTable.status, "pending"), lte(publishingJobsTable.scheduledAt, new Date())),
  );
  for (const job of jobs) {
    const [channel] = await db.select().from(socialChannelsTable).where(
      and(eq(socialChannelsTable.id, job.channelId), eq(socialChannelsTable.userId, job.userId)),
    );
    const [post] = await db.select().from(postsTable).where(eq(postsTable.id, job.postId));
    if (!channel || !post) {
      await db.update(publishingJobsTable).set({ status: "failed", error: "Канал или пост не найден" }).where(eq(publishingJobsTable.id, job.id));
      continue;
    }
    try {
      const externalId = await publishToChannel(channel, post.text, async (credentials) => {
        await db.update(socialChannelsTable).set({ credentials: encryptCredentials(credentials) }).where(eq(socialChannelsTable.id, channel.id));
      });
      await db.update(publishingJobsTable).set({ status: "published", externalId, publishedAt: new Date(), error: null }).where(eq(publishingJobsTable.id, job.id));
    } catch (error) {
      await db.update(publishingJobsTable).set({
        status: "failed",
        error: error instanceof Error ? error.message : "Ошибка публикации",
      }).where(eq(publishingJobsTable.id, job.id));
    }
  }
}

export default router;