import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { oddsTable, matchesTable, teamsTable, leaguesTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/odds", async (req, res) => {
  try {
    const matchIdParam = req.query.matchId ? Number(req.query.matchId) : null;
    const dateStr = (req.query.date as string) || new Date().toISOString().split("T")[0];

    const homeTeam = db.select().from(teamsTable).as("home_team");
    const awayTeam = db.select().from(teamsTable).as("away_team");
    const league = db.select().from(leaguesTable).as("league");

    const condition = matchIdParam
      ? eq(matchesTable.id, matchIdParam)
      : sql`DATE(${matchesTable.kickoffTime}) = ${dateStr}`;

    const rows = await db
      .select({
        odd: oddsTable,
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
      .from(oddsTable)
      .innerJoin(matchesTable, eq(oddsTable.matchId, matchesTable.id))
      .innerJoin(homeTeam, eq(matchesTable.homeTeamId, homeTeam.id))
      .innerJoin(awayTeam, eq(matchesTable.awayTeamId, awayTeam.id))
      .innerJoin(league, eq(matchesTable.leagueId, league.id))
      .where(condition)
      .orderBy(matchesTable.kickoffTime, oddsTable.bookmaker);

    const matchMap = new Map<number, { matchId: number; match: object; odds: object[] }>();

    for (const r of rows) {
      if (!matchMap.has(r.match.id)) {
        matchMap.set(r.match.id, {
          matchId: r.match.id,
          match: {
            id: r.match.id,
            homeTeam: r.homeTeam,
            awayTeam: r.awayTeam,
            league: r.league,
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
          },
          odds: [],
        });
      }
      matchMap.get(r.match.id)!.odds.push({
        bookmaker: r.odd.bookmaker,
        homeWin: r.odd.homeWin,
        draw: r.odd.draw,
        awayWin: r.odd.awayWin,
        over25: r.odd.over25,
        under25: r.odd.under25,
        bttsYes: r.odd.bttsYes,
        bttsNo: r.odd.bttsNo,
      });
    }

    res.json(Array.from(matchMap.values()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
