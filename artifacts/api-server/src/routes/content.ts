import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  competitorPostsTable,
  competitorsTable,
  postsTable,
  projectsTable,
  scheduleTable,
  publishingJobsTable,
  socialChannelsTable,
} from "@workspace/db";
import {
  AnalyzeProjectBody,
  AnalyzeProjectParams,
  AnalyzeProjectResponse,
  CreateCompetitorBody,
  CreateCompetitorResponse,
  CreateProjectBody,
  CreateProjectResponse,
  CreateCompetitorResponse as CreateCompetitorResult,
  Dashboard,
  GeneratePostBody,
  GeneratePostResponse,
  GetDashboardResponse,
  GetProjectParams,
  GetProjectResponse,
  ListCompetitorsQueryParams,
  ListCompetitorsResponse,
  ListPostsQueryParams,
  ListPostsResponse,
  ListProjectsResponse,
  ListScheduleQueryParams,
  ListScheduleResponse,
  RegeneratePostParams,
  RegeneratePostResponse,
  SchedulePostBody,
  SchedulePostResponse,
  SyncCompetitorsBody,
  SyncCompetitorsResponse,
  UpdatePostBody,
  UpdatePostParams,
  UpdatePostResponse,
  UpdateProjectBody,
  UpdateProjectParams,
  UpdateProjectResponse,
  UpdateScheduleBody,
  UpdateScheduleParams,
  UpdateScheduleResponse,
} from "@workspace/api-zod";
import { askMistralJson } from "../lib/mistral";
import { publishToChannel } from "../lib/publishing";
import { currentSession } from "./auth";

const router: IRouter = Router();

type BrandAnalysis = {
  industry: string;
  audience: string;
  tone: string;
  usp: string;
  values: string[];
};

type PostDraft = { title: string; text: string };

const seedAnalysis: BrandAnalysis = {
  industry: "Сервис и технологии",
  audience: "Люди и команды, которым важны понятные решения без лишней сложности.",
  tone: "Уверенный, живой, человеческий",
  usp: "Сложное становится понятным — и начинает работать на результат.",
  values: ["ясность", "скорость", "доверие"],
};

async function readSource(sourceUrl: string): Promise<string> {
  try {
    const response = await fetch(sourceUrl, {
      headers: { "User-Agent": "AI-Content-Factory/1.0 (+brand-analysis)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return "";
    const html = await response.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 12_000);
  } catch {
    return "";
  }
}

const seedPosts: PostDraft[] = [
  {
    title: "Сервис начинается до покупки",
    text:
      "Хороший сервис начинается не с красивого обещания, а с первого понятного шага. Покажите клиенту, что будет дальше — и доверие появится раньше сделки.",
  },
  {
    title: "Три вопроса перед новым запуском",
    text:
      "Перед тем как добавлять ещё один формат контента, спросите: какую проблему он решает, для кого он создан и какое действие должно стать следующим. Ясность экономит больше времени, чем скорость.",
  },
  {
    title: "Почему регулярность важнее идеальности",
    text:
      "Бренд растёт не от редких идеальных публикаций, а от узнаваемого ритма. Лучше одна ясная мысль каждую неделю, чем десять несвязанных идей за один день.",
  },
];

function parseId(value: string | string[]): number {
  return Number(Array.isArray(value) ? value[0] : value);
}

function dateOnly(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function withoutNullQueryValues(query: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(query).map(([key, value]) => [
      key,
      value === "null" ? undefined : value,
    ]),
  );
}

function projectDto(project: typeof projectsTable.$inferSelect) {
  return {
    ...project,
    values: project.values ?? [],
  };
}

function postDto(post: typeof postsTable.$inferSelect) {
  return {
    ...post,
    imageUrl: post.imageUrl ?? null,
  };
}

async function seedWorkspace(): Promise<void> {
  const existing = await db.select({ id: projectsTable.id }).from(projectsTable).limit(1);
  if (existing.length > 0) return;

  const [project] = await db
    .insert(projectsTable)
    .values({
      name: "Northline Studio",
      sourceUrl: "https://northline.example",
      ...seedAnalysis,
      status: "ready",
    })
    .returning();

  const posts = await db
    .insert(postsTable)
    .values(
      seedPosts.map((post, index) => ({
        projectId: project.id,
        ...post,
        goal: ["Вовлечение", "Доверие", "Охват"][index],
        format: "Пост",
        status: index === 0 ? "approved" : "draft",
        variant: index + 1,
      })),
    )
    .returning();

  await db.insert(scheduleTable).values({
    projectId: project.id,
    postId: posts[0].id,
    scheduledDate: new Date().toISOString().slice(0, 10),
    time: "10:00",
    status: "planned",
  });

  const [competitor] = await db
    .insert(competitorsTable)
    .values({
      projectId: project.id,
      name: "Clearpath",
      url: "https://clearpath.example",
    })
    .returning();

  await db.insert(competitorPostsTable).values([
    {
      competitorId: competitor.id,
      text: "Как объяснять сложный продукт за 30 секунд: начинайте с результата, а не с функций.",
      idea: "Разобрать путь от функции к пользе",
    },
    {
      competitorId: competitor.id,
      text: "Клиенты запоминают не количество деталей, а ощущение, что их услышали.",
      idea: "Показать один инсайт из общения с клиентами",
    },
  ]);
}

async function getProjectOrNull(id: number) {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, id));
  return project ?? null;
}

