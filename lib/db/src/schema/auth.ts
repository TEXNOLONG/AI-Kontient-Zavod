import { createInsertSchema } from "drizzle-zod";
import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const authUsersTable = pgTable("auth_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  emailIndex: uniqueIndex("auth_users_email_idx").on(table.email),
}));

export const insertAuthUserSchema = createInsertSchema(authUsersTable).omit({
  id: true,
  createdAt: true,
});

export type AuthUser = typeof authUsersTable.$inferSelect;
export type InsertAuthUser = z.infer<typeof insertAuthUserSchema>;