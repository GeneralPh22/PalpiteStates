import { pgTable, serial, integer, real, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { matchesTable } from "./matches";

export const oddsTable = pgTable("odds", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull().references(() => matchesTable.id),
  bookmaker: text("bookmaker").notNull(),
  homeWin: real("home_win").notNull(),
  draw: real("draw").notNull(),
  awayWin: real("away_win").notNull(),
  over25: real("over25").notNull(),
  under25: real("under25").notNull(),
  bttsYes: real("btts_yes").notNull(),
  bttsNo: real("btts_no").notNull(),
});

export const insertOddsSchema = createInsertSchema(oddsTable).omit({ id: true });
export type InsertOdds = z.infer<typeof insertOddsSchema>;
export type Odds = typeof oddsTable.$inferSelect;