async function competitorsDto(projectId: number) {
  const competitors = await db
    .select()
    .from(competitorsTable)
    .where(eq(competitorsTable.projectId, projectId))
    .orderBy(desc(competitorsTable.lastSync));
  if (!competitors.length) return [];

  const posts = await db
    .select()
    .from(competitorPostsTable)
    .where(
      inArray(
        competitorPostsTable.competitorId,
        competitors.map((competitor) => competitor.id),
      ),
    )
    .orderBy(desc(competitorPostsTable.postedAt));

  return competitors.map((competitor) => ({
    ...competitor,
    posts: posts
      .filter((post) => post.competitorId === competitor.id)
      .map(({ competitorId: _competitorId, ...post }) => post),
  }));
}

async function scheduleDto(projectId: number) {
  const schedule = await db
    .select()
    .from(scheduleTable)
    .where(eq(scheduleTable.projectId, projectId));
  if (!schedule.length) return [];

  const posts = await db
    .select()
    .from(postsTable)
    .where(
      inArray(
        postsTable.id,
        schedule.map((item) => item.postId),
      ),
    );
  const byId = new Map(posts.map((post) => [post.id, post]));
  return schedule.map((item) => ({
    id: item.id,
    projectId: item.projectId,
    postId: item.postId,
    date: item.scheduledDate,
    time: item.time,
    status: item.status,
    post: postDto(byId.get(item.postId)!),
  }));
}

async function createPostDraft(
  project: typeof projectsTable.$inferSelect,
  topic: string,
  goal: string,
  format: string,
  variant: number,
): Promise<PostDraft> {
  const tone = project.tone || seedAnalysis.tone;
  const audience = project.audience || seedAnalysis.audience;
  const usp = project.usp || seedAnalysis.usp;
  const fallback = {
    title: topic.length > 56 ? `${topic.slice(0, 56)}…` : topic,
    text: [
      `${topic}`,
      "",
      `Для ${audience.toLowerCase()} это не абстрактная идея, а практический шаг: начните с одного понятного действия и покажите, какой результат оно даёт.`,
      "",
      `${usp} Такой подход помогает перейти от общих обещаний к доказуемой пользе.`,
      "",
      `Сохраните этот принцип и проверьте его на ближайшем кейсе. ${tone} подача работает лучше, когда за ней стоит конкретика.`,
    ].join("\n"),
  };
  return askMistralJson<PostDraft>(
    [
      {
        role: "system",
        content:
          "Ты редактор бренда. Пиши на русском, конкретно, без канцелярита. Верни JSON с полями title и text.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Создай вариант публикации для соцсетей",
          topic,
          goal,
          format,
          brand: {
            industry: project.industry,
            audience: project.audience,
            tone: project.tone,
            usp: project.usp,
            values: project.values,
          },
        }),
      },
    ],
    fallback,
  );
}

