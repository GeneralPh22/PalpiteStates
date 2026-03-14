import { pgTable, serial, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { playersTable } from "./players";
import { matchesTable } from "./matches";

export const playerStatsTable = pgTable("player_stats", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => playersTable.id),
  matchId: integer("match_id").notNull().references(() => matchesTable.id),
  goals: integer("goals").notNull().default(0),
  assists: integer("assists").notNull().default(0),
  shotsOnTarget: integer("shots_on_target").notNull().default(0),
  totalShots: integer("total_shots").notNull().default(0),
  foulsCommitted: integer("fouls_committed").notNull().default(0),
  foulsSuffered: integer("fouls_suffered").notNull().default(0),
  tackles: integer("tackles").notNull().default(0),
  yellowCards: integer("yellow_cards").notNull().default(0),
  redCards: integer("red_cards").notNull().default(0),
  minutesPlayed: real("minutes_played").notNull().default(90),
});

export const insertPlayerStatsSchema = createInsertSchema(playerStatsTable).omit({ id: true });
export type InsertPlayerStats = z.infer<typeof insertPlayerStatsSchema>;
export type PlayerStats = typeof playerStatsTable.$inferSelect;
