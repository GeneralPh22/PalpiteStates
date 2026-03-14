import { Router, type IRouter } from "express";

const router: IRouter = Router();

const API_BASE = "https://v3.football.api-sports.io";

const cache = new Map<string, { data: unknown; ts: number }>();
const ODDS_TTL = 5 * 60 * 1000;
const STATS_TTL = 24 * 60 * 60 * 1000;
const MATCH_TTL = 2 * 60 * 1000;

async function apiFetch(path: string, ttl = MATCH_TTL): Promise<any> {
  const cached = cache.get(path);
  if (cached && Date.now() - cached.ts < ttl) return cached.data;

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) throw new Error("API_FOOTBALL_KEY is not set");

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "x-apisports-key": apiKey },
  });
  if (!res.ok) throw new Error(`API-Football responded with ${res.status}`);
  const data = await res.json();
  cache.set(path, { data, ts: Date.now() });
  return data;
}

function poissonProb(lambda: number, k: number): number {
  let prob = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) prob *= lambda / i;
  return prob;
}

function over25Prob(lambda: number): number {
  return 1 - poissonProb(lambda, 0) - poissonProb(lambda, 1) - poissonProb(lambda, 2);
}

function bttsProbability(lambdaHome: number, lambdaAway: number): number {
  const homeScores = 1 - poissonProb(lambdaHome, 0);
  const awayScores = 1 - poissonProb(lambdaAway, 0);
  return homeScores * awayScores;
}

