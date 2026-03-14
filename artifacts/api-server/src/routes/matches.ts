import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { matchesTable, teamsTable, leaguesTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";

const router: IRouter = Router();

function formatTeam(team: { id: number; name: string; shortName: string | null; logoUrl: string | null; leagueId: number | null }) {
  return {
    id: team.id,
    name: team.name,
    shortName: team.shortName,
    logoUrl: team.logoUrl,
    leagueId: team.leagueId,
  };
}

function formatLeague(league: { id: number; name: string; country: string; logoUrl: string | null }) {
  return {
    id: league.id,
    name: league.name,
    country: league.country,
    logoUrl: league.logoUrl,
  };
}

router.get("/matches", async (req, res) => {
  try {
    const dateStr = (req.query.date as string) || new Date().toISOString().split("T")[0];
    const leagueIdParam = req.query.leagueId ? Number(req.query.leagueId) : null;

    const homeTeam = db.select().from(teamsTable).as("home_team");
    const awayTeam = db.select().from(teamsTable).as("away_team");
    const league = db.select().from(leaguesTable).as("league");

    let query = db
      .select({
        match: matchesTable,
        homeTeam: {
          id: homeTeam.id,
          name: homeTeam.name,
          shortName: homeTeam.shortName,
          logoUrl: homeTeam.logoUrl,
          leagueId: homeTeam.leagueId,
        },
        awayTeam: {
          id: awayTeam.id,
          name: awayTeam.name,
          shortName: awayTeam.shortName,
          logoUrl: awayTeam.logoUrl,
          leagueId: awayTeam.leagueId,
        },
        league: {
          id: league.id,
          name: league.name,
          country: league.country,
          logoUrl: league.logoUrl,
        },
      })
      .from(matchesTable)
      .innerJoin(homeTeam, eq(matchesTable.homeTeamId, homeTeam.id))
      .innerJoin(awayTeam, eq(matchesTable.awayTeamId, awayTeam.id))
      .innerJoin(league, eq(matchesTable.leagueId, league.id))
      .where(
        and(
          sql`DATE(${matchesTable.kickoffTime}) = ${dateStr}`,
          leagueIdParam ? eq(matchesTable.leagueId, leagueIdParam) : undefined
        )
      )
      .orderBy(matchesTable.kickoffTime);

    const rows = await query;

    const result = rows.map((r) => ({
      id: r.match.id,
      homeTeam: formatTeam(r.homeTeam),
      awayTeam: formatTeam(r.awayTeam),
      league: formatLeague(r.league),
      kickoffTime: r.match.kickoffTime.toISOString(),
      status: r.match.status,
      homeScore: r.match.homeScore,
      awayScore: r.match.awayScore,
      homeWinProbability: r.match.homeWinProbability,
      drawProbability: r.match.drawProbability,
      awayWinProbability: r.match.awayWinProbability,
      homeOdds: r.match.homeOdds,
      drawOdds: r.match.drawOdds,
      awayOdds: r.match.awayOdds,
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/matches/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid match ID" });
      return;
    }

    const homeTeam = db.select().from(teamsTable).as("home_team");
    const awayTeam = db.select().from(teamsTable).as("away_team");
    const league = db.select().from(leaguesTable).as("league");

    const rows = await db
      .select({
        match: matchesTable,
        homeTeam: {
          id: homeTeam.id,
          name: homeTeam.name,
          shortName: homeTeam.shortName,
          logoUrl: homeTeam.logoUrl,
          leagueId: homeTeam.leagueId,
        },
        awayTeam: {
          id: awayTeam.id,
          name: awayTeam.name,
          shortName: awayTeam.shortName,
          logoUrl: awayTeam.logoUrl,
          leagueId: awayTeam.leagueId,
        },
        league: {
          id: league.id,
          name: league.name,
          country: league.country,
          logoUrl: league.logoUrl,
        },
      })
      .from(matchesTable)
      .innerJoin(homeTeam, eq(matchesTable.homeTeamId, homeTeam.id))
      .innerJoin(awayTeam, eq(matchesTable.awayTeamId, awayTeam.id))
      .innerJoin(league, eq(matchesTable.leagueId, league.id))
      .where(eq(matchesTable.id, id));

    if (rows.length === 0) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    const r = rows[0];

    res.json({
      id: r.match.id,
      homeTeam: formatTeam(r.homeTeam),
      awayTeam: formatTeam(r.awayTeam),
      league: formatLeague(r.league),
      kickoffTime: r.match.kickoffTime.toISOString(),
      status: r.match.status,
      homeScore: r.match.homeScore,
      awayScore: r.match.awayScore,
      homeWinProbability: r.match.homeWinProbability,
      drawProbability: r.match.drawProbability,
      awayWinProbability: r.match.awayWinProbability,
      homeOdds: r.match.homeOdds,
      drawOdds: r.match.drawOdds,
      awayOdds: r.match.awayOdds,
      analysis: {
        homeOffensiveAvg: r.match.homeOffensiveAvg ?? 1.5,
        homeDefensiveAvg: r.match.homeDefensiveAvg ?? 1.2,
        awayOffensiveAvg: r.match.awayOffensiveAvg ?? 1.3,
        awayDefensiveAvg: r.match.awayDefensiveAvg ?? 1.4,
        homeRecentForm: r.match.homeRecentForm ?? "WWDLW",
        awayRecentForm: r.match.awayRecentForm ?? "WDLWL",
        over25Probability: r.match.over25Probability ?? 0.55,
        bttsProbalility: r.match.bttsProbability ?? 0.48,
        expectedGoals: r.match.expectedGoals ?? 2.6,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
