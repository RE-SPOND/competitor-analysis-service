import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const analyses = sqliteTable("analyses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectUrl: text("project_url").notNull(),
  description: text("description").notNull(),
  region: text("region").notNull(),
  resultJson: text("result_json").notNull(),
  createdAt: text("created_at").notNull(),
});
