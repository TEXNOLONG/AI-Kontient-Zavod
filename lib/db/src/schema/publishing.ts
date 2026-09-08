import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const socialChannelsTable = pgTable("social_channels", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  name: text("name").notNull(),
  target: text("target").notNull(),
  credentials: text("credentials").notNull(),
  status: text("status").notNull().default("connected"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const publishingJobsTable = pgTable("publishing_jobs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  postId: integer("post_id").notNull(),
  channelId: integer("channel_id").notNull().references(() => socialChannelsTable.id),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("pending"),
  externalId: text("external_id"),
  error: text("error"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSocialChannelSchema = createInsertSchema(socialChannelsTable).omit({
  id: true,
  createdAt: true,
});
export const insertPublishingJobSchema = createInsertSchema(publishingJobsTable).omit({
  id: true,
  createdAt: true,
});

export type SocialChannel = typeof socialChannelsTable.$inferSelect;
export type PublishingJob = typeof publishingJobsTable.$inferSelect;
export type InsertSocialChannel = z.infer<typeof insertSocialChannelSchema>;
export type InsertPublishingJob = z.infer<typeof insertPublishingJobSchema>;