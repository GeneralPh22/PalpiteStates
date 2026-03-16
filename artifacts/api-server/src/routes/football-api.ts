import { Router, type IRouter } from "express";

const router: IRouter = Router();

const API_BASE = "https://v3.football.api-sports.io";

const cache = new Map<string, { data: unknown; ts: number }>();
const ODDS_TTL = 5 * 60 * 1000;       // 5 minutes
const STATS_TTL = 10 * 60 * 1000;     // 10 minutes
const MATCH_TTL = 2 * 60 * 1000;      // 2 minutes

let apiSuspended = false;
const SUSPENDED_CACHE_TTL = 5 * 60 * 1000;
let lastSuspendedCheck = 0;

async function apiFetch(path: string, ttl = MATCH_TTL): Promise<{ data: any; ok: boolean }> {
  if (apiSuspended && Date.now() - lastSuspendedCheck < SUSPENDED_CACHE_TTL) {
    return { data: null, ok: false };
  }

  const cacheKey = path;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ttl) return { data: cached.data, ok: true };

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return { data: null, ok: false };

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "x-apisports-key": apiKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[api-football] HTTP ${res.status} for ${path}`);
      return { data: null, ok: false };
    }
    const data = await res.json();

    if (data.errors && Object.keys(data.errors).length > 0) {
      const errMsg = JSON.stringify(data.errors);
      const isSuspended = errMsg.toLowerCase().includes("suspend") || errMsg.toLowerCase().includes("access");
      const isRateLimit = errMsg.toLowerCase().includes("ratelimit") || errMsg.toLowerCase().includes("too many");
      if (isSuspended || isRateLimit) {
        apiSuspended = true;
        lastSuspendedCheck = Date.now();
        if (isSuspended) console.warn(`[api-football] Account suspended.`);
      }
      return { data: null, ok: false };
    }

    apiSuspended = false;
    lastSuspendedCheck = 0;
    cache.set(cacheKey, { data, ts: Date.now() });
    return { data, ok: true };
  } catch (err: any) {
    console.error(`[api-football] fetch error for ${path}:`, err.message);
    return { data: null, ok: false };
  }
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
  return (1 - poissonProb(lambdaHome, 0)) * (1 - poissonProb(lambdaAway, 0));
}

function calcMatchProbabilities(homeAttack: number, homeDefend: number, awayAttack: number, awayDefend: number) {
  const leagueAvg = 1.35;
  const lambdaHome = (homeAttack * awayDefend) / leagueAvg;
  const lambdaAway = (awayAttack * homeDefend) / leagueAvg;
  const totalLambda = lambdaHome + lambdaAway;

  const over25 = Math.min(0.95, Math.max(0.05, over25Prob(totalLambda)));
  const btts = Math.min(0.95, Math.max(0.05, bttsProbability(lambdaHome, lambdaAway)));

  let homeWin = 0, draw = 0, awayWin = 0;
  for (let h = 0; h <= 8; h++) {
    for (let a = 0; a <= 8; a++) {
      const p = poissonProb(lambdaHome, h) * poissonProb(lambdaAway, a);
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
    }
  }

  return {
    lambdaHome: parseFloat(lambdaHome.toFixed(3)),
    lambdaAway: parseFloat(lambdaAway.toFixed(3)),
    probabilities: {
      homeWin: parseFloat(homeWin.toFixed(3)),
      draw: parseFloat(draw.toFixed(3)),
      awayWin: parseFloat(awayWin.toFixed(3)),
      over25: parseFloat(over25.toFixed(3)),
      under25: parseFloat((1 - over25).toFixed(3)),
      btts: parseFloat(btts.toFixed(3)),
      playerGoal: parseFloat(Math.min(0.9, Math.max(0.05, 1 - poissonProb(lambdaHome, 0))).toFixed(3)),
      cornerOver9: parseFloat(Math.min(0.9, 0.4 + totalLambda * 0.08).toFixed(3)),
      over35cards: parseFloat(Math.min(0.8, 0.25 + totalLambda * 0.06).toFixed(3)),
    },
    expectedGoals: parseFloat(totalLambda.toFixed(2)),
  };
}

function mapFixture(item: any) {
  return {
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
  };
}

// ── matches-today ──────────────────────────────────────────────────────────────
router.get("/matches-today", async (_req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const { data, ok } = await apiFetch(`/fixtures?date=${today}`, MATCH_TTL);

    if (ok && data && (data.results ?? 0) > 0) {
      const matches = (data.response ?? []).map(mapFixture);
      return res.json({ total: matches.length, matches, demo: false });
    }

    return res.json({
      total: 0,
      matches: [],
      demo: false,
      apiStatus: apiSuspended ? "suspended" : "unavailable",
    });
  } catch (err: any) {
    console.error("[matches-today]", err.message);
    return res.json({ total: 0, matches: [], demo: false });
  }
});

// ── fixture/:id ────────────────────────────────────────────────────────────────
router.get("/fixture/:id", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);
    if (isNaN(fixtureId)) {
      return res.status(400).json({ error: "Invalid fixture ID" });
    }

    const { data, ok } = await apiFetch(`/fixtures?id=${fixtureId}`, MATCH_TTL);

    if (ok && data?.response?.[0]) {
      return res.json({ ...mapFixture(data.response[0]), demo: false });
    }

    return res.status(404).json({ error: "Fixture not found or API unavailable" });
  } catch (err: any) {
    console.error("[fixture/:id]", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── fixture/:id/stats ──────────────────────────────────────────────────────────
router.get("/fixture/:id/stats", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);
    const { data, ok } = await apiFetch(`/fixtures/statistics?fixture=${fixtureId}`, STATS_TTL);

    if (ok && data?.response?.length > 0) {
      return res.json({ stats: data.response, demo: false });
    }

    return res.json({ stats: [], available: false });
  } catch (err: any) {
    console.error("[fixture/stats]", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── fixture/:id/h2h ────────────────────────────────────────────────────────────
router.get("/fixture/:id/h2h", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);

    const { data: fixData, ok: fixOk } = await apiFetch(`/fixtures?id=${fixtureId}`, MATCH_TTL);
    if (!fixOk || !fixData?.response?.[0]) {
      return res.json({ h2h: [], available: false });
    }

    const item = fixData.response[0];
    const homeId = item.teams.home.id;
    const awayId = item.teams.away.id;

    const { data, ok } = await apiFetch(
      `/fixtures/headtohead?h2h=${homeId}-${awayId}&last=6`,
      STATS_TTL
    );

    if (ok && data?.response?.length > 0) {
      return res.json({
        h2h: data.response.map((h: any) => ({
          date: h.fixture.date,
          homeTeam: { name: h.teams.home.name, logo: h.teams.home.logo },
          awayTeam: { name: h.teams.away.name, logo: h.teams.away.logo },
          score: { home: h.goals.home, away: h.goals.away },
          status: h.fixture.status.short,
        })),
        demo: false,
      });
    }

    return res.json({ h2h: [], available: false });
  } catch (err: any) {
    console.error("[fixture/h2h]", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── fixture/:id/analysis ───────────────────────────────────────────────────────
router.get("/fixture/:id/analysis", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);

    const { data: fixData, ok: fixOk } = await apiFetch(`/fixtures?id=${fixtureId}`, MATCH_TTL);
    if (!fixOk || !fixData?.response?.[0]) {
      return res.status(404).json({ error: "Fixture not found or API unavailable" });
    }

    const item = fixData.response[0];
    const homeTeamId = item.teams.home.id;
    const awayTeamId = item.teams.away.id;
    const leagueId = item.league.id;

    const [{ data: homeData, ok: homeOk }, { data: awayData, ok: awayOk }] = await Promise.all([
      apiFetch(`/teams/statistics?team=${homeTeamId}&league=${leagueId}&season=2024`, STATS_TTL),
      apiFetch(`/teams/statistics?team=${awayTeamId}&league=${leagueId}&season=2024`, STATS_TTL),
    ]);

    const avgGoals = (s: any, type: "for" | "against"): number => {
      if (!s) return 1.3;
      const g = type === "for" ? s.goals?.for : s.goals?.against;
      const total = g?.total?.total ?? 0;
      const played = s.fixtures?.played?.total ?? 1;
      return played > 0 ? total / played : 1.3;
    };

    const hs = homeOk ? homeData?.response : null;
    const as_ = awayOk ? awayData?.response : null;

    const result = calcMatchProbabilities(
      avgGoals(hs, "for"),
      avgGoals(hs, "against"),
      avgGoals(as_, "for"),
      avgGoals(as_, "against")
    );

    const mapStats = (s: any) => s ? {
      played: s.fixtures?.played?.total,
      wins: s.fixtures?.wins?.total,
      draws: s.fixtures?.draws?.total,
      losses: s.fixtures?.loses?.total,
      goalsFor: s.goals?.for?.total?.total,
      goalsAgainst: s.goals?.against?.total?.total,
      form: s.form,
    } : null;

    return res.json({
      ...result,
      homeStats: mapStats(hs),
      awayStats: mapStats(as_),
      demo: false,
    });
  } catch (err: any) {
    console.error("[fixture/analysis]", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── fixture/:id/odds ───────────────────────────────────────────────────────────
router.get("/fixture/:id/odds", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);
    const { data, ok } = await apiFetch(`/odds?fixture=${fixtureId}`, ODDS_TTL);

    if (ok && data?.response?.[0]) {
      const bookmakers: any[] = data.response[0].bookmakers ?? [];
      const findOdd = (bms: any[], betName: string, valueName: string): number | null => {
        for (const bm of bms) {
          for (const bet of bm.bets ?? []) {
            if (bet.name === betName) {
              const v = (bet.values ?? []).find((x: any) => x.value === valueName);
              if (v) return parseFloat(v.odd);
            }
          }
        }
        return null;
      };
      return res.json({
        available: true,
        fixtureId,
        odds: {
          home: findOdd(bookmakers, "Match Winner", "Home"),
          draw: findOdd(bookmakers, "Match Winner", "Draw"),
          away: findOdd(bookmakers, "Match Winner", "Away"),
          over25: findOdd(bookmakers, "Goals Over/Under", "Over 2.5"),
          under25: findOdd(bookmakers, "Goals Over/Under", "Under 2.5"),
          bttsYes: findOdd(bookmakers, "Both Teams Score", "Yes"),
          bttsNo: findOdd(bookmakers, "Both Teams Score", "No"),
        },
        bookmakers: bookmakers.slice(0, 5).map((bm: any) => bm.name),
        demo: false,
      });
    }

    return res.json({ available: false, odds: null });
  } catch (err: any) {
    console.error("[fixture/odds]", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── player-stats ───────────────────────────────────────────────────────────────
router.get("/player-stats", async (req, res) => {
  try {
    const { id, season = "2024" } = req.query as Record<string, string>;
    if (!id) return res.status(400).json({ error: "Query param 'id' is required" });

    const { data, ok } = await apiFetch(`/players?id=${id}&season=${season}`, STATS_TTL);
    const player = data?.response?.[0];
    if (!ok || !player) {
      return res.status(404).json({ error: "Player not found or API unavailable" });
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
    return res.json({ ...player, per90 });
  } catch (err: any) {
    console.error("[player-stats]", err.message);
    return res.status(500).json({ error: err.message ?? "Internal server error" });
  }
});

// ── team-stats ─────────────────────────────────────────────────────────────────
router.get("/team-stats", async (req, res) => {
  try {
    const { team, league, season = "2024" } = req.query as Record<string, string>;
    if (!team || !league) return res.status(400).json({ error: "team and league are required" });

    const { data, ok } = await apiFetch(`/teams/statistics?team=${team}&league=${league}&season=${season}`, STATS_TTL);
    if (!ok || !data?.response) return res.status(404).json({ error: "Team stats not found or API unavailable" });
    return res.json(data.response);
  } catch (err: any) {
    console.error("[team-stats]", err.message);
    return res.status(500).json({ error: err.message ?? "Internal server error" });
  }
});

// ── live-odds (legacy alias) ───────────────────────────────────────────────────
router.get("/live-odds", async (req, res) => {
  try {
    const { fixture } = req.query as Record<string, string>;
    if (!fixture) return res.status(400).json({ error: "fixture is required" });

    const { data, ok } = await apiFetch(`/odds?fixture=${fixture}`, ODDS_TTL);

    if (ok && data?.response?.[0]) {
      const bookmakers: any[] = data.response[0].bookmakers ?? [];
      const findOdd = (bms: any[], betName: string, valueName: string): number | null => {
        for (const bm of bms) {
          for (const bet of bm.bets ?? []) {
            if (bet.name === betName) {
              const v = (bet.values ?? []).find((x: any) => x.value === valueName);
              if (v) return parseFloat(v.odd);
            }
          }
        }
        return null;
      };
      return res.json({
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
      });
    }

    return res.json({ available: false, odds: null });
  } catch (err: any) {
    console.error("[live-odds]", err.message);
    return res.status(500).json({ error: err.message ?? "Internal server error" });
  }
});

// ── fixture-analysis (legacy alias) ───────────────────────────────────────────
router.get("/fixture-analysis", async (req, res) => {
  try {
    const { homeTeam, awayTeam, league, season = "2024" } = req.query as Record<string, string>;
    if (!homeTeam || !awayTeam || !league) {
      return res.status(400).json({ error: "homeTeam, awayTeam and league are required" });
    }

    const [{ data: homeData, ok: homeOk }, { data: awayData, ok: awayOk }] = await Promise.all([
      apiFetch(`/teams/statistics?team=${homeTeam}&league=${league}&season=${season}`, STATS_TTL),
      apiFetch(`/teams/statistics?team=${awayTeam}&league=${league}&season=${season}`, STATS_TTL),
    ]);

    if (!homeOk || !awayOk) {
      return res.status(503).json({ error: "API unavailable" });
    }

    const avgGoals = (stats: any, type: "for" | "against"): number => {
      if (!stats) return 1.3;
      const g = type === "for" ? stats.goals?.for : stats.goals?.against;
      const total = g?.total?.total ?? 0;
      const played = stats.fixtures?.played?.total ?? 1;
      return played > 0 ? total / played : 1.3;
    };

    const hs = homeData?.response;
    const as_ = awayData?.response;

    const result = calcMatchProbabilities(
      avgGoals(hs, "for"), avgGoals(hs, "against"),
      avgGoals(as_, "for"), avgGoals(as_, "against")
    );

    return res.json({
      ...result,
      homeStats: hs ? {
        played: hs.fixtures?.played?.total,
        wins: hs.fixtures?.wins?.total,
        draws: hs.fixtures?.draws?.total,
        losses: hs.fixtures?.loses?.total,
        goalsFor: hs.goals?.for?.total?.total,
        goalsAgainst: hs.goals?.against?.total?.total,
        form: hs.form,
      } : null,
      awayStats: as_ ? {
        played: as_.fixtures?.played?.total,
        wins: as_.fixtures?.wins?.total,
        draws: as_.fixtures?.draws?.total,
        losses: as_.fixtures?.loses?.total,
        goalsFor: as_.goals?.for?.total?.total,
        goalsAgainst: as_.goals?.against?.total?.total,
        form: as_.form,
      } : null,
      demo: false,
    });
  } catch (err: any) {
    console.error("[fixture-analysis]", err.message);
    return res.status(500).json({ error: err.message ?? "Internal server error" });
  }
});

// ── api-status ─────────────────────────────────────────────────────────────────
router.get("/api-status", (_req, res) => {
  res.json({ suspended: apiSuspended, cacheSize: cache.size });
});

export default router;
