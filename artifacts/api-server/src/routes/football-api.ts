import { Router, type IRouter } from "express";

const router: IRouter = Router();

const API_BASE = "https://v3.football.api-sports.io";

async function apiFetch(path: string) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("API_FOOTBALL_KEY is not set");
  }
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });
  if (!res.ok) {
    throw new Error(`API-Football responded with ${res.status}`);
  }
  return res.json();
}

router.get("/matches-today", async (_req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const data = await apiFetch(`/fixtures?date=${today}`);

    const matches = (data.response ?? []).map((item: any) => ({
      id: item.fixture.id,
      date: item.fixture.date,
      status: {
        short: item.fixture.status.short,
        long: item.fixture.status.long,
        elapsed: item.fixture.status.elapsed,
      },
      league: {
        id: item.league.id,
        name: item.league.name,
        country: item.league.country,
        logo: item.league.logo,
        round: item.league.round,
      },
      homeTeam: {
        id: item.teams.home.id,
        name: item.teams.home.name,
        logo: item.teams.home.logo,
        winner: item.teams.home.winner,
      },
      awayTeam: {
        id: item.teams.away.id,
        name: item.teams.away.name,
        logo: item.teams.away.logo,
        winner: item.teams.away.winner,
      },
      score: {
        home: item.goals.home,
        away: item.goals.away,
      },
    }));

    res.json({ total: matches.length, matches });
  } catch (err: any) {
    console.error("[matches-today]", err.message);
    res.status(500).json({ error: err.message ?? "Internal server error" });
  }
});

router.get("/player-stats", async (req, res) => {
  try {
    const { id, season = "2024" } = req.query as Record<string, string>;
    if (!id) {
      res.status(400).json({ error: "Query param 'id' is required" });
      return;
    }
    const data = await apiFetch(`/players?id=${id}&season=${season}`);
    const player = data.response?.[0];
    if (!player) {
      res.status(404).json({ error: "Player not found" });
      return;
    }
    res.json(player);
  } catch (err: any) {
    console.error("[player-stats]", err.message);
    res.status(500).json({ error: err.message ?? "Internal server error" });
  }
});

router.get("/team-stats", async (req, res) => {
  try {
    const { team, league, season = "2024" } = req.query as Record<string, string>;
    if (!team || !league) {
      res.status(400).json({ error: "Query params 'team' and 'league' are required" });
      return;
    }
    const data = await apiFetch(`/teams/statistics?team=${team}&league=${league}&season=${season}`);
    const stats = data.response;
    if (!stats) {
      res.status(404).json({ error: "Team stats not found" });
      return;
    }
    res.json(stats);
  } catch (err: any) {
    console.error("[team-stats]", err.message);
    res.status(500).json({ error: err.message ?? "Internal server error" });
  }
});

export default router;