router.get("/matches-today", async (_req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const data = await apiFetch(`/fixtures?date=${today}`, MATCH_TTL);

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
    const data = await apiFetch(`/players?id=${id}&season=${season}`, STATS_TTL);
    const player = data.response?.[0];
    if (!player) {
      res.status(404).json({ error: "Player not found" });
      return;
    }

    const stats = player.statistics?.[0] ?? {};
    const minutes = stats.games?.minutes ?? 0;
    const factor = minutes > 0 ? 90 / minutes : 0;

    const per90 = {
      goals: ((stats.goals?.total ?? 0) * factor).toFixed(2),
      assists: ((stats.goals?.assists ?? 0) * factor).toFixed(2),
      shotsOnGoal: ((stats.shots?.on ?? 0) * factor).toFixed(2),
      totalShots: ((stats.shots?.total ?? 0) * factor).toFixed(2),
      foulsCommitted: ((stats.fouls?.committed ?? 0) * factor).toFixed(2),
      foulsSuffered: ((stats.fouls?.drawn ?? 0) * factor).toFixed(2),
      tackles: ((stats.tackles?.total ?? 0) * factor).toFixed(2),
      yellowCards: ((stats.cards?.yellow ?? 0) * factor).toFixed(2),
      redCards: ((stats.cards?.red ?? 0) * factor).toFixed(2),
    };

    res.json({ ...player, per90 });
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
    const data = await apiFetch(
      `/teams/statistics?team=${team}&league=${league}&season=${season}`,
      STATS_TTL
    );
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

router.get("/live-odds", async (req, res) => {
  try {
    const { fixture } = req.query as Record<string, string>;
    if (!fixture) {
      res.status(400).json({ error: "Query param 'fixture' is required" });
      return;
    }

    const data = await apiFetch(`/odds?fixture=${fixture}`, ODDS_TTL);
    const fixtureOdds = data.response?.[0];

    if (!fixtureOdds) {
      res.json({ available: false, odds: null });
      return;
    }

    const bookmakers: any[] = fixtureOdds.bookmakers ?? [];

    function findOdd(bookmakers: any[], betName: string, valueName: string): number | null {
      for (const bm of bookmakers) {
        for (const bet of bm.bets ?? []) {
          if (bet.name === betName) {
            const v = (bet.values ?? []).find((x: any) => x.value === valueName);
            if (v) return parseFloat(v.odd);
          }
        }
      }
      return null;
    }

    const result = {
      available: true,
      fixtureId: fixture,
      odds: {
        home: findOdd(bookmakers, "Match Winner", "Home"),
        draw: findOdd(bookmakers, "Match Winner", "Draw"),
        away: findOdd(bookmakers, "Match Winner", "Away"),
        over25: findOdd(bookmakers, "Goals Over/Under", "Over 2.5"),
        under25: findOdd(bookmakers, "Goals Over/Under", "Under 2.5"),
        bttsYes: findOdd(bookmakers, "Both Teams Score", "Yes"),
        bttsNo: findOdd(bookmakers, "Both Teams Score", "No"),
      },
      bookmakers: bookmakers.map((bm: any) => bm.name),
    };

    res.json(result);
  } catch (err: any) {
    console.error("[live-odds]", err.message);
    res.status(500).json({ error: err.message ?? "Internal server error" });
  }
});

router.get("/fixture-analysis", async (req, res) => {
  try {
    const { homeTeam, awayTeam, league, season = "2024" } = req.query as Record<string, string>;

    if (!homeTeam || !awayTeam || !league) {
      res.status(400).json({ error: "homeTeam, awayTeam and league are required" });
      return;
    }

    async function fetchTeamStats(teamId: string) {
      try {
        const data = await apiFetch(
          `/teams/statistics?team=${teamId}&league=${league}&season=${season}`,
          STATS_TTL
        );
        return data.response ?? null;
      } catch {
        return null;
      }
    }

    const [homeStats, awayStats] = await Promise.all([
      fetchTeamStats(homeTeam),
      fetchTeamStats(awayTeam),
    ]);

    function avgGoals(stats: any, type: "for" | "against"): number {
      if (!stats) return 1.3;
      const g = type === "for" ? stats.goals?.for : stats.goals?.against;
      const total = g?.total?.total ?? 0;
      const played = stats.fixtures?.played?.total ?? 1;
      return played > 0 ? total / played : 1.3;
    }

    const homeAttack = avgGoals(homeStats, "for");
    const homeDefend = avgGoals(homeStats, "against");
    const awayAttack = avgGoals(awayStats, "for");
    const awayDefend = avgGoals(awayStats, "against");

    const leagueAvg = 1.35;

    const lambdaHome = (homeAttack * awayDefend) / leagueAvg;
    const lambdaAway = (awayAttack * homeDefend) / leagueAvg;
    const totalLambda = lambdaHome + lambdaAway;

    const over25 = Math.min(0.95, Math.max(0.05, over25Prob(totalLambda)));
    const btts = Math.min(0.95, Math.max(0.05, bttsProbability(lambdaHome, lambdaAway)));

    let homeWin = 0;
    let draw = 0;
    let awayWin = 0;

    for (let h = 0; h <= 8; h++) {
      for (let a = 0; a <= 8; a++) {
        const p = poissonProb(lambdaHome, h) * poissonProb(lambdaAway, a);
        if (h > a) homeWin += p;
        else if (h === a) draw += p;
        else awayWin += p;
      }
    }

    const playerGoalProb = Math.min(0.9, Math.max(0.05, 1 - poissonProb(lambdaHome, 0)));
    const cornerOver9 = Math.min(0.9, 0.4 + totalLambda * 0.08);

    res.json({
      lambdaHome: parseFloat(lambdaHome.toFixed(3)),
      lambdaAway: parseFloat(lambdaAway.toFixed(3)),
      probabilities: {
        homeWin: parseFloat(homeWin.toFixed(3)),
        draw: parseFloat(draw.toFixed(3)),
        awayWin: parseFloat(awayWin.toFixed(3)),
        over25: parseFloat(over25.toFixed(3)),
        under25: parseFloat((1 - over25).toFixed(3)),
        btts: parseFloat(btts.toFixed(3)),
        playerGoal: parseFloat(playerGoalProb.toFixed(3)),
        cornerOver9: parseFloat(cornerOver9.toFixed(3)),
      },
      expectedGoals: parseFloat(totalLambda.toFixed(2)),
      homeStats: homeStats
        ? {
            played: homeStats.fixtures?.played?.total,
            wins: homeStats.fixtures?.wins?.total,
            draws: homeStats.fixtures?.draws?.total,
            losses: homeStats.fixtures?.loses?.total,
            goalsFor: homeStats.goals?.for?.total?.total,
            goalsAgainst: homeStats.goals?.against?.total?.total,
            form: homeStats.form,
          }
        : null,
      awayStats: awayStats
        ? {
            played: awayStats.fixtures?.played?.total,
            wins: awayStats.fixtures?.wins?.total,
            draws: awayStats.fixtures?.draws?.total,
            losses: awayStats.fixtures?.loses?.total,
            goalsFor: awayStats.goals?.for?.total?.total,
            goalsAgainst: awayStats.goals?.against?.total?.total,
            form: awayStats.form,
          }
        : null,
    });
  } catch (err: any) {
    console.error("[fixture-analysis]", err.message);
    res.status(500).json({ error: err.message ?? "Internal server error" });
  }
});

export default router;
