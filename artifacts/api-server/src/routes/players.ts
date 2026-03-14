import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { playersTable, teamsTable, playerStatsTable, matchesTable } from "@workspace/db/schema";
import { eq, ilike, sql, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/players", async (req, res) => {
  try {
    const search = (req.query.search as string) || "";
    const teamId = req.query.teamId ? Number(req.query.teamId) : null;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (search) {
      conditions.push(ilike(playersTable.name, `%${search}%`));
    }
    if (teamId) {
      conditions.push(eq(playersTable.teamId, teamId));
    }

    const whereClause = conditions.length > 0
      ? conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`)
      : undefined;

    const [countResult, rows] = await Promise.all([
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(playersTable)
        .where(whereClause),
      db
        .select({
          player: playersTable,
          team: teamsTable,
        })
        .from(playersTable)
        .innerJoin(teamsTable, eq(playersTable.teamId, teamsTable.id))
        .where(whereClause)
        .orderBy(playersTable.name)
        .limit(limit)
        .offset(offset),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    const data = rows.map((r) => ({
      id: r.player.id,
      name: r.player.name,
      position: r.player.position,
      nationality: r.player.nationality,
      age: r.player.age,
      photoUrl: r.player.photoUrl,
      team: {
        id: r.team.id,
        name: r.team.name,
        shortName: r.team.shortName,
        logoUrl: r.team.logoUrl,
        leagueId: r.team.leagueId,
      },
    }));

    res.json({ data, total, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/players/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid player ID" });
      return;
    }

    const [playerRows, statsRows] = await Promise.all([
      db
        .select({ player: playersTable, team: teamsTable })
        .from(playersTable)
        .innerJoin(teamsTable, eq(playersTable.teamId, teamsTable.id))
        .where(eq(playersTable.id, id)),
      db
        .select({ stat: playerStatsTable, match: matchesTable })
        .from(playerStatsTable)
        .innerJoin(matchesTable, eq(playerStatsTable.matchId, matchesTable.id))
        .where(eq(playerStatsTable.playerId, id))
        .orderBy(desc(matchesTable.kickoffTime))
        .limit(10),
    ]);

    if (playerRows.length === 0) {
      res.status(404).json({ error: "Player not found" });
      return;
    }

    const { player, team } = playerRows[0];

    const matchesPlayed = statsRows.length;
    const totalMinutes = statsRows.reduce((s, r) => s + (r.stat.minutesPlayed ?? 90), 0);
    const per90Factor = totalMinutes > 0 ? 90 / totalMinutes : 0;

    const totals = statsRows.reduce(
      (acc, r) => ({
        goals: acc.goals + r.stat.goals,
        assists: acc.assists + r.stat.assists,
        shotsOnTarget: acc.shotsOnTarget + r.stat.shotsOnTarget,
        totalShots: acc.totalShots + r.stat.totalShots,
        foulsCommitted: acc.foulsCommitted + r.stat.foulsCommitted,
        foulsSuffered: acc.foulsSuffered + r.stat.foulsSuffered,
        tackles: acc.tackles + r.stat.tackles,
        yellowCards: acc.yellowCards + r.stat.yellowCards,
        redCards: acc.redCards + r.stat.redCards,
      }),
      { goals: 0, assists: 0, shotsOnTarget: 0, totalShots: 0, foulsCommitted: 0, foulsSuffered: 0, tackles: 0, yellowCards: 0, redCards: 0 }
    );

    const stats = {
      matchesPlayed,
      ...totals,
      goalsPer90: parseFloat((totals.goals * per90Factor).toFixed(2)),
      assistsPer90: parseFloat((totals.assists * per90Factor).toFixed(2)),
      shotsOnTargetPer90: parseFloat((totals.shotsOnTarget * per90Factor).toFixed(2)),
      totalShotsPer90: parseFloat((totals.totalShots * per90Factor).toFixed(2)),
      tacklesPer90: parseFloat((totals.tackles * per90Factor).toFixed(2)),
    };

    const recentMatches = statsRows.map((r) => ({
      matchId: r.match.id,
      date: r.match.kickoffTime.toISOString().split("T")[0],
      opponent: `Match #${r.match.id}`,
      result: r.match.homeScore != null && r.match.awayScore != null
        ? `${r.match.homeScore}-${r.match.awayScore}`
        : "TBD",
      goals: r.stat.goals,
      assists: r.stat.assists,
      shotsOnTarget: r.stat.shotsOnTarget,
      minutes: Math.round(r.stat.minutesPlayed ?? 90),
    }));

    res.json({
      id: player.id,
      name: player.name,
      position: player.position,
      nationality: player.nationality,
      age: player.age,
      photoUrl: player.photoUrl,
      team: {
        id: team.id,
        name: team.name,
        shortName: team.shortName,
        logoUrl: team.logoUrl,
        leagueId: team.leagueId,
      },
      stats,
      recentMatches,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