router.get("/dashboard", async (_req, res): Promise<void> => {
  await seedWorkspace();
  const [project] = await db.select().from(projectsTable).orderBy(projectsTable.id).limit(1);
  const posts = await db.select().from(postsTable).where(eq(postsTable.projectId, project.id));
  const schedule = await db
    .select()
    .from(scheduleTable)
    .where(eq(scheduleTable.projectId, project.id));
  const competitors = await competitorsDto(project.id);
  const recentPosts = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.projectId, project.id))
    .orderBy(desc(postsTable.createdAt))
    .limit(5);

  const payload = {
    project: projectDto(project),
    totalPosts: posts.length,
    approvedPosts: posts.filter((post) => post.status === "approved").length,
    scheduledPosts: schedule.length,
    radarIdeas: competitors.reduce((sum, competitor) => sum + competitor.posts.length, 0),
    recentPosts: recentPosts.map(postDto),
  };
  res.json(GetDashboardResponse.parse(payload));
});

router.get("/projects", async (_req, res): Promise<void> => {
  await seedWorkspace();
  const projects = await db.select().from(projectsTable).orderBy(desc(projectsTable.createdAt));
  res.json(ListProjectsResponse.parse(projects.map(projectDto)));
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [project] = await db.insert(projectsTable).values(parsed.data).returning();
  res.status(201).json(CreateProjectResponse.parse(projectDto(project)));
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const project = await getProjectOrNull(params.data.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(GetProjectResponse.parse(projectDto(project)));
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateProjectBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [project] = await db
    .update(projectsTable)
    .set(body.data)
    .where(eq(projectsTable.id, params.data.id))
    .returning();
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(UpdateProjectResponse.parse(projectDto(project)));
});

router.post("/projects/:id/analyze", async (req, res): Promise<void> => {
  const params = AnalyzeProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = AnalyzeProjectBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const project = await getProjectOrNull(params.data.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const sourceText = await readSource(body.data.sourceUrl);
  const analysis = await askMistralJson<BrandAnalysis>(
    [
      {
        role: "system",
        content:
          "Ты бренд-стратег. По источнику и названию проекта составь компактную Brand DNA. Верни JSON: industry, audience, tone, usp, values (массив из 3-5 коротких слов). Пиши на русском.",
      },
      {
        role: "user",
        content: JSON.stringify({
          name: project.name,
          sourceUrl: body.data.sourceUrl,
          sourceText,
          current: project,
        }),
      },
    ],
    {
      ...seedAnalysis,
      industry: project.industry || seedAnalysis.industry,
    },
  );
  const [updated] = await db
    .update(projectsTable)
    .set({
      ...analysis,
      sourceUrl: body.data.sourceUrl,
      status: "ready",
    })
    .where(eq(projectsTable.id, project.id))
    .returning();
  res.json(AnalyzeProjectResponse.parse(projectDto(updated)));
});

router.get("/content", async (req, res): Promise<void> => {
  await seedWorkspace();
  const query = ListPostsQueryParams.safeParse(withoutNullQueryValues(req.query));
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const filters = [];
  if (query.data.projectId != null) filters.push(eq(postsTable.projectId, query.data.projectId));
  if (query.data.status != null) filters.push(eq(postsTable.status, query.data.status));
  const posts = await db
    .select()
    .from(postsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(postsTable.createdAt));
  res.json(ListPostsResponse.parse(posts.map(postDto)));
});

router.post("/content", async (req, res): Promise<void> => {
  const parsed = GeneratePostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const project = await getProjectOrNull(parsed.data.projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const current = await db
    .select({ variant: postsTable.variant })
    .from(postsTable)
    .where(eq(postsTable.projectId, project.id))
    .orderBy(desc(postsTable.variant))
    .limit(1);
  const draft = await createPostDraft(
    project,
    parsed.data.topic,
    parsed.data.goal,
    parsed.data.format,
    (current[0]?.variant ?? 0) + 1,
  );
  const [post] = await db
    .insert(postsTable)
    .values({
      projectId: project.id,
      title: draft.title,
      text: draft.text,
      goal: parsed.data.goal,
      format: parsed.data.format,
      variant: (current[0]?.variant ?? 0) + 1,
      status: "draft",
    })
    .returning();
  res.status(201).json(GeneratePostResponse.parse(postDto(post)));
});

router.patch("/content/:id", async (req, res): Promise<void> => {
  const params = UpdatePostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdatePostBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [post] = await db
    .update(postsTable)
    .set(body.data)
    .where(eq(postsTable.id, params.data.id))
    .returning();
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.json(UpdatePostResponse.parse(postDto(post)));
});

router.post("/content/:id/regenerate", async (req, res): Promise<void> => {
  const params = RegeneratePostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, params.data.id));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const project = await getProjectOrNull(post.projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const draft = await createPostDraft(project, post.title, post.goal, post.format, post.variant + 1);
  const [regenerated] = await db
    .insert(postsTable)
    .values({
      projectId: post.projectId,
      title: draft.title,
      text: draft.text,
      goal: post.goal,
      format: post.format,
      variant: post.variant + 1,
      status: "draft",
    })
    .returning();
  res.status(201).json(RegeneratePostResponse.parse(postDto(regenerated)));
});

router.get("/competitors", async (req, res): Promise<void> => {
  await seedWorkspace();
  const query = ListCompetitorsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  res.json(ListCompetitorsResponse.parse(await competitorsDto(query.data.projectId)));
});

router.post("/competitors", async (req, res): Promise<void> => {
  const body = CreateCompetitorBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const count = await db
    .select({ id: competitorsTable.id })
    .from(competitorsTable)
    .where(eq(competitorsTable.projectId, body.data.projectId));
  if (count.length >= 3) {
    res.status(400).json({ error: "A project can have at most three competitors" });
    return;
  }
  const [competitor] = await db.insert(competitorsTable).values(body.data).returning();
  res.status(201).json(
    CreateCompetitorResult.parse({
      ...competitor,
      posts: [],
    }),
  );
});

router.post("/competitors/sync", async (req, res): Promise<void> => {
  const body = SyncCompetitorsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const competitors = await db
    .select()
    .from(competitorsTable)
    .where(eq(competitorsTable.projectId, body.data.projectId));
  for (const competitor of competitors) {
    const sourceText = await readSource(competitor.url);
    const signals = await askMistralJson<Array<{ text: string; idea: string }>>(
      [
        {
          role: "system",
          content:
            "Ты аналитик контента. Из текста сайта выдели ровно 2 свежих контентных сигнала. Верни JSON-массив с объектами text и idea на русском. Не выдумывай факты, если текста мало — анализируй позиционирование и публичные формулировки.",
        },
        {
          role: "user",
          content: JSON.stringify({
            competitor: competitor.name,
            url: competitor.url,
            sourceText,
          }),
        },
      ],
      [
        {
          text: `${competitor.name}: свежий взгляд на то, как сделать продукт понятнее для клиента.`,
          idea: "Показать один практический принцип изнутри",
        },
        {
          text: "Сильные бренды объясняют не только что они делают, но и почему это важно сейчас.",
          idea: "Связать продукт с моментом клиента",
        },
      ],
    );
    await db.delete(competitorPostsTable).where(eq(competitorPostsTable.competitorId, competitor.id));
    await db.insert(competitorPostsTable).values(
      signals.slice(0, 2).map((signal) => ({
        competitorId: competitor.id,
        text: signal.text,
        idea: signal.idea,
      })),
    );
    await db
      .update(competitorsTable)
      .set({ lastSync: new Date() })
      .where(eq(competitorsTable.id, competitor.id));
  }
  res.json(SyncCompetitorsResponse.parse(await competitorsDto(body.data.projectId)));
});

router.get("/calendar", async (req, res): Promise<void> => {
  await seedWorkspace();
  const query = ListScheduleQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  res.json(ListScheduleResponse.parse(await scheduleDto(query.data.projectId)));
});

router.post("/calendar", async (req, res): Promise<void> => {
  const body = SchedulePostBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [item] = await db.insert(scheduleTable).values({
    projectId: body.data.projectId,
    postId: body.data.postId,
    scheduledDate: dateOnly(body.data.date),
    time: body.data.time,
    status: "planned",
  }).returning();
  await db
    .update(postsTable)
    .set({ status: "scheduled" })
    .where(eq(postsTable.id, body.data.postId));
  if (body.data.channelIds?.length) {
    const scheduledAt = new Date(`${body.data.date}T${body.data.time}:00`);
    await db.insert(publishingJobsTable).values(
      body.data.channelIds.map((channelId) => ({
        userId: currentSession(req)?.id ?? "",
        postId: body.data.postId,
        channelId,
        scheduledAt,
        status: "pending",
      })),
    );
  }
  const result = (await scheduleDto(body.data.projectId)).find(
    (candidate) => candidate.id === item.id,
  );
  res.status(201).json(SchedulePostResponse.parse(result));
});

router.patch("/calendar/:id", async (req, res): Promise<void> => {
  const params = UpdateScheduleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateScheduleBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(scheduleTable)
    .where(eq(scheduleTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Schedule item not found" });
    return;
  }
  const update: Partial<typeof scheduleTable.$inferInsert> = {};
  if (body.data.date !== undefined) update.scheduledDate = dateOnly(body.data.date);
  if (body.data.time !== undefined) update.time = body.data.time;
  let requestedStatus = body.data.status;
  if (requestedStatus === "published") {
    const jobs = await db
      .select()
      .from(publishingJobsTable)
      .where(
        and(
          eq(publishingJobsTable.postId, existing.postId),
          eq(publishingJobsTable.userId, currentSession(req)?.id ?? ""),
          eq(publishingJobsTable.status, "pending"),
        ),
      );
    if (jobs.length) {
      let published = 0;
      for (const job of jobs) {
        const [channel] = await db
          .select()
          .from(socialChannelsTable)
          .where(
            and(
              eq(socialChannelsTable.id, job.channelId),
              eq(socialChannelsTable.userId, currentSession(req)?.id ?? ""),
            ),
          );
        if (!channel) continue;
        try {
          const [post] = await db.select().from(postsTable).where(eq(postsTable.id, existing.postId));
          const externalId = await publishToChannel(channel, `${post?.title ?? ""}\n\n${post?.text ?? ""}`.trim());
          await db.update(publishingJobsTable).set({
            status: "published",
            externalId,
            publishedAt: new Date(),
            error: null,
          }).where(eq(publishingJobsTable.id, job.id));
          published += 1;
        } catch (error) {
          await db.update(publishingJobsTable).set({
            status: "failed",
            error: error instanceof Error ? error.message : "Ошибка публикации",
          }).where(eq(publishingJobsTable.id, job.id));
        }
      }
      if (published) {
        await db.update(postsTable).set({ status: "published" }).where(eq(postsTable.id, existing.postId));
      }
      requestedStatus = published ? "published" : "failed";
    } else {
      res.status(400).json({ error: "Для автопубликации сначала выберите подключённые каналы" });
      return;
    }
  }
  if (requestedStatus !== undefined) update.status = requestedStatus;
  const [item] = await db
    .update(scheduleTable)
    .set(update)
    .where(eq(scheduleTable.id, params.data.id))
    .returning();
  const result = (await scheduleDto(item.projectId)).find((candidate) => candidate.id === item.id);
  res.json(UpdateScheduleResponse.parse(result));
});

export default router;