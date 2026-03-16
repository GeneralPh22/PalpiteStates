import { Router, type IRouter } from "express";

const router: IRouter = Router();

const API_BASE = "https://v3.football.api-sports.io";

const cache = new Map<string, { data: unknown; ts: number }>();
const ODDS_TTL = 5 * 60 * 1000;       // 5 minutes
const STATS_TTL = 10 * 60 * 1000;     // 10 minutes
const MATCH_TTL = 2 * 60 * 1000;      // 2 minutes
const LEAGUES_TTL = 30 * 60 * 1000;   // 30 minutes

let apiSuspended = false;

const SUSPENDED_CACHE_TTL = 5 * 60 * 1000; // re-check API every 5 minutes
let lastSuspendedCheck = 0;

async function apiFetch(path: string, ttl = MATCH_TTL): Promise<{ data: any; ok: boolean }> {
  // Skip API call immediately if account is suspended (re-check every 5 min)
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
        if (!isRateLimit) console.warn(`[api-football] Account suspended — switching to demo mode.`);
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

// ── Demo fixture data ──────────────────────────────────────────────────────────
function buildDemoFixtures() {
  const now = new Date();
  const todayBase = now.toISOString().split("T")[0];

  const t = (h: number, m: number) => {
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  return [
    // LIVE matches
    {
      id: 99001,
      date: t(14, 0),
      status: { short: "2H", long: "Second Half", elapsed: 67 },
      league: { id: 2, name: "UEFA Champions League", country: "World", logo: "https://media.api-sports.io/football/leagues/2.png", round: "Round of 16" },
      homeTeam: { id: 541, name: "Real Madrid", logo: "https://media.api-sports.io/football/teams/541.png", winner: true },
      awayTeam: { id: 42, name: "Arsenal", logo: "https://media.api-sports.io/football/teams/42.png", winner: false },
      score: { home: 2, away: 1 },
    },
    {
      id: 99002,
      date: t(14, 30),
      status: { short: "1H", long: "First Half", elapsed: 34 },
      league: { id: 39, name: "Premier League", country: "England", logo: "https://media.api-sports.io/football/leagues/39.png", round: "Regular Season - 30" },
      homeTeam: { id: 50, name: "Manchester City", logo: "https://media.api-sports.io/football/teams/50.png", winner: null },
      awayTeam: { id: 47, name: "Tottenham", logo: "https://media.api-sports.io/football/teams/47.png", winner: null },
      score: { home: 1, away: 0 },
    },
    {
      id: 99003,
      date: t(13, 0),
      status: { short: "2H", long: "Second Half", elapsed: 52 },
      league: { id: 71, name: "Brasileirão Série A", country: "Brazil", logo: "https://media.api-sports.io/football/leagues/71.png", round: "Regular Season - 8" },
      homeTeam: { id: 119, name: "Flamengo", logo: "https://media.api-sports.io/football/teams/119.png", winner: null },
      awayTeam: { id: 121, name: "Palmeiras", logo: "https://media.api-sports.io/football/teams/121.png", winner: null },
      score: { home: 1, away: 1 },
    },
    // Upcoming matches
    {
      id: 99004,
      date: t(19, 0),
      status: { short: "NS", long: "Not Started", elapsed: null },
      league: { id: 140, name: "LaLiga", country: "Spain", logo: "https://media.api-sports.io/football/leagues/140.png", round: "Regular Season - 28" },
      homeTeam: { id: 529, name: "Barcelona", logo: "https://media.api-sports.io/football/teams/529.png", winner: null },
      awayTeam: { id: 530, name: "Atletico Madrid", logo: "https://media.api-sports.io/football/teams/530.png", winner: null },
      score: { home: null, away: null },
    },
    {
      id: 99005,
      date: t(20, 45),
      status: { short: "NS", long: "Not Started", elapsed: null },
      league: { id: 2, name: "UEFA Champions League", country: "World", logo: "https://media.api-sports.io/football/leagues/2.png", round: "Round of 16" },
      homeTeam: { id: 85, name: "PSG", logo: "https://media.api-sports.io/football/teams/85.png", winner: null },
      awayTeam: { id: 157, name: "Bayern Munich", logo: "https://media.api-sports.io/football/teams/157.png", winner: null },
      score: { home: null, away: null },
    },
    {
      id: 99006,
      date: t(18, 30),
      status: { short: "NS", long: "Not Started", elapsed: null },
      league: { id: 71, name: "Brasileirão Série A", country: "Brazil", logo: "https://media.api-sports.io/football/leagues/71.png", round: "Regular Season - 8" },
      homeTeam: { id: 126, name: "São Paulo", logo: "https://media.api-sports.io/football/teams/126.png", winner: null },
      awayTeam: { id: 131, name: "Corinthians", logo: "https://media.api-sports.io/football/teams/131.png", winner: null },
      score: { home: null, away: null },
    },
    {
      id: 99007,
      date: t(21, 0),
      status: { short: "NS", long: "Not Started", elapsed: null },
      league: { id: 135, name: "Serie A", country: "Italy", logo: "https://media.api-sports.io/football/leagues/135.png", round: "Regular Season - 28" },
      homeTeam: { id: 492, name: "Napoli", logo: "https://media.api-sports.io/football/teams/492.png", winner: null },
      awayTeam: { id: 505, name: "Inter Milan", logo: "https://media.api-sports.io/football/teams/505.png", winner: null },
      score: { home: null, away: null },
    },
    {
      id: 99008,
      date: t(17, 0),
      status: { short: "NS", long: "Not Started", elapsed: null },
      league: { id: 78, name: "Bundesliga", country: "Germany", logo: "https://media.api-sports.io/football/leagues/78.png", round: "Regular Season - 26" },
      homeTeam: { id: 168, name: "Bayer Leverkusen", logo: "https://media.api-sports.io/football/teams/168.png", winner: null },
      awayTeam: { id: 165, name: "Borussia Dortmund", logo: "https://media.api-sports.io/football/teams/165.png", winner: null },
      score: { home: null, away: null },
    },
    // Finished matches
    {
      id: 99009,
      date: t(10, 0),
      status: { short: "FT", long: "Match Finished", elapsed: 90 },
      league: { id: 39, name: "Premier League", country: "England", logo: "https://media.api-sports.io/football/leagues/39.png", round: "Regular Season - 30" },
      homeTeam: { id: 33, name: "Manchester United", logo: "https://media.api-sports.io/football/teams/33.png", winner: false },
      awayTeam: { id: 49, name: "Chelsea", logo: "https://media.api-sports.io/football/teams/49.png", winner: true },
      score: { home: 0, away: 2 },
    },
    {
      id: 99010,
      date: t(9, 30),
      status: { short: "FT", long: "Match Finished", elapsed: 90 },
      league: { id: 140, name: "LaLiga", country: "Spain", logo: "https://media.api-sports.io/football/leagues/140.png", round: "Regular Season - 28" },
      homeTeam: { id: 546, name: "Sevilla", logo: "https://media.api-sports.io/football/teams/546.png", winner: true },
      awayTeam: { id: 543, name: "Real Betis", logo: "https://media.api-sports.io/football/teams/543.png", winner: false },
      score: { home: 3, away: 1 },
    },
    {
      id: 99011,
      date: t(11, 0),
      status: { short: "FT", long: "Match Finished", elapsed: 90 },
      league: { id: 78, name: "Bundesliga", country: "Germany", logo: "https://media.api-sports.io/football/leagues/78.png", round: "Regular Season - 26" },
      homeTeam: { id: 157, name: "Bayern Munich", logo: "https://media.api-sports.io/football/teams/157.png", winner: true },
      awayTeam: { id: 173, name: "RB Leipzig", logo: "https://media.api-sports.io/football/teams/173.png", winner: false },
      score: { home: 3, away: 1 },
    },
    {
      id: 99012,
      date: t(8, 0),
      status: { short: "FT", long: "Match Finished", elapsed: 90 },
      league: { id: 71, name: "Brasileirão Série A", country: "Brazil", logo: "https://media.api-sports.io/football/leagues/71.png", round: "Regular Season - 8" },
      homeTeam: { id: 130, name: "Atlético Mineiro", logo: "https://media.api-sports.io/football/teams/130.png", winner: null },
      awayTeam: { id: 128, name: "Grêmio", logo: "https://media.api-sports.io/football/teams/128.png", winner: null },
      score: { home: 2, away: 2 },
    },
  ];
}

// Demo fixture analysis data keyed by fixture id
const DEMO_ANALYSES: Record<number, ReturnType<typeof calcMatchProbabilities> & { homeStats: any; awayStats: any }> = {
  99001: { ...calcMatchProbabilities(2.1, 0.8, 1.4, 1.1), homeStats: { played: 27, wins: 20, draws: 4, losses: 3, goalsFor: 68, goalsAgainst: 24, form: "WWWWDW" }, awayStats: { played: 27, wins: 17, draws: 5, losses: 5, goalsFor: 58, goalsAgainst: 30, form: "WWDWLW" } },
  99002: { ...calcMatchProbabilities(1.9, 0.9, 1.1, 1.3), homeStats: { played: 27, wins: 18, draws: 6, losses: 3, goalsFor: 62, goalsAgainst: 28, form: "WWWWWD" }, awayStats: { played: 27, wins: 13, draws: 6, losses: 8, goalsFor: 50, goalsAgainst: 42, form: "LWWDLW" } },
  99003: { ...calcMatchProbabilities(1.8, 1.0, 1.7, 1.1), homeStats: { played: 7, wins: 4, draws: 2, losses: 1, goalsFor: 14, goalsAgainst: 8, form: "WWDWDW" }, awayStats: { played: 7, wins: 5, draws: 1, losses: 1, goalsFor: 17, goalsAgainst: 6, form: "WWWWLW" } },
  99004: { ...calcMatchProbabilities(2.2, 0.8, 1.5, 1.0), homeStats: { played: 27, wins: 22, draws: 2, losses: 3, goalsFor: 75, goalsAgainst: 27, form: "WWWWWW" }, awayStats: { played: 27, wins: 18, draws: 5, losses: 4, goalsFor: 58, goalsAgainst: 32, form: "WWDLWW" } },
  99005: { ...calcMatchProbabilities(2.3, 0.7, 2.0, 0.9), homeStats: { played: 27, wins: 21, draws: 3, losses: 3, goalsFor: 80, goalsAgainst: 22, form: "WWWWWW" }, awayStats: { played: 27, wins: 24, draws: 2, losses: 1, goalsFor: 85, goalsAgainst: 20, form: "WWWWWW" } },
  99006: { ...calcMatchProbabilities(1.5, 1.2, 1.3, 1.4), homeStats: { played: 7, wins: 3, draws: 2, losses: 2, goalsFor: 10, goalsAgainst: 9, form: "WDLWDW" }, awayStats: { played: 7, wins: 2, draws: 3, losses: 2, goalsFor: 9, goalsAgainst: 10, form: "DLLWWD" } },
  99007: { ...calcMatchProbabilities(1.8, 0.9, 2.1, 0.8), homeStats: { played: 27, wins: 16, draws: 5, losses: 6, goalsFor: 55, goalsAgainst: 33, form: "WWLWDW" }, awayStats: { played: 27, wins: 22, draws: 3, losses: 2, goalsFor: 72, goalsAgainst: 25, form: "WWWWWW" } },
  99008: { ...calcMatchProbabilities(1.9, 0.7, 1.5, 1.0), homeStats: { played: 25, wins: 19, draws: 3, losses: 3, goalsFor: 68, goalsAgainst: 22, form: "WWWWWW" }, awayStats: { played: 25, wins: 16, draws: 4, losses: 5, goalsFor: 57, goalsAgainst: 35, form: "WLWWDW" } },
  99009: { ...calcMatchProbabilities(1.2, 1.4, 1.8, 1.1), homeStats: { played: 27, wins: 12, draws: 4, losses: 11, goalsFor: 42, goalsAgainst: 47, form: "LLWLWW" }, awayStats: { played: 27, wins: 15, draws: 5, losses: 7, goalsFor: 58, goalsAgainst: 40, form: "WWLDWL" } },
  99010: { ...calcMatchProbabilities(1.6, 1.0, 1.3, 1.2), homeStats: { played: 27, wins: 14, draws: 4, losses: 9, goalsFor: 48, goalsAgainst: 38, form: "WLWWLD" }, awayStats: { played: 27, wins: 13, draws: 6, losses: 8, goalsFor: 45, goalsAgainst: 40, form: "DWLWWL" } },
  99011: { ...calcMatchProbabilities(2.3, 0.7, 1.5, 1.0), homeStats: { played: 25, wins: 21, draws: 2, losses: 2, goalsFor: 80, goalsAgainst: 22, form: "WWWWWW" }, awayStats: { played: 25, wins: 16, draws: 4, losses: 5, goalsFor: 60, goalsAgainst: 35, form: "WWDWLW" } },
  99012: { ...calcMatchProbabilities(1.7, 1.1, 1.6, 1.2), homeStats: { played: 7, wins: 4, draws: 1, losses: 2, goalsFor: 13, goalsAgainst: 10, form: "WWLDWW" }, awayStats: { played: 7, wins: 3, draws: 2, losses: 2, goalsFor: 11, goalsAgainst: 10, form: "DWWLWD" } },
};

// Demo bookmaker odds
const DEMO_ODDS: Record<number, { home: number; draw: number; away: number; over25: number; under25: number; bttsYes: number; bttsNo: number }> = {
  99001: { home: 1.55, draw: 4.20, away: 5.50, over25: 1.72, under25: 2.10, bttsYes: 1.95, bttsNo: 1.85 },
  99002: { home: 1.45, draw: 4.50, away: 7.00, over25: 1.80, under25: 2.00, bttsYes: 2.10, bttsNo: 1.70 },
  99003: { home: 2.20, draw: 3.10, away: 3.30, over25: 1.65, under25: 2.25, bttsYes: 1.80, bttsNo: 1.95 },
  99004: { home: 1.40, draw: 5.00, away: 7.50, over25: 1.75, under25: 2.05, bttsYes: 1.90, bttsNo: 1.90 },
  99005: { home: 1.90, draw: 3.80, away: 4.00, over25: 1.55, under25: 2.40, bttsYes: 1.75, bttsNo: 2.05 },
  99006: { home: 2.50, draw: 3.00, away: 2.90, over25: 1.95, under25: 1.85, bttsYes: 1.90, bttsNo: 1.90 },
  99007: { home: 3.20, draw: 3.50, away: 2.10, over25: 1.70, under25: 2.15, bttsYes: 1.85, bttsNo: 1.95 },
  99008: { home: 1.60, draw: 4.00, away: 5.50, over25: 1.85, under25: 1.95, bttsYes: 2.00, bttsNo: 1.80 },
  99009: { home: 2.80, draw: 3.20, away: 2.60, over25: 1.75, under25: 2.05, bttsYes: 1.80, bttsNo: 2.00 },
  99010: { home: 2.10, draw: 3.30, away: 3.40, over25: 1.90, under25: 1.90, bttsYes: 1.85, bttsNo: 1.95 },
  99011: { home: 1.50, draw: 4.50, away: 6.00, over25: 1.80, under25: 2.00, bttsYes: 2.00, bttsNo: 1.80 },
  99012: { home: 2.30, draw: 2.90, away: 3.20, over25: 1.75, under25: 2.05, bttsYes: 1.75, bttsNo: 2.05 },
};

// ── matches-today ──────────────────────────────────────────────────────────────
router.get("/matches-today", async (_req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const { data, ok } = await apiFetch(`/fixtures?date=${today}`, MATCH_TTL);

    if (ok && data && (data.results ?? 0) > 0) {
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
      return res.json({ total: matches.length, matches, demo: false });
    }

    // Fallback to demo data
    const matches = buildDemoFixtures();
    console.log(`[matches-today] Using demo data (API ${apiSuspended ? "suspended" : "unavailable"}). ${matches.length} fixtures.`);
    return res.json({ total: matches.length, matches, demo: true, apiStatus: apiSuspended ? "suspended" : "unavailable" });
  } catch (err: any) {
    console.error("[matches-today]", err.message);
    const matches = buildDemoFixtures();
    return res.json({ total: matches.length, matches, demo: true });
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
      const item = data.response[0];
      const fix = {
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
        score: { home: item.goals.home, away: item.goals.away },
        demo: false,
      };
      return res.json(fix);
    }

    // Fall back to demo
    const demoFixtures = buildDemoFixtures();
    const demo = demoFixtures.find(f => f.id === fixtureId);
    if (demo) return res.json({ ...demo, demo: true });

    return res.status(404).json({ error: "Fixture not found" });
  } catch (err: any) {
    console.error("[fixture/:id]", err.message);
    const demoFixtures = buildDemoFixtures();
    const demo = demoFixtures.find(f => f.id === Number(req.params.id));
    if (demo) return res.json({ ...demo, demo: true });
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

    // Demo stats
    const home = [
      { type: "Shots on Goal", value: 6 },
      { type: "Shots off Goal", value: 4 },
      { type: "Total Shots", value: 14 },
      { type: "Ball Possession", value: "54%" },
      { type: "Corner Kicks", value: 7 },
      { type: "Fouls", value: 11 },
      { type: "Yellow Cards", value: 2 },
      { type: "Red Cards", value: 0 },
      { type: "Goalkeeper Saves", value: 3 },
      { type: "Total passes", value: 512 },
      { type: "expected_goals", value: 1.84 },
    ];
    const away = [
      { type: "Shots on Goal", value: 4 },
      { type: "Shots off Goal", value: 3 },
      { type: "Total Shots", value: 9 },
      { type: "Ball Possession", value: "46%" },
      { type: "Corner Kicks", value: 5 },
      { type: "Fouls", value: 14 },
      { type: "Yellow Cards", value: 3 },
      { type: "Red Cards", value: 0 },
      { type: "Goalkeeper Saves", value: 5 },
      { type: "Total passes", value: 437 },
      { type: "expected_goals", value: 1.12 },
    ];

    const demoFixtures = buildDemoFixtures();
    const fix = demoFixtures.find(f => f.id === fixtureId);
    return res.json({
      stats: [
        { team: { id: fix?.homeTeam.id, name: fix?.homeTeam.name, logo: fix?.homeTeam.logo }, statistics: home },
        { team: { id: fix?.awayTeam.id, name: fix?.awayTeam.name, logo: fix?.awayTeam.logo }, statistics: away },
      ],
      demo: true,
    });
  } catch (err: any) {
    console.error("[fixture/stats]", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── fixture/:id/h2h ────────────────────────────────────────────────────────────
router.get("/fixture/:id/h2h", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);
    const demoFixtures = buildDemoFixtures();
    const fix = demoFixtures.find(f => f.id === fixtureId);

    if (!fix) return res.json({ h2h: [], demo: true });

    const { data, ok } = await apiFetch(
      `/fixtures/headtohead?h2h=${fix.homeTeam.id}-${fix.awayTeam.id}&last=6`,
      STATS_TTL
    );

    if (ok && data?.response?.length > 0) {
      return res.json({
        h2h: data.response.map((item: any) => ({
          date: item.fixture.date,
          homeTeam: { name: item.teams.home.name, logo: item.teams.home.logo },
          awayTeam: { name: item.teams.away.name, logo: item.teams.away.logo },
          score: { home: item.goals.home, away: item.goals.away },
          status: item.fixture.status.short,
        })),
        demo: false,
      });
    }

    // Demo H2H
    const demoH2H = [
      { date: "2024-11-27", homeTeam: { name: fix.homeTeam.name, logo: fix.homeTeam.logo }, awayTeam: { name: fix.awayTeam.name, logo: fix.awayTeam.logo }, score: { home: 3, away: 1 }, status: "FT" },
      { date: "2024-04-09", homeTeam: { name: fix.awayTeam.name, logo: fix.awayTeam.logo }, awayTeam: { name: fix.homeTeam.name, logo: fix.homeTeam.logo }, score: { home: 0, away: 1 }, status: "FT" },
      { date: "2023-10-22", homeTeam: { name: fix.homeTeam.name, logo: fix.homeTeam.logo }, awayTeam: { name: fix.awayTeam.name, logo: fix.awayTeam.logo }, score: { home: 2, away: 2 }, status: "FT" },
      { date: "2023-04-18", homeTeam: { name: fix.awayTeam.name, logo: fix.awayTeam.logo }, awayTeam: { name: fix.homeTeam.name, logo: fix.homeTeam.logo }, score: { home: 1, away: 3 }, status: "FT" },
      { date: "2022-12-11", homeTeam: { name: fix.homeTeam.name, logo: fix.homeTeam.logo }, awayTeam: { name: fix.awayTeam.name, logo: fix.awayTeam.logo }, score: { home: 2, away: 0 }, status: "FT" },
      { date: "2022-04-05", homeTeam: { name: fix.awayTeam.name, logo: fix.awayTeam.logo }, awayTeam: { name: fix.homeTeam.name, logo: fix.homeTeam.logo }, score: { home: 1, away: 2 }, status: "FT" },
    ];
    return res.json({ h2h: demoH2H, demo: true });
  } catch (err: any) {
    console.error("[fixture/h2h]", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── fixture/:id/analysis ───────────────────────────────────────────────────────
router.get("/fixture/:id/analysis", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);
    const demoFixtures = buildDemoFixtures();
    const fix = demoFixtures.find(f => f.id === fixtureId);

    // Try live API first for real fixtures
    const { data: homeData, ok: homeOk } = fix
      ? await apiFetch(`/teams/statistics?team=${fix.homeTeam.id}&league=${fix.league.id}&season=2024`, STATS_TTL)
      : { data: null, ok: false };
    const { data: awayData, ok: awayOk } = fix
      ? await apiFetch(`/teams/statistics?team=${fix.awayTeam.id}&league=${fix.league.id}&season=2024`, STATS_TTL)
      : { data: null, ok: false };

    if (homeOk && awayOk && homeData?.response && awayData?.response) {
      const hs = homeData.response;
      const as_ = awayData.response;
      const avgGoals = (s: any, type: "for" | "against") => {
        const g = type === "for" ? s.goals?.for : s.goals?.against;
        const total = g?.total?.total ?? 0;
        const played = s.fixtures?.played?.total ?? 1;
        return played > 0 ? total / played : 1.3;
      };
      const result = calcMatchProbabilities(avgGoals(hs, "for"), avgGoals(hs, "against"), avgGoals(as_, "for"), avgGoals(as_, "against"));
      return res.json({ ...result, homeStats: hs, awayStats: as_, demo: false });
    }

    // Demo analysis
    const demoAnalysis = DEMO_ANALYSES[fixtureId];
    if (demoAnalysis) return res.json({ ...demoAnalysis, demo: true });

    // Generic fallback
    const result = calcMatchProbabilities(1.5, 1.2, 1.3, 1.3);
    return res.json({ ...result, homeStats: null, awayStats: null, demo: true });
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

    // Demo odds
    const demoOdds = DEMO_ODDS[fixtureId];
    if (demoOdds) {
      return res.json({
        available: true,
        fixtureId,
        odds: { ...demoOdds },
        bookmakers: ["Bet365", "Betano"],
        demo: true,
      });
    }

    return res.json({ available: false, odds: null, demo: true });
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
    if (!ok || !data?.response) return res.status(404).json({ error: "Team stats not found" });
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

    const fixtureId = Number(fixture);
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

    // Demo fallback
    const demoOdds = DEMO_ODDS[fixtureId];
    if (demoOdds) {
      return res.json({ available: true, fixtureId: fixture, odds: { ...demoOdds }, bookmakers: ["Bet365", "Betano"], demo: true });
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

    const avgGoals = (stats: any, type: "for" | "against"): number => {
      if (!stats) return 1.3;
      const g = type === "for" ? stats.goals?.for : stats.goals?.against;
      const total = g?.total?.total ?? 0;
      const played = stats.fixtures?.played?.total ?? 1;
      return played > 0 ? total / played : 1.3;
    };

    const hs = homeOk ? homeData?.response : null;
    const as_ = awayOk ? awayData?.response : null;

    const result = calcMatchProbabilities(
      avgGoals(hs, "for"), avgGoals(hs, "against"),
      avgGoals(as_, "for"), avgGoals(as_, "against")
    );

    return res.json({
      ...result,
      homeStats: hs ? { played: hs.fixtures?.played?.total, wins: hs.fixtures?.wins?.total, draws: hs.fixtures?.draws?.total, losses: hs.fixtures?.loses?.total, goalsFor: hs.goals?.for?.total?.total, goalsAgainst: hs.goals?.against?.total?.total, form: hs.form } : null,
      awayStats: as_ ? { played: as_.fixtures?.played?.total, wins: as_.fixtures?.wins?.total, draws: as_.fixtures?.draws?.total, losses: as_.fixtures?.loses?.total, goalsFor: as_.goals?.for?.total?.total, goalsAgainst: as_.goals?.against?.total?.total, form: as_.form } : null,
      demo: !homeOk || !awayOk,
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
