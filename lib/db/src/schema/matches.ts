import { pgTable, serial, integer, timestamp, text, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teamsTable } from "./teams";
import { leaguesTable } from "./leagues";

export const matchesTable = pgTable("matches", {
  id: serial("id").primaryKey(),
  homeTeamId: integer("home_team_id").notNull().references(() => teamsTable.id),
  awayTeamId: integer("away_team_id").notNull().references(() => teamsTable.id),
  leagueId: integer("league_id").notNull().references(() => leaguesTable.id),
  kickoffTime: timestamp("kickoff_time").notNull(),
  status: text("status").notNull().default("scheduled"),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  homeWinProbability: real("home_win_probability"),
  drawProbability: real("draw_probability"),
  awayWinProbability: real("away_win_probability"),
  homeOdds: real("home_odds"),
  drawOdds: real("draw_odds"),
  awayOdds: real("away_odds"),
  homeOffensiveAvg: real("home_offensive_avg"),
  homeDefensiveAvg: real("home_defensive_avg"),
  awayOffensiveAvg: real("away_offensive_avg"),
  awayDefensiveAvg: real("away_defensive_avg"),
  homeRecentForm: text("home_recent_form"),
  awayRecentForm: text("away_recent_form"),
  over25Probability: real("over25_probability"),
  bttsProbability: real("btts_probability"),
  expectedGoals: real("expected_goals"),
});

export const insertMatchSchema = createInsertSchema(matchesTable).omit({ id: true });
export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type Match = typeof matchesTable.$inferSelect;
