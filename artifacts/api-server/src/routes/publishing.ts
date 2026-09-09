import { Router, type IRouter } from "express";
import { and, eq, lte } from "drizzle-orm";
import {
  db,
  postsTable,
  publishingJobsTable,
  socialChannelsTable,
} from "@workspace/db";
import { currentSession } from "./auth";
import { encryptCredentials, publishToChannel, testChannelConnection, type Platform } from "../lib/publishing";

const router: IRouter = Router();
const platforms = new Set<Platform>(["vk", "ok", "max", "telegram", "zen"]);

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
      const externalId = await publishToChannel(channel, post.text);
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
      const externalId = await publishToChannel(channel, post.text);
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