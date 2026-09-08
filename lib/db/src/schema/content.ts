import { createInsertSchema } from "drizzle-zod";
import {
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const projectsTable = pgTable("content_projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sourceUrl: text("source_url").notNull(),
  industry: text("industry").notNull().default(""),
  audience: text("audience").notNull().default(""),
  tone: text("tone").notNull().default(""),
  usp: text("usp").notNull().default(""),
  values: text("values").array().notNull().default([]),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const postsTable = pgTable("content_posts", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id),
  title: text("title").notNull(),
  goal: text("goal").notNull(),
  format: text("format").notNull(),
  text: text("text").notNull(),
  imageUrl: text("image_url"),
  status: text("status").notNull().default("draft"),
  variant: integer("variant").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const competitorsTable = pgTable("content_competitors", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id),
  name: text("name").notNull(),
  url: text("url").notNull(),
  lastSync: timestamp("last_sync", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const competitorPostsTable = pgTable("content_competitor_posts", {
  id: serial("id").primaryKey(),
  competitorId: integer("competitor_id")
    .notNull()
    .references(() => competitorsTable.id),
  text: text("text").notNull(),
  postedAt: timestamp("posted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  idea: text("idea").notNull(),
});

export const scheduleTable = pgTable("content_schedule", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id),
  postId: integer("post_id")
    .notNull()
    .references(() => postsTable.id),
  scheduledDate: date("scheduled_date", { mode: "string" }).notNull(),
  time: text("time").notNull(),
  status: text("status").notNull().default("planned"),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  createdAt: true,
});
export const insertPostSchema = createInsertSchema(postsTable).omit({
  id: true,
  createdAt: true,
});
export const insertCompetitorSchema = createInsertSchema(competitorsTable).omit({
  id: true,
  lastSync: true,
});
export const insertCompetitorPostSchema = createInsertSchema(
  competitorPostsTable,
).omit({ id: true, postedAt: true });
export const insertScheduleSchema = createInsertSchema(scheduleTable).omit({
  id: true,
});

export type Project = typeof projectsTable.$inferSelect;
export type Post = typeof postsTable.$inferSelect;
export type Competitor = typeof competitorsTable.$inferSelect;
export type CompetitorPost = typeof competitorPostsTable.$inferSelect;
export type ScheduleItem = typeof scheduleTable.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type InsertPost = z.infer<typeof insertPostSchema>;
export type InsertCompetitor = z.infer<typeof insertCompetitorSchema>;
export type InsertCompetitorPost = z.infer<typeof insertCompetitorPostSchema>;
export type InsertSchedule = z.infer<typeof insertScheduleSchema>;