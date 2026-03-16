import { Router, type IRouter } from "express";

const router: IRouter = Router();

const API_BASE = "https://v3.football.api-sports.io";

const cache = new Map<string, { data: unknown; ts: number }>();
const ODDS_TTL = 5 * 60 * 1000;       // 5 minutes
const STATS_TTL = 10 * 60 * 1000;     // 10 minutes
const MATCH_TTL = 2 * 60 * 1000;      // 2 minutes
const FIXTURE_LIST_TTL = 5 * 60 * 1000;  //  5 minutes – homepage fixture lists
const SQUAD_TTL = 24 * 60 * 60 * 1000;   // 24 hours  – squad roster
const FORM_TTL  =  6 * 60 * 60 * 1000;   //  6 hours   – player performance stats

let apiSuspended = false;
const SUSPENDED_CACHE_TTL = 5 * 60 * 1000;
let lastSuspendedCheck = 0;

const LIVE_TTL = 30 * 1000;            // 30 seconds (for live matches)

// ── Core fetch: used for fixture/match data — manages global suspension flag ───
async function apiFetch(path: string, ttl = MATCH_TTL): Promise<{ data: any; ok: boolean; stale?: boolean }> {
  const cacheKey = path;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.ts < ttl) return { data: cached.data, ok: true };

  if (apiSuspended && Date.now() - lastSuspendedCheck < SUSPENDED_CACHE_TTL) {
    if (cached) return { data: cached.data, ok: true, stale: true };
    return { data: null, ok: false };
  }

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    console.error("[api-football] ERROR: API_FOOTBALL_KEY not set.");
    if (cached) return { data: cached.data, ok: true, stale: true };
    return { data: null, ok: false };
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "GET",
      headers: {
        "x-apisports-key": apiKey,
        "x-rapidapi-host": "v3.football.api-sports.io",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[api-football] HTTP ${res.status} for ${path}`);
      if (cached) return { data: cached.data, ok: true, stale: true };
      return { data: null, ok: false };
    }
    const data = await res.json();

    if (data.errors && Object.keys(data.errors).length > 0) {
      const errKey = Object.keys(data.errors)[0] ?? "";
      const errVal = String(Object.values(data.errors)[0] ?? "");
      const fullMsg = errVal.toLowerCase();

      // Always log the real error so it's visible in server logs
      console.error(`[api-football] API error for ${path} — key:"${errKey}" msg:"${errVal}"`);

      // Daily request limit exhausted — suspend briefly to protect remaining quota
      // Must be checked BEFORE isPlanError since its message can mention "plan"
      const isDailyLimit = errKey === "requests" || fullMsg.includes("request limit") || fullMsg.includes("reached the request");

      // Plan restriction: endpoint not available on current subscription
      // e.g. "Free plans do not have access to the Next parameter."
      // Do NOT suspend — this is a plan mismatch, not a quota issue
      const isPlanError = !isDailyLimit && (errKey === "plan" || fullMsg.includes("not have access"));

      // True account suspension
      const isAccountSuspended = !isPlanError && fullMsg.includes("suspend");

      // Over-rate or general rate limit
      const isRateLimit = !isPlanError && (fullMsg.includes("ratelimit") || fullMsg.includes("too many"));

      if (isAccountSuspended || isDailyLimit || isRateLimit) {
        apiSuspended = true;
        lastSuspendedCheck = Date.now();
        console.warn(`[api-football] ${isAccountSuspended ? "Account suspended" : isDailyLimit ? "Daily request limit reached" : "Rate limit hit"} — pausing API calls`);
      }

      if (isPlanError) {
        console.warn(`[api-football] Plan restriction — ${path} not available on current plan. Returning empty.`);
        return { data: null, ok: false };
      }

      if (cached) return { data: cached.data, ok: true, stale: true };
      return { data: null, ok: false };
    }

    apiSuspended = false;
    lastSuspendedCheck = 0;
    cache.set(cacheKey, { data, ts: Date.now() });
    return { data, ok: true };
  } catch (err: any) {
    console.error(`[api-football] fetch error for ${path}:`, err.message);
    if (cached) return { data: cached.data, ok: true, stale: true };
    return { data: null, ok: false };
  }
}

// ── Non-blocking player fetch: NEVER touches apiSuspended — match loading is safe
async function apiFetchPlayer(path: string, ttl = FORM_TTL): Promise<{ data: any; ok: boolean }> {
  const cacheKey = path;
  const cached = cache.get(cacheKey);

  // Fresh cache — return immediately
  if (cached && Date.now() - cached.ts < ttl) return { data: cached.data, ok: true };

  // Stale cache — return stale rather than making a risky call while quota is low
  if (apiSuspended && cached) {
    console.warn(`[player-stats] Suspended — serving stale cache for ${path}`);
    return { data: cached.data, ok: true };
  }
  if (apiSuspended) return { data: null, ok: false };

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return { data: null, ok: false };

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "GET",
      headers: {
        "x-apisports-key": apiKey,
        "x-rapidapi-host": "v3.football.api-sports.io",
      },
      signal: AbortSignal.timeout(3000), // 3-second hard timeout
    });

    if (!res.ok) {
      console.warn(`[player-stats] HTTP ${res.status} for ${path} — skipping, match loading unaffected`);
      if (cached) return { data: cached.data, ok: true };
      return { data: null, ok: false };
    }

    const data = await res.json();

    if (data.errors && Object.keys(data.errors).length > 0) {
      const pErrKey = Object.keys(data.errors)[0] ?? "";
      const pErrVal = String(Object.values(data.errors)[0] ?? "");
      // Log full error details — NEVER set apiSuspended here
      console.warn(`[player-stats] API error for ${path} — key:"${pErrKey}" msg:"${pErrVal}"`);
      if (cached) return { data: cached.data, ok: true };
      return { data: null, ok: false };
    }

    cache.set(cacheKey, { data, ts: Date.now() });
    return { data, ok: true };
  } catch (err: any) {
    if (err.name === "TimeoutError") {
      console.warn(`[player-stats] Timed out after 3 s for ${path} — match loading unaffected`);
    } else {
      console.warn(`[player-stats] Fetch error for ${path}:`, err.message);
    }
    if (cached) return { data: cached.data, ok: true };
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
  // Safe accessors — missing fields default to sensible values so no match is dropped
  const fixture  = item?.fixture   ?? {};
  const league   = item?.league    ?? {};
  const teams    = item?.teams     ?? {};
  const goals    = item?.goals     ?? {};
  const home     = teams.home      ?? {};
  const away     = teams.away      ?? {};
  const status   = fixture.status  ?? {};

  return {
    id:     fixture.id   ?? null,
    date:   fixture.date ?? null,
    status: {
      short:   status.short   ?? "NS",
      long:    status.long    ?? "Not Started",
      elapsed: status.elapsed ?? null,
    },
    league: {
      id:      league.id      ?? 0,
      name:    league.name    ?? "Unknown League",
      country: league.country ?? "",
      logo:    league.logo    ?? "",
      round:   league.round   ?? "",
    },
    homeTeam: {
      id:     home.id     ?? 0,
      name:   home.name   ?? "Home",
      logo:   home.logo   ?? "",
      winner: home.winner ?? null,
    },
    awayTeam: {
      id:     away.id     ?? 0,
      name:   away.name   ?? "Away",
      logo:   away.logo   ?? "",
      winner: away.winner ?? null,
    },
    score: {
      home: goals.home ?? null,
      away: goals.away ?? null,
    },
  };
}

// ── matches-today ──────────────────────────────────────────────────────────────
router.get("/matches-today", async (_req, res) => {
  try {
    // Date in YYYY-MM-DD format as required by API-Football
    const today = new Date().toISOString().split("T")[0];

    console.log(`[matches-today] Fetching fixtures for date: ${today}`);
    const { data, ok, stale } = await apiFetch(`/fixtures?date=${today}`, FIXTURE_LIST_TTL);

    console.log(`[matches-today] Response — ok: ${ok}, results: ${data?.results ?? 0}, stale: ${stale ?? false}`);

    if (ok && data && (data.results ?? 0) > 0) {
      const raw = data.response ?? [];
      const matches = raw
        .map((item: any) => { try { return mapFixture(item); } catch { return null; } })
        .filter(Boolean);
      console.log(`[matches-today] Mapped ${matches.length} fixtures for today`);
      return res.json({ total: matches.length, matches, demo: false, stale: stale ?? false, isUpcoming: false });
    }

    // ── Fallback 1: try ?next=20 (works on paid plans) ───────────────────────
    console.log(`[matches-today] No fixtures today — trying /fixtures?next=20`);
    const { data: nextData, ok: nextOk, stale: nextStale } = await apiFetch(`/fixtures?next=20`, FIXTURE_LIST_TTL);
    console.log(`[matches-today] ?next=20 — ok: ${nextOk}, results: ${nextData?.results ?? 0}`);

    if (nextOk && nextData && (nextData.results ?? 0) > 0) {
      const raw = nextData.response ?? [];
      const matches = raw
        .map((item: any) => { try { return mapFixture(item); } catch { return null; } })
        .filter(Boolean);
      console.log(`[matches-today] Found ${matches.length} upcoming fixtures via ?next=20`);
      return res.json({
        total: matches.length,
        matches,
        demo: false,
        stale: nextStale ?? false,
        isUpcoming: true,
        apiStatus: "upcoming_fallback",
      });
    }

    // ── Fallback 2: scan next 3 days by date (free-plan compatible) ───────────
    console.log(`[matches-today] ?next=20 empty or unavailable — scanning next 3 days by date`);

    for (let daysAhead = 1; daysAhead <= 3; daysAhead++) {
      if (apiSuspended) break; // quota exhausted — stop burning requests
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);
      const futureDateStr = futureDate.toISOString().split("T")[0];

      const { data: futData, ok: futOk, stale: futStale } = await apiFetch(`/fixtures?date=${futureDateStr}`, FIXTURE_LIST_TTL);
      console.log(`[matches-today] +${daysAhead}d (${futureDateStr}) — ok: ${futOk}, results: ${futData?.results ?? 0}`);

      if (futOk && futData && (futData.results ?? 0) > 0) {
        const raw = futData.response ?? [];
        const matches = raw
          .map((item: any) => { try { return mapFixture(item); } catch { return null; } })
          .filter(Boolean);
        console.log(`[matches-today] Found ${matches.length} upcoming fixtures on ${futureDateStr}`);
        return res.json({
          total: matches.length,
          matches,
          demo: false,
          stale: futStale ?? false,
          isUpcoming: true,
          upcomingDate: futureDateStr,
          apiStatus: "upcoming_fallback",
        });
      }
    }

    // All attempts returned empty
    const finalStatus = apiSuspended ? "daily_limit" : "unavailable";
    console.warn(`[matches-today] No fixtures found anywhere — API status: ${finalStatus}`);
    return res.json({
      total: 0,
      matches: [],
      demo: false,
      stale: false,
      isUpcoming: false,
      apiStatus: finalStatus,
    });
  } catch (err: any) {
    console.error("[matches-today] Unhandled error:", err.message);
    return res.json({ total: 0, matches: [], demo: false, stale: false, isUpcoming: false });
  }
});

// ── fixture/:id ────────────────────────────────────────────────────────────────
router.get("/fixture/:id", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);
    if (isNaN(fixtureId)) {
      return res.json({ found: false, reason: "invalid_id" });
    }

    const { data, ok, stale } = await apiFetch(`/fixtures?id=${fixtureId}`, MATCH_TTL);

    if (ok && data?.response?.[0]) {
      return res.json({ found: true, stale: !!stale, demo: false, ...mapFixture(data.response[0]) });
    }

    // API unavailable or no data — return a safe 200 so the frontend never throws
    return res.json({ found: false, reason: "unavailable" });
  } catch (err: any) {
    console.error("[fixture/:id]", err.message);
    return res.json({ found: false, reason: "error" });
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
      `/fixtures/headtohead?h2h=${homeId}-${awayId}&last=10`,
      STATS_TTL
    );

    if (ok && data?.response?.length > 0) {
      return res.json({
        available: true,
        h2h: data.response.map((h: any) => ({
          date: h.fixture.date ?? null,
          homeTeam: { name: h.teams.home.name ?? "Home", logo: h.teams.home.logo ?? null },
          awayTeam: { name: h.teams.away.name ?? "Away", logo: h.teams.away.logo ?? null },
          score: {
            home: h.goals.home ?? null,
            away: h.goals.away ?? null,
          },
          status: h.fixture.status.short ?? "FT",
          league: {
            name: h.league.name ?? null,
            logo: h.league.logo ?? null,
          },
        })),
        demo: false,
      });
    }

    return res.json({ h2h: [], available: false });
  } catch (err: any) {
    console.error("[fixture/h2h]", err.message);
    return res.json({ h2h: [], available: false });
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

    const mapStats = (s: any) => {
      if (!s) return null;
      const played = s.fixtures?.played?.total ?? 0;
      const goalsFor = s.goals?.for?.total?.total ?? 0;
      const goalsAgainst = s.goals?.against?.total?.total ?? 0;
      const cleanSheets = s.clean_sheet?.total ?? 0;
      const failedToScore = s.failed_to_score?.total ?? 0;
      // Only compute per-game averages when we have real data
      const hasData = played > 0;
      const avgFor = hasData ? parseFloat((goalsFor / played).toFixed(2)) : null;
      const avgAgainst = hasData ? parseFloat((goalsAgainst / played).toFixed(2)) : null;
      const over25Pct = hasData && avgFor !== null && avgAgainst !== null
        ? Math.round(Math.min(95, Math.max(5, over25Prob(avgFor + avgAgainst) * 100)))
        : null;
      const bttsPct = hasData && avgFor !== null && avgAgainst !== null
        ? Math.round(Math.min(90, Math.max(5, bttsProbability(avgFor, avgAgainst) * 100)))
        : null;
      return {
        played,
        wins: s.fixtures?.wins?.total ?? 0,
        draws: s.fixtures?.draws?.total ?? 0,
        losses: s.fixtures?.loses?.total ?? 0,
        goalsFor,
        goalsAgainst,
        avgGoalsFor: avgFor,
        avgGoalsAgainst: avgAgainst,
        cleanSheets,
        failedToScore,
        over25Pct,
        bttsPct,
        form: s.form ?? null,
      };
    };

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

// ── fixture/:id/players ────────────────────────────────────────────────────────
router.get("/fixture/:id/players", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);
    if (isNaN(fixtureId)) return res.status(400).json({ error: "Invalid fixture ID" });

    const { data, ok } = await apiFetch(`/fixtures/players?fixture=${fixtureId}`, STATS_TTL);

    if (ok && data?.response?.length > 0) {
      const teams = (data.response as any[]).map((teamData: any) => ({
        team: {
          id: teamData.team.id,
          name: teamData.team.name,
          logo: teamData.team.logo,
        },
        players: ((teamData.players ?? []) as any[])
          .map((p: any) => {
            const s = p.statistics?.[0] ?? {};
            return {
              id: p.player.id,
              name: p.player.name,
              photo: p.player.photo ?? null,
              position: s.games?.position ?? null,
              minutes: s.games?.minutes ?? null,
              rating: s.games?.rating ? parseFloat(s.games.rating).toFixed(1) : null,
              goals: s.goals?.total ?? 0,
              assists: s.goals?.assists ?? 0,
              shots: s.shots?.total ?? 0,
              shotsOnTarget: s.shots?.on ?? 0,
              passes: s.passes?.total ?? 0,
              keyPasses: s.passes?.key ?? 0,
              tackles: s.tackles?.total ?? 0,
              yellowCards: s.cards?.yellow ?? 0,
              redCards: s.cards?.red ?? 0,
            };
          })
          .filter((p: any) => p.minutes !== null && p.minutes > 0)
          .sort((a: any, b: any) => (b.minutes ?? 0) - (a.minutes ?? 0)),
      }));
      return res.json({ available: true, teams });
    }

    return res.json({ available: false, teams: [] });
  } catch (err: any) {
    console.error("[fixture/players]", err.message);
    return res.json({ available: false, teams: [] });
  }
});

// ── fixture/:id/squad ──────────────────────────────────────────────────────────
router.get("/fixture/:id/squad", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);
    if (isNaN(fixtureId)) return res.json({ available: false, teams: [] });

    // Resolve team IDs from the fixture
    const { data: fixData, ok: fixOk } = await apiFetch(`/fixtures?id=${fixtureId}`, MATCH_TTL);
    if (!fixOk || !fixData?.response?.[0]) return res.json({ available: false, teams: [] });

    const item = fixData.response[0];
    const homeId: number = item.teams.home.id;
    const awayId: number = item.teams.away.id;

    // Determine active season (try current year's start; European 2025-26 = season 2025)
    const season = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1;

    // Early-exit if API is suspended — preserve quota for match loading
    if (apiSuspended && Date.now() - lastSuspendedCheck < SUSPENDED_CACHE_TTL) {
      console.warn("[player-stats] Skipping squad fetch — API suspended, protecting match quota");
      return res.json({ available: false, teams: [] });
    }

    // Use apiFetchPlayer (non-blocking, 3 s timeout) for all player calls
    // so a failure NEVER sets apiSuspended and NEVER blocks fixture loading
    const [homeSquadRes, awaySquadRes, homeStatsRes, awayStatsRes] = await Promise.all([
      apiFetchPlayer(`/players/squads?team=${homeId}`, SQUAD_TTL),
      apiFetchPlayer(`/players/squads?team=${awayId}`, SQUAD_TTL),
      apiFetchPlayer(`/players?team=${homeId}&season=${season}`, FORM_TTL),
      apiFetchPlayer(`/players?team=${awayId}&season=${season}`, FORM_TTL),
    ]);

    const positionOrder = (pos: string): number => {
      const p = pos.toLowerCase();
      if (p.includes("goalkeeper")) return 0;
      if (p.includes("defender"))   return 1;
      if (p.includes("midfielder")) return 2;
      return 3;
    };

    const positionLabel = (pos: string): string => {
      const p = pos.toLowerCase();
      if (p.includes("goalkeeper")) return "Goalkeeper";
      if (p.includes("defender"))   return "Defender";
      if (p.includes("midfielder")) return "Midfielder";
      if (p.includes("forward") || p.includes("attacker")) return "Forward";
      return pos;
    };

    const buildStatsMap = (statsRes: { data: any; ok: boolean }): Map<number, any> => {
      const map = new Map<number, any>();
      if (!statsRes.ok || !statsRes.data?.response) return map;
      for (const entry of statsRes.data.response as any[]) {
        if (entry.player?.id) map.set(entry.player.id, entry);
      }
      return map;
    };

    const avg = (val: number, apps: number): number =>
      apps > 0 ? Math.round((val / apps) * 100) / 100 : 0;

    const mapTeam = (
      teamRaw: any,
      squadRes: { data: any; ok: boolean },
      statsRes: { data: any; ok: boolean }
    ) => {
      const squadList: any[] = squadRes.ok ? (squadRes.data?.response?.[0]?.players ?? []) : [];
      const statsMap = buildStatsMap(statsRes);

      const players = squadList
        .map((sp: any) => {
          const entry   = statsMap.get(sp.id);
          const ps      = entry?.statistics?.[0] ?? {};
          const apps    = ps.games?.appearances ?? 0;
          const goals   = ps.goals?.total       ?? 0;
          const assists = ps.goals?.assists      ?? 0;
          const shots   = ps.shots?.total        ?? 0;
          const sot     = ps.shots?.on           ?? 0;
          const kp      = ps.passes?.key         ?? 0;
          const drib    = ps.dribbles?.attempts  ?? 0;
          const yellow  = ps.cards?.yellow       ?? 0;
          const red     = (ps.cards?.red ?? 0) + (ps.cards?.yellowred ?? 0);
          const mins    = ps.games?.minutes      ?? 0;
          const rating  = ps.games?.rating ? parseFloat(ps.games.rating) : null;

          // Per-game averages
          const avgGoals    = avg(goals,   apps);
          const avgAssists  = avg(assists, apps);
          const avgShots    = avg(shots,   apps);
          const avgSOT      = avg(sot,     apps);
          const avgKeyPasses = avg(kp,     apps);

          // Performance indicators (based on season per-game averages)
          const hotPlayer  = avgGoals   >= 0.4;            // ≈ 2 goals per 5 games
          const shotVolume = avgShots   >= 3;
          const playmaker  = avgKeyPasses >= 2;
          const cardRisk   = apps > 0 && (yellow + red) / apps >= 0.4; // ≈ 2 cards per 5 games

          return {
            id: sp.id,
            name:        sp.name    ?? "Unknown",
            photo:       sp.photo   ?? null,
            age:         sp.age     ?? null,
            position:    positionLabel(sp.position ?? ""),
            nationality: entry?.player?.nationality ?? null,
            // Season totals
            appearances: apps,
            goals,
            assists,
            shots,
            shotsOnTarget: sot,
            keyPasses: kp,
            dribbles:  drib,
            yellowCards: yellow,
            redCards:    red,
            minutesPlayed: mins,
            avgRating: rating,
            // Per-game averages
            avgGoals,
            avgAssists,
            avgShots,
            avgSOT,
            avgKeyPasses,
            // Performance indicators
            hotPlayer,
            shotVolume,
            playmaker,
            cardRisk,
          };
        })
        .sort((a: any, b: any) => positionOrder(a.position) - positionOrder(b.position));

      return {
        team: { id: teamRaw.id, name: teamRaw.name, logo: teamRaw.logo },
        players,
      };
    };

    const teams = [
      mapTeam(item.teams.home, homeSquadRes, homeStatsRes),
      mapTeam(item.teams.away, awaySquadRes, awayStatsRes),
    ];

    const hasAny = teams.some((t) => t.players.length > 0);
    return res.json({ available: hasAny, teams });
  } catch (err: any) {
    console.error("[fixture/squad]", err.message);
    return res.json({ available: false, teams: [] });
  }
});

// ── api-status ─────────────────────────────────────────────────────────────────
router.get("/api-status", (_req, res) => {
  res.json({ suspended: apiSuspended, cacheSize: cache.size });
});

export default router;
