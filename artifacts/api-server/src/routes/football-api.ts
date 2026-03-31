import { Router, type IRouter } from "express";
import {
  getFixturesFromDB,
  getFixtureByIdFromDB,
  saveFixturesToDB,
  isDBFresh,
  getTopLeaguePrelivFromDB,
  getScannerFixtures,
  type CachedFixture,
} from "../lib/fixture-db.js";
import {
  startLiveEngine,
  updateFromApiResponse,
  getLiveMatches,
  getLiveStats,
  getLiveEvents,
  getFinishedMatches,
  getLiveCount,
  type LiveFixture,
  type LiveMatchStats,
} from "../lib/live-engine.js";
import { broadcastLiveUpdate } from "../lib/live-ws.js";
import { cacheManager } from "../lib/cache-manager.js";

const router: IRouter = Router();

const API_BASE = "https://v3.football.api-sports.io";

const TOP_LEAGUES = [
  // Top 6 domestic leagues (tier 1)
  39,   // Premier League
  140,  // La Liga
  78,   // Bundesliga
  61,   // Ligue 1
  135,  // Serie A
  71,   // Brasileirão Série A
  // Top 6 tier-2 domestic leagues
  40,   // Championship (England)
  141,  // La Liga 2 (Spain)
  79,   // 2. Bundesliga (Germany)
  136,  // Serie B (Italy)
  62,   // Ligue 2 (France)
  72,   // Série B (Brazil)
  // European club competitions
  2,    // Champions League
  3,    // Europa League
  848,  // Conference League
  // South American cups
  13,   // Copa Libertadores
  11,   // Copa Sudamericana
  9,    // Copa America
];

// The main leagues guaranteed in pre-live section (expanded to include second tiers)
const TOP_SIX_LEAGUES = [39, 140, 78, 61, 135, 71, 40, 141, 79, 136, 62, 72, 2, 3, 848];

// Expanded scanner league list — covers all competitions visible in the sidebar
const SCANNER_LEAGUES = [
  // Tier-1 domestic (highest priority)
  39, 140, 78, 61, 135, 71,
  // Tier-2 domestic
  40, 141, 79, 136, 62, 72,
  // European club cups
  2, 3, 848,
  // South American cups
  13, 11, 9, 73,
  // Portugal
  94, 95,
  // Netherlands
  88, 89,
  // Scotland
  179, 181,
  // Nordic
  103, 104, 113, 114, 119, 120,
  // World Cup Qualifiers (UEFA + CONMEBOL)
  31, 35,
];

const cache = new Map<string, { data: unknown; ts: number }>();
const ODDS_TTL         =  5 * 60 * 1000;       //  5 min  — odds
const STATS_TTL        = 10 * 60 * 1000;       // 10 min  — pre-match statistics
const MATCH_TTL        =  2 * 60 * 1000;       //  2 min  — match payload (fallback default)
const FIXTURE_LIST_TTL = 10 * 60 * 1000;       // 10 min  — today's fixture lists (spec)
const PRELIVE_TTL      = 60 * 1000;            // 60 s    — pre-live fixtures (in-memory dedup)
const SQUAD_TTL        = 24 * 60 * 60 * 1000;  // 24 h    — squad rosters
const FORM_TTL         = 12 * 60 * 60 * 1000;  // 12 h    — player performance stats (spec)
const LEAGUES_TTL      =  6 * 60 * 60 * 1000;  //  6 h    — league data (spec)
const TEAMS_TTL        =  6 * 60 * 60 * 1000;  //  6 h    — team data (spec)

let apiSuspended = false;
const SUSPENDED_CACHE_TTL = 5 * 60 * 1000;
let lastSuspendedCheck = 0;

// ── Scanner call throttle ─────────────────────────────────────────────────────
// Limits scanner API bursts to ≤30 calls per run; resets between scans
let scannerCallBudget = 0;
const SCANNER_CALL_BUDGET = 60;
function scannerBudgetAvailable(): boolean { return scannerCallBudget > 0; }
function useScannerBudget(): void { scannerCallBudget = Math.max(0, scannerCallBudget - 1); }
function resetScannerBudget(): void { scannerCallBudget = SCANNER_CALL_BUDGET; }

/** Throttled apiFetch for scanner use only — respects scannerCallBudget */
async function scannerApiFetch(path: string, ttl = MATCH_TTL): Promise<{ data: any; ok: boolean; stale?: boolean }> {
  // Always serve from cache if fresh
  const cached = (cache as any).get(path);
  if (cached && Date.now() - cached.ts < ttl) return { data: cached.data, ok: true };
  // Only allow fresh API calls within budget
  if (!scannerBudgetAvailable()) return { data: cached?.data ?? null, ok: !!cached?.data };
  useScannerBudget();
  return apiFetch(path, ttl);
}

const LIVE_TTL = 30 * 1000;            // 30 s — matches the 30 s poll interval (spec)

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
    const data: any = await res.json();

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

    const data: any = await res.json();

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

  const venue = fixture.venue ?? {};
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
      flag:    league.flag    ?? "",
      round:   league.round   ?? "",
      season:  league.season  ?? null,
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
    venue: {
      name: venue.name ?? null,
      city: venue.city ?? null,
    },
  };
}

/**
 * Maps a CachedFixture (from the DB) to the same shape as mapFixture().
 * Used as a DB-first fallback in GET /fixture/:id so the page always loads
 * even when the API is suspended or rate-limited.
 */
function mapDbFixture(f: CachedFixture) {
  return {
    id:     f.id,
    date:   f.date,
    status: f.status,
    league: { ...f.league, flag: "", season: null },
    homeTeam: f.homeTeam,
    awayTeam: f.awayTeam,
    score:  f.score,
    venue:  { name: null, city: null },
  };
}

// ── Background refresh state ───────────────────────────────────────────────
let bgRefreshRunning = false;
let lastBgRefresh = 0;
const BG_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

/**
 * Fetches fixtures from the API and saves them to the DB.
 * Tries ?next=20 first, then date-based fallback.
 * Never throws — errors are logged and ignored.
 */
async function fetchAndCacheFixtures(): Promise<number> {
  const today = new Date().toISOString().split("T")[0];
  let saved = 0;

  // Try today's date first — returns ALL leagues at once (most efficient)
  const { data: todayData, ok: todayOk } = await apiFetch(`/fixtures?date=${today}`, FIXTURE_LIST_TTL);
  if (todayOk && todayData && (todayData.results ?? 0) > 0) {
    await saveFixturesToDB(todayData.response ?? []);
    saved += todayData.results ?? 0;
  }

  // If date fetch returned nothing, try top leagues individually by season to supplement
  // Only run if API is not suspended (quota protection)
  const SEASON = "2025";
  if (!apiSuspended && saved === 0) {
    for (const leagueId of TOP_LEAGUES) {
      if (apiSuspended) break;
      const { data: lgData, ok: lgOk } = await apiFetch(
        `/fixtures?league=${leagueId}&season=${SEASON}&date=${today}`,
        FIXTURE_LIST_TTL
      );
      if (lgOk && lgData && (lgData.results ?? 0) > 0) {
        await saveFixturesToDB(lgData.response ?? []);
        saved += lgData.results ?? 0;
      }
    }
  }

  // Try ?next=20 (works on paid plans — plan error is handled gracefully)
  if (!apiSuspended) {
    const { data: nextData, ok: nextOk } = await apiFetch(`/fixtures?next=20`, FIXTURE_LIST_TTL);
    if (nextOk && nextData && (nextData.results ?? 0) > 0) {
      await saveFixturesToDB(nextData.response ?? []);
      saved += nextData.results ?? 0;
    }
  }

  // Date-based fallback for the next 3 days
  for (let d = 1; d <= 3; d++) {
    if (apiSuspended) break;
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + d);
    const dateStr = futureDate.toISOString().split("T")[0];
    const { data: futData, ok: futOk } = await apiFetch(`/fixtures?date=${dateStr}`, FIXTURE_LIST_TTL);
    if (futOk && futData && (futData.results ?? 0) > 0) {
      await saveFixturesToDB(futData.response ?? []);
      saved += futData.results ?? 0;
    }
  }

  return saved;
}

/** Schedule background refresh — starts immediately, then every 10 minutes. */
function scheduleBackgroundRefresh() {
  async function run() {
    if (bgRefreshRunning) return;
    bgRefreshRunning = true;
    const start = Date.now();
    try {
      console.log("[bg-refresh] Starting fixture refresh...");
      const count = await fetchAndCacheFixtures();
      lastBgRefresh = Date.now();
      console.log(`[bg-refresh] Done — fetched ${count} fixtures in ${Date.now() - start}ms`);
    } catch (err: any) {
      console.error("[bg-refresh] Error:", err.message);
    } finally {
      bgRefreshRunning = false;
    }
  }

  // Run once immediately on startup, then every 10 minutes
  setTimeout(run, 2000);
  setInterval(run, BG_REFRESH_INTERVAL);
}

scheduleBackgroundRefresh();

// ── Live Match Engine ── Worker 2 (60 s) + Worker 3 (90 s) ────────────────────
startLiveEngine();

// ── Pre-live top-league refresh ────────────────────────────────────────────
// Runs on startup (after 8s to avoid racing with bg refresh) then every 6h.
// Fetches upcoming NS fixtures for the 6 main leagues so they're always in DB.
// API cost: up to 6 calls per run (one per league), max twice per 6-hour window.
const PRELIVE_REFRESH_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
let preliveRefreshRunning = false;
let lastPreliveRefresh = 0;

async function fetchTopLeaguePrelive(forceMissing?: number[]): Promise<void> {
  if (preliveRefreshRunning) return;
  preliveRefreshRunning = true;

  try {
    // Check which top leagues already have upcoming fixtures in the DB
    // If forceMissing is provided, skip leagues already in DB entirely
    const { leaguesFound } = forceMissing
      ? { leaguesFound: new Set<number>() }
      : await getTopLeaguePrelivFromDB(TOP_SIX_LEAGUES);

    const missing = (forceMissing ?? TOP_SIX_LEAGUES).filter(id => !leaguesFound.has(id));

    if (missing.length === 0) {
      console.log("[prelive-refresh] All top leagues already in DB — skipping API calls");
      lastPreliveRefresh = Date.now();
      return;
    }

    console.log(`[prelive-refresh] Fetching upcoming fixtures for leagues: ${missing.join(", ")}`);
    const all: any[] = [];

    for (const leagueId of missing) {
      if (apiSuspended) break;

      // Try ?next=5 (works on paid plans)
      const { data: nextData, ok: nextOk } = await apiFetch(
        `/fixtures?league=${leagueId}&season=2025&next=5`,
        PRELIVE_TTL
      );
      if (nextOk && nextData && (nextData.results ?? 0) > 0) {
        all.push(...(nextData.response ?? []));
        continue;
      }

      // Fallback: try next 7 days by date — stop at first day that has matches
      for (let d = 0; d <= 6; d++) {
        if (apiSuspended) break;
        const dateStr = new Date(Date.now() + d * 86_400_000).toISOString().split("T")[0];
        const { data: dayData, ok: dayOk } = await apiFetch(
          `/fixtures?league=${leagueId}&season=2025&date=${dateStr}`,
          PRELIVE_TTL
        );
        if (dayOk && dayData && (dayData.results ?? 0) > 0) {
          all.push(...(dayData.response ?? []));
          break; // found a day with matches for this league — move on
        }
      }
    }

    if (all.length > 0) {
      await saveFixturesToDB(all);
      console.log(`[prelive-refresh] Saved ${all.length} pre-live fixtures for top leagues`);
    } else {
      console.log("[prelive-refresh] No upcoming top-league fixtures found (API may be suspended)");
    }

    lastPreliveRefresh = Date.now();
  } catch (err: any) {
    console.error("[prelive-refresh] Error:", err.message);
  } finally {
    preliveRefreshRunning = false;
  }
}

function schedulePreliveRefresh() {
  // First run: 8 seconds after startup (after bg-refresh starts at 2s)
  setTimeout(fetchTopLeaguePrelive, 8_000);
  setInterval(fetchTopLeaguePrelive, PRELIVE_REFRESH_INTERVAL);
}

schedulePreliveRefresh();

// ── Featured cache: Top Bets + Hot Matches ─────────────────────────────────
// Pre-computes the "Top 3 apostas do dia" and "Jogos quentes" from DB fixtures.
// API cost: 2 calls per analyzed fixture (team stats for home + away), max 6 fixtures.
// Cache TTL: 30 minutes. Triggers automatically after prelive refresh.

interface FeaturedBet {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string;
  awayLogo: string;
  league: { id: number; name: string; country: string; logo: string };
  date: string;
  market: string;
  probability: number;
  confidence: "High" | "Medium" | "Low";
  marketRating: string;
  insight: string;
}

interface HotMatch {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string;
  awayLogo: string;
  league: { id: number; name: string; country: string; logo: string };
  date: string;
  avgGoals: number | null;
  bttsPct: number | null;
  over25Pct: number | null;
  reason: string;
  hotScore: number;
}

let topBetsCache: { bets: FeaturedBet[]; ts: number } | null = null;
let hotMatchesCache: { matches: HotMatch[]; ts: number } | null = null;
let featuredRefreshRunning = false;
const FEATURED_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function warmupFeaturedCache(): Promise<void> {
  if (featuredRefreshRunning) return;
  featuredRefreshRunning = true;
  try {
    const { fixtures: prelive } = await getTopLeaguePrelivFromDB(TOP_SIX_LEAGUES);
    if (prelive.length === 0) {
      console.log("[featured-cache] No prelive fixtures in DB — skipping");
      return;
    }

    // Pick earliest fixture per league — max 6 fixtures total
    const perLeague = new Map<number, CachedFixture>();
    for (const f of prelive) {
      if (!perLeague.has(f.league.id)) perLeague.set(f.league.id, f);
    }
    const candidates = Array.from(perLeague.values());
    console.log(`[featured-cache] Analyzing ${candidates.length} fixtures for top bets / hot matches`);

    const bets: FeaturedBet[] = [];
    const hots: HotMatch[] = [];

    for (const f of candidates) {
      if (apiSuspended) break;

      const [{ data: homeData, ok: homeOk }, { data: awayData, ok: awayOk }] = await Promise.all([
        apiFetch(`/teams/statistics?team=${f.homeTeam.id}&league=${f.league.id}&season=2025`, STATS_TTL),
        apiFetch(`/teams/statistics?team=${f.awayTeam.id}&league=${f.league.id}&season=2025`, STATS_TTL),
      ]);

      const getAvg = (d: any, type: "for" | "against"): number => {
        const s = d?.response;
        if (!s) return 1.3;
        const g = type === "for" ? s.goals?.for : s.goals?.against;
        const total = g?.total?.total ?? 0;
        const played = s.fixtures?.played?.total ?? 1;
        return played > 0 ? total / played : 1.3;
      };

      const hasStats = homeOk && homeData?.response?.fixtures?.played?.total > 0
                    && awayOk && awayData?.response?.fixtures?.played?.total > 0;

      const hAtt = getAvg(homeData, "for");
      const hDef = getAvg(homeData, "against");
      const aAtt = getAvg(awayData, "for");
      const aDef = getAvg(awayData, "against");
      const avgGoals = hasStats ? parseFloat((hAtt + aAtt).toFixed(2)) : null;

      const probs = calcMatchProbabilities(hAtt, hDef, aAtt, aDef).probabilities;

      const homeName = f.homeTeam.name;
      const awayName = f.awayTeam.name;

      const betCandidates = [
        { market: `${homeName} Ganha`,  prob: probs.homeWin },
        { market: `${awayName} Ganha`,  prob: probs.awayWin },
        { market: "Mais de 2.5 Gols",   prob: probs.over25  },
        { market: "Ambas Marcam",        prob: probs.btts    },
      ];
      const best = betCandidates.sort((a, b) => b.prob - a.prob)[0];
      const probability = Math.round(best.prob * 100);

      const confidence: "High" | "Medium" | "Low" =
        probability >= 68 ? "High" : probability >= 58 ? "Medium" : "Low";
      const marketRating =
        probability >= 76 ? "Strong Value"
        : probability >= 61 ? "Boa Oportunidade"
        : probability >= 46 ? "Moderado"
        : "Baixa Confiança";

      let insight = "Análise baseada em dados da temporada 2025.";
      if (avgGoals !== null && avgGoals >= 2.8)
        insight = `Média combinada de ${avgGoals.toFixed(1)} gols — jogo com tendência de muitos gols.`;
      else if (best.market === "Ambas Marcam" && probability >= 60)
        insight = "Alta frequência de ambas as equipes marcarem nesta temporada.";
      else if (best.market === "Mais de 2.5 Gols" && probability >= 60)
        insight = `Ambas as equipes marcam em média mais de 1.3 gols. Fixture de alto valor.`;
      else if (best.market.includes("Ganha") && probability >= 65)
        insight = `${best.market.replace(" Ganha", "")} em vantagem pelo desempenho recente.`;

      const leagueInfo = { id: f.league.id, name: f.league.name, country: f.league.country, logo: f.league.logo };

      if (probability >= 65) {
        bets.push({
          fixtureId: f.id, homeTeam: homeName, awayTeam: awayName,
          homeLogo: f.homeTeam.logo, awayLogo: f.awayTeam.logo,
          league: leagueInfo, date: f.date,
          market: best.market, probability, confidence, marketRating, insight,
        });
      }

      const leaguePriorityScore = 8 - (TOP_SIX_LEAGUES.indexOf(f.league.id) === -1 ? 9 : TOP_SIX_LEAGUES.indexOf(f.league.id));
      const goalTrendScore = avgGoals != null ? Math.min(avgGoals / 4.0, 1.0) * 3.0 : 0;
      const hotScore = parseFloat((leaguePriorityScore + goalTrendScore).toFixed(2));

      const bttsPct = hasStats ? Math.round(Math.min(90, Math.max(5, probs.btts * 100))) : null;
      const over25Pct = hasStats ? Math.round(Math.min(90, Math.max(5, probs.over25 * 100))) : null;

      hots.push({
        fixtureId: f.id, homeTeam: homeName, awayTeam: awayName,
        homeLogo: f.homeTeam.logo, awayLogo: f.awayTeam.logo,
        league: leagueInfo, date: f.date, avgGoals, bttsPct, over25Pct, hotScore,
        reason: avgGoals !== null
          ? `Média de ${avgGoals.toFixed(1)} gols/jogo · ${leagueInfo.name}`
          : `Jogo de alto interesse · ${leagueInfo.name}`,
      });
    }

    topBetsCache = { bets: bets.sort((a, b) => b.probability - a.probability).slice(0, 3), ts: Date.now() };
    hotMatchesCache = { matches: hots.sort((a, b) => b.hotScore - a.hotScore).slice(0, 5), ts: Date.now() };
    console.log(`[featured-cache] Computed ${topBetsCache.bets.length} top bets, ${hotMatchesCache.matches.length} hot matches`);
  } catch (err: any) {
    console.error("[featured-cache] Error:", err.message);
  } finally {
    featuredRefreshRunning = false;
  }
}

function scheduleFeaturedRefresh() {
  // Run 12s after startup (after prelive-refresh at 8s), then every 30 min
  setTimeout(warmupFeaturedCache, 12_000);
  setInterval(() => {
    if (!topBetsCache || Date.now() - topBetsCache.ts > FEATURED_CACHE_TTL) {
      warmupFeaturedCache().catch(() => {});
    }
  }, FEATURED_CACHE_TTL);
}

scheduleFeaturedRefresh();

// ── Live-match 60-second poller ────────────────────────────────────────────
// Polls /fixtures?live=all every 30 s — only when live matches exist in DB.
// Single efficient API call; result updates those specific fixtures in DB.
const LIVE_STATUS_CODES = new Set(["1H", "2H", "ET", "HT", "P", "BT"]);
let liveRefreshRunning    = false;
let lastRefreshAttemptTs  = 0;   // tracks last cycle start — used by 60 s watchdog
let lastLiveDetectedTs    = 0;   // last time we found live matches — drives 120 s no-live watchdog

/** Helper: enrich a single match with its stats + events snapshot. */
function enrichMatchForResponse(m: LiveFixture, ts: number) {
  const stats  = getLiveStats(m.fixtureId);
  const evData = getLiveEvents(m.fixtureId);
  const hasRealStats = stats && (
    stats.home.shots > 0 || stats.away.shots > 0 ||
    stats.home.shotsOnTarget > 0 || stats.home.corners > 0
  );
  return {
    ...m,
    stats:       hasRealStats ? stats : null,
    statsStale:  stats  ? (ts - stats.ts  > 90_000) : false,
    events:      evData?.events ?? null,
    eventsStale: evData ? (ts - evData.ts > 90_000) : false,
  };
}

/** Builds the exact same payload as GET /live/matches and pushes it via WS. */
function buildAndBroadcast(): void {
  const matches   = getLiveMatches();
  const finished  = getFinishedMatches();
  const ts        = Date.now();
  const enriched  = matches.map(m => enrichMatchForResponse(m, ts));
  broadcastLiveUpdate({
    available: enriched.length > 0,
    count:     enriched.length,
    matches:   enriched,
    finished,
    ts,
  });
}

async function refreshLiveMatches() {
  if (liveRefreshRunning) return;       // only block concurrent runs
  liveRefreshRunning   = true;
  lastRefreshAttemptTs = Date.now();
  const startedAt      = Date.now();

  // Inner watchdog: if this run takes > 36 s something is hung — force-release
  // the lock so the next 30 s tick (or the outer 60 s watchdog) can proceed.
  const watchdog = setTimeout(() => {
    if (liveRefreshRunning) {
      console.warn("[live-refresh] Watchdog: force-releasing stuck refresh lock after 36 s");
      liveRefreshRunning = false;
    }
  }, 36_000);

  try {
    // ── Step 1: DB check (zero API cost — always available) ──────────────
    const { fixtures: dbFixtures } = await getFixturesFromDB();
    const hasLive = dbFixtures.some(f => LIVE_STATUS_CODES.has(f.status.short));

    if (!hasLive) {
      // No live matches in DB — broadcast the empty state so the frontend shows
      // "No live matches right now. Monitoring new games..." instead of going stale.
      buildAndBroadcast();

      // 120 s watchdog: if we've had no live matches for too long, re-fetch the full
      // schedule from the API.  This catches matches that just kicked off but haven't
      // yet been picked up by the 10-minute bg-refresh cycle.
      const noLiveGap = lastLiveDetectedTs > 0 ? Date.now() - lastLiveDetectedTs : 0;
      if (noLiveGap > 120_000) {
        console.log(
          `[live-refresh] No live matches for ${Math.round(noLiveGap / 1000)} s — ` +
          `triggering schedule re-fetch`
        );
        lastLiveDetectedTs = Date.now(); // reset so we don't spam
        fetchAndCacheFixtures().catch(() => {}); // non-blocking
      }
      return;
    }

    // Live matches detected — stamp the time and proceed
    lastLiveDetectedTs = Date.now();
    console.log("[live-refresh] Live matches detected — polling /fixtures?live=all");

    // ── Step 2: Fetch fresh data ─────────────────────────────────────────
    let data: any = null;
    let ok        = false;

    if (apiSuspended) {
      // API is rate-limited — skip all retry waits (they return null immediately).
      // Serve the in-memory stale cache if present; otherwise broadcast engine state.
      const stale = (cache as Map<string, { data: any; ts: number }>).get("/fixtures?live=all");
      if (stale?.data) {
        data = stale.data;
        ok   = true;
        console.warn("[live-refresh] API suspended — serving stale cache without retrying");
      } else {
        console.warn("[live-refresh] API suspended, no cache — broadcasting last engine state");
      }
    } else {
      // Normal path: up to 3 attempts, 10 s apart (spec)
      for (let attempt = 1; attempt <= 3; attempt++) {
        ({ data, ok } = await apiFetch("/fixtures?live=all", LIVE_TTL));
        if (ok && data !== null) break;
        if (attempt < 3) {
          console.warn(`[live-refresh] Attempt ${attempt}/3 empty — retrying in 10 s`);
          await new Promise(r => setTimeout(r, 10_000));
        }
      }
    }

    // ── Step 3: Update engine + broadcast ────────────────────────────────
    if (ok && data && (data.results ?? 0) > 0) {
      await saveFixturesToDB(data.response ?? []);
      updateFromApiResponse(data.response ?? []);
      console.log(`[live-refresh] Updated ${data.results} live fixtures in ${Date.now() - startedAt} ms`);
    } else if (ok && data && data.results === 0) {
      updateFromApiResponse([]);
    } else {
      // All attempts failed or API suspended with no cache — keep engine as-is
      console.warn("[live-refresh] No fresh data available — broadcasting stale engine state");
    }
    buildAndBroadcast();

  } catch (err: any) {
    console.error("[live-refresh] Error:", err.message);
    buildAndBroadcast(); // always push something so clients stay alive
  } finally {
    clearTimeout(watchdog);
    liveRefreshRunning = false;
  }
}

setInterval(refreshLiveMatches, 30 * 1000); // primary poll: every 30 s

// ── 60 s outer watchdog ────────────────────────────────────────────────────────
// Guards against setInterval stalls or the function getting permanently stuck.
// If no refresh attempt has started in the last 60 s, force-reset and restart.
setInterval(() => {
  const gap = Date.now() - lastRefreshAttemptTs;
  if (lastRefreshAttemptTs > 0 && gap > 60_000) {
    console.warn(`[live-watchdog] No refresh in ${Math.round(gap / 1000)} s — force-restarting`);
    liveRefreshRunning = false; // release any stuck lock
    refreshLiveMatches().catch(() => {});
  }
}, 60_000);

// ── API Health Check — every 60 s ─────────────────────────────────────────────
// Only runs when the API is suspended (apiSuspended = true) to avoid extra calls
// during normal operation.  Uses apiFetchPlayer so this never re-triggers suspension.
// On a successful ping the suspension flag is cleared so live polling can resume.
async function runApiHealthCheck(): Promise<void> {
  if (!apiSuspended) return;
  console.log("[health-check] API suspended — pinging /status to check recovery");
  try {
    const { data, ok } = await apiFetchPlayer("/status", 55_000);
    if (ok && data?.response) {
      console.log("[health-check] API-Football responding — clearing suspension, resuming live polling");
      apiSuspended    = false;
      lastSuspendedCheck = 0;
    } else {
      console.warn("[health-check] API-Football still unavailable — will retry in 60 s");
    }
  } catch {
    console.warn("[health-check] Ping failed — will retry in 60 s");
  }
}
setInterval(runApiHealthCheck, 60_000);

// ── top-bets ──────────────────────────────────────────────────────────────────
router.get("/top-bets", async (_req, res) => {
  try {
    if (!topBetsCache || Date.now() - topBetsCache.ts > FEATURED_CACHE_TTL) {
      warmupFeaturedCache().catch(() => {});
    }
    const bets = topBetsCache?.bets ?? [];
    return res.json({
      available: bets.length > 0,
      bets,
      updatedAt: topBetsCache?.ts ?? null,
    });
  } catch (err: any) {
    console.error("[top-bets] Error:", err.message);
    return res.json({ available: false, bets: [] });
  }
});

// ── hot-matches ────────────────────────────────────────────────────────────────
router.get("/hot-matches", async (_req, res) => {
  try {
    if (!hotMatchesCache || Date.now() - hotMatchesCache.ts > FEATURED_CACHE_TTL) {
      warmupFeaturedCache().catch(() => {});
    }
    const matches = hotMatchesCache?.matches ?? [];
    return res.json({
      available: matches.length > 0,
      matches,
      updatedAt: hotMatchesCache?.ts ?? null,
    });
  } catch (err: any) {
    console.error("[hot-matches] Error:", err.message);
    return res.json({ available: false, matches: [] });
  }
});

// ── prelive-matches ────────────────────────────────────────────────────────────
// Always returns upcoming (NS) fixtures from the 6 main leagues.
// Reads from DB cache first; triggers background refresh if any league is missing.
// Sort: by kickoff time ascending (earliest first).
router.get("/prelive-matches", async (_req, res) => {
  try {
    const { fixtures: dbFixtures, leaguesFound } = await getTopLeaguePrelivFromDB(TOP_SIX_LEAGUES);

    // Kick off a background refresh for any missing leagues (non-blocking)
    const missingLeagues = TOP_SIX_LEAGUES.filter(id => !leaguesFound.has(id));
    if (missingLeagues.length > 0 && !apiSuspended) {
      fetchTopLeaguePrelive(missingLeagues).catch(() => {});
    }

    if (dbFixtures.length === 0) {
      return res.json({
        total: 0,
        matches: [],
        available: false,
        message: "Próximos jogos indisponíveis no momento",
        leaguesFound: [],
        leaguesMissing: TOP_SIX_LEAGUES,
      });
    }

    // Map CachedFixture → LiveMatch-compatible shape
    const matches = dbFixtures
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(f => ({
        id: f.id,
        date: f.date,
        status: f.status,
        league: { ...f.league, flag: "" },  // flag not stored in DB; frontend handles it gracefully
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
        score: f.score,
      }));

    return res.json({
      total: matches.length,
      matches,
      available: true,
      leaguesFound: Array.from(leaguesFound),
      leaguesMissing: missingLeagues,
    });
  } catch (err: any) {
    console.error("[prelive-matches] Error:", err.message);
    return res.json({
      total: 0,
      matches: [],
      available: false,
      message: "Próximos jogos indisponíveis no momento",
    });
  }
});

// ── matches-today ──────────────────────────────────────────────────────────────
router.get("/matches-today", async (_req, res) => {
  try {
    // ── Step 1: Check DB for fresh cached fixtures ─────────────────────────
    const { fixtures: dbFixtures, ageMs, count: dbCount } = await getFixturesFromDB();
    const dbIsFresh = isDBFresh(ageMs);

    if (dbIsFresh && dbCount > 0) {
      console.log(`[matches-today] Serving ${dbCount} fixtures from DB cache (age: ${Math.round(ageMs / 1000)}s)`);
      const now = new Date();
      const isUpcoming = dbFixtures.every(f => new Date(f.date) > now);
      return res.json({
        total: dbCount,
        matches: dbFixtures,
        demo: false,
        stale: false,
        isUpcoming,
        apiStatus: "db_cache",
      });
    }

    if (dbCount > 0) {
      console.log(`[matches-today] DB has ${dbCount} stale fixtures (age: ${Math.round(ageMs / 1000)}s) — will try API refresh`);
    }

    // ── Step 2: Try API (today + ?next=20 + date fallback) ────────────────
    const today = new Date().toISOString().split("T")[0];
    console.log(`[matches-today] Fetching fresh fixtures for date: ${today}`);

    const { data, ok, stale } = await apiFetch(`/fixtures?date=${today}`, FIXTURE_LIST_TTL);
    console.log(`[matches-today] Today's fixtures — ok: ${ok}, results: ${data?.results ?? 0}, stale: ${stale ?? false}`);

    if (ok && data && (data.results ?? 0) > 0) {
      const raw: any[] = data.response ?? [];
      saveFixturesToDB(raw).catch(() => {}); // async — don't block response
      const matches = raw
        .map((item: any) => { try { return mapFixture(item); } catch { return null; } })
        .filter(Boolean);
      console.log(`[matches-today] Returning ${matches.length} live fixtures`);
      return res.json({ total: matches.length, matches, demo: false, stale: false, isUpcoming: false, apiStatus: "api_live" });
    }

    // Fallback 1: ?next=20
    console.log(`[matches-today] No today fixtures — trying /fixtures?next=20`);
    const { data: nextData, ok: nextOk } = await apiFetch(`/fixtures?next=20`, FIXTURE_LIST_TTL);
    console.log(`[matches-today] ?next=20 — ok: ${nextOk}, results: ${nextData?.results ?? 0}`);

    if (nextOk && nextData && (nextData.results ?? 0) > 0) {
      const raw: any[] = nextData.response ?? [];
      saveFixturesToDB(raw).catch(() => {});
      const matches = raw
        .map((item: any) => { try { return mapFixture(item); } catch { return null; } })
        .filter(Boolean);
      return res.json({ total: matches.length, matches, demo: false, stale: false, isUpcoming: true, apiStatus: "api_next" });
    }

    // Fallback 2: next 3 days by date
    for (let d = 1; d <= 3; d++) {
      if (apiSuspended) break;
      const futDate = new Date();
      futDate.setDate(futDate.getDate() + d);
      const dateStr = futDate.toISOString().split("T")[0];
      const { data: futData, ok: futOk } = await apiFetch(`/fixtures?date=${dateStr}`, FIXTURE_LIST_TTL);
      console.log(`[matches-today] +${d}d (${dateStr}) — ok: ${futOk}, results: ${futData?.results ?? 0}`);
      if (futOk && futData && (futData.results ?? 0) > 0) {
        const raw: any[] = futData.response ?? [];
        saveFixturesToDB(raw).catch(() => {});
        const matches = raw
          .map((item: any) => { try { return mapFixture(item); } catch { return null; } })
          .filter(Boolean);
        return res.json({ total: matches.length, matches, demo: false, stale: false, isUpcoming: true, upcomingDate: dateStr, apiStatus: "api_date_fallback" });
      }
    }

    // ── Step 3: Serve stale DB data if API completely failed ──────────────
    if (dbCount > 0) {
      console.warn(`[matches-today] API unavailable — serving ${dbCount} stale DB fixtures (age: ${Math.round(ageMs / 1000)}s)`);
      const now = new Date();
      const isUpcoming = dbFixtures.every(f => new Date(f.date) > now);
      return res.json({
        total: dbCount,
        matches: dbFixtures,
        demo: false,
        stale: true,
        isUpcoming,
        apiStatus: "db_stale",
      });
    }

    // ── Step 4: Nothing available anywhere ───────────────────────────────
    const finalStatus = apiSuspended ? "daily_limit" : "unavailable";
    console.warn(`[matches-today] No fixtures anywhere — status: ${finalStatus}`);
    return res.json({ total: 0, matches: [], demo: false, stale: false, isUpcoming: false, apiStatus: finalStatus });

  } catch (err: any) {
    console.error("[matches-today] Unhandled error:", err.message);
    return res.json({ total: 0, matches: [], demo: false, stale: false, isUpcoming: false, apiStatus: "error" });
  }
});

// ── fixture/:id ────────────────────────────────────────────────────────────────
// Load order: API in-memory cache → DB → live API call.
// This ensures the page always loads even when the API is suspended / rate-limited,
// because the DB is populated by the background refresh worker every 10 minutes.
router.get("/fixture/:id", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);
    if (isNaN(fixtureId)) {
      return res.json({ found: false, reason: "invalid_id" });
    }

    // 1. Check shared in-memory API cache (fastest path)
    const cacheKey = `/fixtures?id=${fixtureId}`;
    const cached = (cache as Map<string, { data: any; ts: number }>).get(cacheKey);
    if (cached && Date.now() - cached.ts < MATCH_TTL && cached.data?.response?.[0]) {
      return res.json({ found: true, stale: false, demo: false, ...mapFixture(cached.data.response[0]) });
    }

    // 2. Check DB — always available even when the API is suspended
    const dbFixture = await getFixtureByIdFromDB(fixtureId);
    if (dbFixture) {
      return res.json({ found: true, stale: true, demo: false, ...mapDbFixture(dbFixture) });
    }

    // 3. Live API call
    const { data, ok, stale } = await apiFetch(cacheKey, MATCH_TTL);
    if (ok && data?.response?.[0]) {
      return res.json({ found: true, stale: !!stale, demo: false, ...mapFixture(data.response[0]) });
    }

    // Nothing found anywhere — safe 200 so the frontend never throws
    return res.json({ found: false, reason: "unavailable" });
  } catch (err: any) {
    console.error("[fixture/:id]", err.message);
    return res.json({ found: false, reason: "error" });
  }
});

// ── fixture/:id/stats ──────────────────────────────────────────────────────────
// Load order: live-engine in-memory cache → apiFetchPlayer with up to 3 retries (3 s apart).
// Uses apiFetchPlayer so a rate-limit hit here never cascades to suspend other modules.
// The live-engine path covers all currently live matches with zero API calls.
const FIXTURE_STATS_TTL = 30 * 1000; // 30 s — keeps in-match data fresh without hammering the quota

router.get("/fixture/:id/stats", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);

    // ── 1. Live engine — instant, no API cost ──────────────────────────────
    const liveStats = getLiveStats(fixtureId);
    if (liveStats) {
      const mapTeam = (t: typeof liveStats.home) => ({
        team: { name: t.team },
        statistics: [
          { type: "Shots on Goal",     value: t.shotsOnTarget    },
          { type: "Total Shots",       value: t.shots            },
          { type: "Ball Possession",   value: t.possession       },
          { type: "Corner Kicks",      value: t.corners          },
          { type: "Fouls",             value: t.fouls            },
          { type: "Yellow Cards",      value: t.yellowCards      },
          { type: "Red Cards",         value: t.redCards         },
          { type: "Dangerous Attacks", value: t.dangerousAttacks },
          { type: "Goalkeeper Saves",  value: 0                  },
        ],
      });
      return res.json({
        stats:     [mapTeam(liveStats.home), mapTeam(liveStats.away)],
        available: true,
        source:    "live",
      });
    }

    // ── 2. API with retry — uses apiFetchPlayer to isolate from apiSuspended ─
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { data, ok } = await apiFetchPlayer(
        `/fixtures/statistics?fixture=${fixtureId}`,
        FIXTURE_STATS_TTL,
      );
      if (ok && data?.response?.length > 0) {
        return res.json({ stats: data.response, available: true, source: "api" });
      }
      if (attempt < 3) {
        console.warn(`[fixture/stats] Attempt ${attempt}/3 empty — retrying in 3 s`);
        await new Promise(r => setTimeout(r, 3_000));
      }
    }

    // ── 3. All retries failed — graceful empty ─────────────────────────────
    console.warn(`[fixture/stats] All attempts failed for fixture ${fixtureId}`);
    return res.json({ stats: [], available: false });

  } catch (err: any) {
    console.error("[fixture/stats]", err.message);
    return res.json({ stats: [], available: false });
  }
});

// ── /trader ────────────────────────────────────────────────────────────────────
// Trader Center: live-engine derived signals — zero API quota cost.
// Modules: Hot Ranking (top 5) | Over Scanner (max 4) | Goal Alert | momentum data.

interface TraderMatch {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  elapsed: number;
  status: string;
  homeTeamLogo: string;
  awayTeamLogo: string;
  league: string;
  goalPressureScore: number;
  homePressure: number;
  awayPressure: number;
  totalSoT: number;
  totalDA: number;
  totalShots: number;
  shotsDelta: number;
  attacksDelta: number;
  signal?: string;
}

// Snapshot store for 5-min delta (Goal Alert)
const traderSnapshots = new Map<number, { ts: number; shotsOnTarget: number; dangerousAttacks: number }>();
const TRADER_SNAPSHOT_WINDOW = 5 * 60 * 1000;

router.get("/trader", (req, res) => {
  const now     = Date.now();
  const matches = getLiveMatches().slice(0, 25);

  const processed: TraderMatch[] = matches.map(m => {
    const stats = getLiveStats(m.fixtureId);
    const h = stats?.home;
    const a = stats?.away;

    const homeSoT   = h?.shotsOnTarget    ?? 0;
    const awaySoT   = a?.shotsOnTarget    ?? 0;
    const homeDA    = h?.dangerousAttacks ?? 0;
    const awayDA    = a?.dangerousAttacks ?? 0;
    const homeShots = h?.shots            ?? 0;
    const awayShots = a?.shots            ?? 0;

    const totalSoT   = homeSoT + awaySoT;
    const totalDA    = homeDA  + awayDA;
    const totalShots = homeShots + awayShots;

    const goalPressureScore = (totalSoT * 3) + (totalDA * 2) + (totalShots * 1.5);
    const homePressure      = (homeSoT * 3) + homeDA;
    const awayPressure      = (awaySoT * 3) + awayDA;

    // Last-5-min delta for Goal Alert
    const snap = traderSnapshots.get(m.fixtureId);
    let shotsDelta   = 0;
    let attacksDelta = 0;
    if (snap && now - snap.ts <= TRADER_SNAPSHOT_WINDOW * 1.5) {
      shotsDelta   = Math.max(0, totalSoT - snap.shotsOnTarget);
      attacksDelta = Math.max(0, totalDA  - snap.dangerousAttacks);
    }
    if (!snap || now - snap.ts >= TRADER_SNAPSHOT_WINDOW) {
      traderSnapshots.set(m.fixtureId, { ts: now, shotsOnTarget: totalSoT, dangerousAttacks: totalDA });
    }

    return {
      fixtureId:         m.fixtureId,
      homeTeam:          m.homeTeam,
      awayTeam:          m.awayTeam,
      homeScore:         m.homeScore,
      awayScore:         m.awayScore,
      elapsed:           m.elapsed ?? 0,
      status:            m.status,
      homeTeamLogo:      m.homeTeamLogo,
      awayTeamLogo:      m.awayTeamLogo,
      league:            m.league,
      goalPressureScore,
      homePressure,
      awayPressure,
      totalSoT,
      totalDA,
      totalShots,
      shotsDelta,
      attacksDelta,
    };
  });

  // Module 1: Hot Ranking (top 5 by goalPressureScore)
  const hotRanking = [...processed]
    .sort((a, b) => b.goalPressureScore - a.goalPressureScore)
    .slice(0, 5);

  // Module 2: Over Scanner (max 4 signals)
  const overSignals: TraderMatch[] = [];
  for (const m of processed) {
    if (m.elapsed >= 35 && m.totalSoT >= 6 && m.totalDA >= 25) {
      overSignals.push({ ...m, signal: "over_1_5" });
    } else if (m.elapsed >= 20 && m.totalSoT >= 4 && m.totalDA >= 15) {
      overSignals.push({ ...m, signal: "over_0_5" });
    }
  }

  // Module 3: Goal Alert
  const goalAlerts = processed.filter(m => m.shotsDelta >= 2 && m.attacksDelta >= 6);

  return res.json({
    hotRanking,
    overSignals: overSignals.slice(0, 4),
    goalAlerts,
    liveCount: matches.length,
    ts: now,
  });
});

// ── fixture/:id/team-stats ─────────────────────────────────────────────────────
// Returns season statistics for both teams, with fallback to last-5 averages.
router.get("/fixture/:id/team-stats", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);

    const { data: fixData, ok: fixOk } = await apiFetch(`/fixtures?id=${fixtureId}`, MATCH_TTL);
    if (!fixOk || !fixData?.response?.[0]) {
      return res.json({ available: false, reason: "fixture_not_found" });
    }

    const item = fixData.response[0];
    const homeId   = item.teams.home.id;
    const awayId   = item.teams.away.id;
    const leagueId = item.league.id;
    const homeName = item.teams.home.name ?? "Home";
    const awayName = item.teams.away.name ?? "Away";

    // Helper: build a TeamStats object from /teams/statistics response
    const buildFromSeasonStats = (s: any) => {
      if (!s) return null;
      const played = s.fixtures?.played?.total ?? 0;
      if (played === 0) return null;
      return {
        played,
        wins:           s.fixtures?.wins?.total   ?? 0,
        draws:          s.fixtures?.draws?.total  ?? 0,
        losses:         s.fixtures?.loses?.total  ?? 0,
        goalsScored:    s.goals?.for?.total?.total       ?? 0,
        goalsConceded:  s.goals?.against?.total?.total   ?? 0,
        avgGoalsScored:   s.goals?.for?.average?.total    ?? null,
        avgGoalsConceded: s.goals?.against?.average?.total ?? null,
        shotsTotal:     s.shots?.total ?? null,
        shotsOnTarget:  s.shots?.on    ?? null,
        cornersTotal:   null, // not available in season stats endpoint
        foulsTotal:     s.fouls?.committed ?? null,
        yellowCards:    s.cards?.yellow?.total ?? null,
        redCards:       s.cards?.red?.total    ?? null,
        cleanSheets:    s.clean_sheet?.total   ?? 0,
        failedToScore:  s.failed_to_score?.total ?? 0,
        form:           s.form ?? null,
        source:         "season",
      };
    };

    // Helper: build stats from last-5 fixtures (fallback) for a specific team
    const buildFromLast5 = (fixtures: any[], teamId: number) => {
      if (!fixtures || fixtures.length === 0) return null;
      let goalsScored = 0, goalsConceded = 0, wins = 0, draws = 0, losses = 0;
      let cleanSheets = 0, failedToScore = 0;
      const played = fixtures.length;

      for (const f of fixtures) {
        const goals  = f.goals ?? {};
        const isHome = f.teams?.home?.id === teamId;
        const gs = isHome ? (goals.home ?? 0) : (goals.away  ?? 0);
        const gc = isHome ? (goals.away  ?? 0) : (goals.home ?? 0);
        goalsScored   += gs;
        goalsConceded += gc;
        if (gc === 0) cleanSheets++;
        if (gs === 0) failedToScore++;
        if (gs > gc) wins++;
        else if (gs < gc) losses++;
        else draws++;
      }

      return {
        played,
        wins,
        draws,
        losses,
        goalsScored,
        goalsConceded,
        avgGoalsScored:   played > 0 ? (goalsScored   / played).toFixed(2) : null,
        avgGoalsConceded: played > 0 ? (goalsConceded / played).toFixed(2) : null,
        shotsTotal:      shots     > 0 ? shots     : null,
        shotsOnTarget:   shotsOnTarget > 0 ? shotsOnTarget : null,
        cornersTotal:    corners   > 0 ? corners   : null,
        foulsTotal:      fouls     > 0 ? fouls     : null,
        yellowCards:     yellowCards > 0 ? yellowCards : null,
        redCards:        redCards  > 0 ? redCards  : null,
        cleanSheets,
        failedToScore,
        form: null,
        source: "last5",
      };
    };

    // Fetch season stats for both teams in parallel
    const [{ data: homeSeasonData, ok: homeSeasonOk }, { data: awaySeasonData, ok: awaySeasonOk }] = await Promise.all([
      apiFetch(`/teams/statistics?team=${homeId}&league=${leagueId}&season=2025`, STATS_TTL),
      apiFetch(`/teams/statistics?team=${awayId}&league=${leagueId}&season=2025`, STATS_TTL),
    ]);

    let homeStats = buildFromSeasonStats(homeSeasonOk ? homeSeasonData?.response : null);
    let awayStats = buildFromSeasonStats(awaySeasonOk ? awaySeasonData?.response : null);

    // Retry once for any team with empty stats (could be temporary API hiccup)
    if (!homeStats) {
      const { data: retry, ok: retryOk } = await apiFetch(
        `/teams/statistics?team=${homeId}&league=${leagueId}&season=2025`,
        1000 // force fresh fetch (tiny TTL)
      );
      homeStats = buildFromSeasonStats(retryOk ? retry?.response : null);
    }
    if (!awayStats) {
      const { data: retry, ok: retryOk } = await apiFetch(
        `/teams/statistics?team=${awayId}&league=${leagueId}&season=2025`,
        1000
      );
      awayStats = buildFromSeasonStats(retryOk ? retry?.response : null);
    }

    // Fallback to last-5 fixtures if season stats still empty
    if (!homeStats) {
      const { data: f5, ok: f5Ok } = await apiFetch(`/fixtures?team=${homeId}&last=5`, STATS_TTL);
      homeStats = buildFromLast5(f5Ok ? (f5?.response ?? []) : [], homeId);
    }
    if (!awayStats) {
      const { data: f5, ok: f5Ok } = await apiFetch(`/fixtures?team=${awayId}&last=5`, STATS_TTL);
      awayStats = buildFromLast5(f5Ok ? (f5?.response ?? []) : [], awayId);
    }

    return res.json({
      available: !!(homeStats || awayStats),
      home: { name: homeName, stats: homeStats },
      away: { name: awayName, stats: awayStats },
    });
  } catch (err: any) {
    console.error("[fixture/team-stats]", err.message);
    return res.json({ available: false, reason: "error" });
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
      `/fixtures/headtohead?h2h=${homeId}-${awayId}&last=3`,
      6 * 60 * 60 * 1000
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

// ── fixture/:id/standings ──────────────────────────────────────────────────────
router.get("/fixture/:id/standings", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);
    const { data: fixData, ok: fixOk } = await apiFetch(`/fixtures?id=${fixtureId}`, MATCH_TTL);
    if (!fixOk || !fixData?.response?.[0]) {
      return res.json({ available: false });
    }

    const item = fixData.response[0];
    const leagueId = item.league?.id;
    const season   = item.league?.season ?? 2024;
    const homeId   = item.teams?.home?.id;
    const awayId   = item.teams?.away?.id;

    const { data: sd, ok: sdOk } = await apiFetch(
      `/standings?league=${leagueId}&season=${season}`,
      STATS_TTL
    );

    if (!sdOk || !sd?.response?.[0]) {
      return res.json({ available: false });
    }

    const groups: any[][] = sd.response[0]?.league?.standings ?? [];
    let homeRank: number | null = null;
    let awayRank: number | null = null;
    let homePoints: number | null = null;
    let awayPoints: number | null = null;
    let homeForm: string | null = null;
    let awayForm: string | null = null;

    for (const group of groups) {
      for (const entry of group) {
        if (entry.team?.id === homeId) {
          homeRank = entry.rank;
          homePoints = entry.points;
          homeForm = entry.form ?? null;
        }
        if (entry.team?.id === awayId) {
          awayRank = entry.rank;
          awayPoints = entry.points;
          awayForm = entry.form ?? null;
        }
      }
    }

    return res.json({
      available: homeRank !== null || awayRank !== null,
      home: homeRank !== null ? { rank: homeRank, points: homePoints, form: homeForm } : null,
      away: awayRank !== null ? { rank: awayRank, points: awayPoints, form: awayForm } : null,
    });
  } catch (err: any) {
    console.error("[fixture/standings]", err.message);
    return res.json({ available: false });
  }
});

// ── fixture/:id/last5 ─────────────────────────────────────────────────────────
router.get("/fixture/:id/last5", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);

    const { data: fixData, ok: fixOk } = await apiFetch(`/fixtures?id=${fixtureId}`, MATCH_TTL);
    if (!fixOk || !fixData?.response?.[0]) {
      return res.status(404).json({ error: "Fixture not found" });
    }

    const item = fixData.response[0];
    const homeId = item.teams.home.id;
    const awayId = item.teams.away.id;

    const [{ data: homeData, ok: homeOk }, { data: awayData, ok: awayOk }] = await Promise.all([
      apiFetch(`/fixtures?team=${homeId}&last=5`, FORM_TTL),
      apiFetch(`/fixtures?team=${awayId}&last=5`, FORM_TTL),
    ]);

    const mapFix = (f: any) => ({
      id:       f.fixture?.id,
      date:     f.fixture?.date,
      homeTeam: { name: f.teams?.home?.name, logo: f.teams?.home?.logo, winner: f.teams?.home?.winner },
      awayTeam: { name: f.teams?.away?.name, logo: f.teams?.away?.logo, winner: f.teams?.away?.winner },
      score:    { home: f.goals?.home, away: f.goals?.away },
      league:   { name: f.league?.name, logo: f.league?.logo },
      status:   f.fixture?.status?.short,
    });

    return res.json({
      home: homeOk ? (homeData?.response ?? []).map(mapFix) : [],
      away: awayOk ? (awayData?.response ?? []).map(mapFix) : [],
    });
  } catch (err: any) {
    console.error("[fixture/last5]", err.message);
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
      apiFetch(`/teams/statistics?team=${homeTeamId}&league=${leagueId}&season=2025`, STATS_TTL),
      apiFetch(`/teams/statistics?team=${awayTeamId}&league=${leagueId}&season=2025`, STATS_TTL),
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

    const homeStats = mapStats(hs);
    const awayStats = mapStats(as_);

    // ── Best Bet selection ─────────────────────────────────────────────────
    const p = result.probabilities;
    const homeName = item.teams.home.name ?? "Home";
    const awayName = item.teams.away.name ?? "Away";

    const betCandidates = [
      { market: `${homeName} Win`,      prob: p.homeWin,  threshold: 0.52 },
      { market: `${awayName} Win`,      prob: p.awayWin,  threshold: 0.52 },
      { market: "Over 2.5 Goals",       prob: p.over25,   threshold: 0.50 },
      { market: "Both Teams to Score",  prob: p.btts,     threshold: 0.52 },
      { market: "Draw",                 prob: p.draw,     threshold: 0.32 },
    ];

    const bestBetCandidate = betCandidates
      .filter(b => b.prob >= b.threshold)
      .sort((a, b) => b.prob - a.prob)[0] ?? null;

    const bestBet = bestBetCandidate
      ? {
          market: bestBetCandidate.market,
          probability: Math.round(bestBetCandidate.prob * 100),
          confidence: bestBetCandidate.prob >= 0.68 ? "High" : bestBetCandidate.prob >= 0.58 ? "Medium" : "Low",
        }
      : null;

    // ── Quick Reasons (max 2) ──────────────────────────────────────────────
    const reasons: string[] = [];

    const hAvg = homeStats?.avgGoalsFor ?? 0;
    const aAvg = awayStats?.avgGoalsFor ?? 0;
    const combinedAvg = hAvg + aAvg;

    if (combinedAvg >= 2.8)
      reasons.push(`Combined avg ${combinedAvg.toFixed(1)} goals — high-scoring fixture`);
    else if (combinedAvg <= 1.8)
      reasons.push(`Low-scoring game expected — avg ${combinedAvg.toFixed(1)} goals combined`);

    if ((homeStats?.bttsPct ?? 0) >= 55 && (awayStats?.bttsPct ?? 0) >= 55)
      reasons.push("Both teams have strong BTTS rates this season");
    else if ((homeStats?.over25Pct ?? 0) >= 60)
      reasons.push(`${homeName} involved in Over 2.5 in ${homeStats!.over25Pct}% of games`);

    if (reasons.length < 2) {
      const homeForm = (hs?.form ?? "").slice(-5);
      const awayForm = (as_?.form ?? "").slice(-5);
      const homeWins = (homeForm.match(/W/g) ?? []).length;
      const awayLosses = (awayForm.match(/L/g) ?? []).length;
      if (homeWins >= 4)
        reasons.push(`${homeName} in excellent form — ${homeWins} wins in last 5`);
      else if (awayLosses >= 3)
        reasons.push(`${awayName} struggling — ${awayLosses} losses in last 5`);
    }

    // 1-line form insight
    const homeForm5 = (hs?.form ?? "").slice(-5);
    const awayForm5 = (as_?.form ?? "").slice(-5);
    const hW = (homeForm5.match(/W/g) ?? []).length;
    const aW = (awayForm5.match(/W/g) ?? []).length;
    const formInsight =
      hW >= 4 && aW >= 4 ? "Both teams in strong winning form"
      : hW >= 4            ? `${homeName} in excellent recent form`
      : aW >= 4            ? `${awayName} in excellent recent form`
      : hW <= 1 && aW <= 1 ? "Both teams in poor form — low-confidence match"
      : "Evenly matched recent form";

    // ── Market Rating ─────────────────────────────────────────────────────
    const topProb = bestBet?.probability ?? 0;
    const marketRating: string =
      topProb >= 75 ? "Excelente Oportunidade"
      : topProb >= 65 ? "Boa Oportunidade"
      : topProb >= 55 ? "Oportunidade Razoável"
      : "Alto Risco";

    // ── AI Insight sentence ────────────────────────────────────────────────
    const combinedAvgFinal = (homeStats?.avgGoalsFor ?? 1.3) + (awayStats?.avgGoalsFor ?? 1.3);
    const insight: string = reasons.length > 0
      ? reasons[0]
      : combinedAvgFinal >= 2.5
        ? `Ambas as equipes têm médias ofensivas fortes — esperado jogo de gols.`
        : formInsight !== "Evenly matched recent form"
          ? formInsight
          : "Análise baseada em dados estatísticos das últimas 5 partidas.";

    return res.json({
      ...result,
      homeStats,
      awayStats,
      bestBet,
      marketRating,
      insight,
      reasons: reasons.slice(0, 2),
      formInsight,
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

    const mapStats = (s: any) => {
      if (!s) return null;
      const played   = s.fixtures?.played?.total ?? 0;
      const goalsFor = s.goals?.for?.total?.total ?? 0;
      const goalsAgainst = s.goals?.against?.total?.total ?? 0;
      const hasData  = played > 0;
      const avgFor   = hasData ? parseFloat((goalsFor / played).toFixed(2)) : null;
      const avgAgainst = hasData ? parseFloat((goalsAgainst / played).toFixed(2)) : null;
      const over25Pct = hasData && avgFor !== null && avgAgainst !== null
        ? Math.round(Math.min(95, Math.max(5, over25Prob(avgFor + avgAgainst) * 100))) : null;
      const bttsPct = hasData && avgFor !== null && avgAgainst !== null
        ? Math.round(Math.min(90, Math.max(5, bttsProbability(avgFor, avgAgainst) * 100))) : null;
      return {
        played,
        wins:          s.fixtures?.wins?.total  ?? 0,
        draws:         s.fixtures?.draws?.total ?? 0,
        losses:        s.fixtures?.loses?.total ?? 0,
        goalsFor,
        goalsAgainst,
        avgGoalsFor:     avgFor,
        avgGoalsAgainst: avgAgainst,
        over25Pct,
        bttsPct,
        form: s.form ?? null,
      };
    };

    const homeStats = mapStats(hs);
    const awayStats = mapStats(as_);
    const p = result.probabilities;

    // Best Bet
    const betCandidates = [
      { market: "Home Win",             prob: p.homeWin, threshold: 0.52 },
      { market: "Away Win",             prob: p.awayWin, threshold: 0.52 },
      { market: "Over 2.5 Goals",       prob: p.over25,  threshold: 0.50 },
      { market: "Both Teams to Score",  prob: p.btts,    threshold: 0.52 },
      { market: "Draw",                 prob: p.draw,    threshold: 0.32 },
    ];
    const bestBetRaw = betCandidates.filter(b => b.prob >= b.threshold).sort((a, b) => b.prob - a.prob)[0] ?? null;
    const bestBet = bestBetRaw ? {
      market: bestBetRaw.market,
      probability: Math.round(bestBetRaw.prob * 100),
      confidence: bestBetRaw.prob >= 0.68 ? "High" : bestBetRaw.prob >= 0.58 ? "Medium" : "Low",
    } : null;

    // Quick Reasons
    const reasons: string[] = [];
    const combinedAvg = (homeStats?.avgGoalsFor ?? 0) + (awayStats?.avgGoalsFor ?? 0);
    if (combinedAvg >= 2.8) reasons.push(`Combined avg ${combinedAvg.toFixed(1)} goals — high-scoring fixture`);
    else if (combinedAvg <= 1.8) reasons.push(`Low-scoring game expected — avg ${combinedAvg.toFixed(1)} goals combined`);
    if ((homeStats?.bttsPct ?? 0) >= 55 && (awayStats?.bttsPct ?? 0) >= 55)
      reasons.push("Both teams have strong BTTS rates this season");
    else if ((homeStats?.over25Pct ?? 0) >= 60)
      reasons.push(`Home team involved in Over 2.5 in ${homeStats!.over25Pct}% of games`);

    // Form insight
    const hForm = (hs?.form ?? "").slice(-5);
    const aForm = (as_?.form ?? "").slice(-5);
    const hW = (hForm.match(/W/g) ?? []).length;
    const aW = (aForm.match(/W/g) ?? []).length;
    const formInsight =
      hW >= 4 && aW >= 4 ? "Both teams in strong winning form"
      : hW >= 4           ? "Home team in excellent recent form"
      : aW >= 4           ? "Away team in excellent recent form"
      : hW <= 1 && aW <= 1 ? "Both teams in poor form — low-confidence match"
      : "Evenly matched recent form";

    return res.json({
      ...result,
      homeStats,
      awayStats,
      bestBet,
      reasons: reasons.slice(0, 2),
      formInsight,
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

// ── Top Players Stats ──────────────────────────────────────────────────────────
// Fetches topscorers + topassists from 3 leagues, merges & derives 4 categories.
// Cache: 6 hours. Total cost: 6 API calls per cache cycle (very low).
// ─────────────────────────────────────────────────────────────────────────────

const TOP_PLAYERS_TTL = 6 * 60 * 60 * 1000; // 6 hours
const TOP_PLAYERS_LEAGUES = [39, 71, 140];   // Premier League, Brasileirão, La Liga
let topPlayersCache: { data: any; ts: number } | null = null;

function toNumber(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return parseFloat(String(v)) || 0;
}

router.get("/top-players-stats", async (_req, res) => {
  try {
    if (topPlayersCache && Date.now() - topPlayersCache.ts < TOP_PLAYERS_TTL) {
      return res.json({ available: true, ...topPlayersCache.data, cached: true });
    }

    if (apiSuspended && Date.now() - lastSuspendedCheck < SUSPENDED_CACHE_TTL) {
      if (topPlayersCache) return res.json({ available: true, ...topPlayersCache.data, stale: true });
      return res.json({ available: false, scorers: [], assists: [], shots: [], keyPasses: [] });
    }

    const season = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1;

    const fetchList = async (path: string): Promise<any[]> => {
      const { data, ok } = await apiFetch(path, TOP_PLAYERS_TTL);
      if (!ok || !Array.isArray(data?.response)) return [];
      return data.response;
    };

    // 6 parallel calls (topscorers + topassists for 3 leagues)
    const scorerResults = await Promise.all(
      TOP_PLAYERS_LEAGUES.map(lid => fetchList(`/players/topscorers?league=${lid}&season=${season}`))
    );
    const assistResults = await Promise.all(
      TOP_PLAYERS_LEAGUES.map(lid => fetchList(`/players/topassists?league=${lid}&season=${season}`))
    );

    // Merge all into one map (player id → best stats entry)
    const playerMap = new Map<number, any>();

    const mergeEntry = (entry: any) => {
      if (!entry?.player?.id) return;
      const pid = entry.player.id;
      const stats = entry.statistics?.[0];
      if (!stats) return;
      const minutes = toNumber(stats.games?.minutes);
      if (minutes < 300) return; // minimum 300 minutes played

      if (!playerMap.has(pid)) {
        playerMap.set(pid, {
          id:         pid,
          name:       entry.player.name,
          photo:      entry.player.photo ?? null,
          age:        entry.player.age ?? null,
          nationality: entry.player.nationality ?? null,
          teamName:   stats.team?.name ?? null,
          teamLogo:   stats.team?.logo ?? null,
          leagueName: stats.league?.name ?? null,
          leagueLogo: stats.league?.logo ?? null,
          position:   stats.games?.position ?? null,
          appearances: toNumber(stats.games?.appearences),
          minutes,
          goals:      toNumber(stats.goals?.total),
          assists:    toNumber(stats.goals?.assists),
          shots:      toNumber(stats.shots?.total),
          shotsOnTarget: toNumber(stats.shots?.on),
          keyPasses:  toNumber(stats.passes?.key),
          rating:     stats.games?.rating ? parseFloat(stats.games.rating) : null,
        });
      }
    };

    [...scorerResults, ...assistResults].flat().forEach(mergeEntry);

    const all = Array.from(playerMap.values());
    const top = (arr: any[], key: string, n = 10) =>
      [...arr].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0)).slice(0, n).map((p, i) => ({ ...p, rank: i + 1 }));

    const result = {
      scorers:   top(all, "goals"),
      assists:   top(all, "assists"),
      shots:     top(all, "shots"),
      keyPasses: top(all, "keyPasses"),
    };

    topPlayersCache = { data: result, ts: Date.now() };
    console.log(`[top-players-stats] Built from ${all.length} players across ${TOP_PLAYERS_LEAGUES.length} leagues`);
    return res.json({ available: all.length > 0, ...result });
  } catch (err: any) {
    console.error("[top-players-stats]", err.message);
    return res.json({ available: false, scorers: [], assists: [], shots: [], keyPasses: [] });
  }
});

// ── Rankings ───────────────────────────────────────────────────────────────────
// Strategy: league-goals uses standings API (8 calls per refresh, 30 min cache).
// team-corners + team-cards scan the in-memory cache for data already fetched
// by FixtureDetail page visits — zero extra API calls.
// ─────────────────────────────────────────────────────────────────────────────

const RANKINGS_TTL = 30 * 60 * 1000; // 30 minutes

interface LeagueGoalsEntry {
  leagueId: number;
  leagueName: string;
  country: string;
  logo: string;
  flag: string;
  totalMatches: number;
  totalGoals: number;
  avgGoals: number;
}

interface TeamCornersEntry {
  teamId: number;
  teamName: string;
  teamLogo: string;
  leagueId: number;
  leagueName: string;
  played: number;
  totalCorners: number;
  avgCorners: number;
}

interface TeamCardsEntry {
  teamId: number;
  teamName: string;
  teamLogo: string;
  leagueId: number;
  leagueName: string;
  played: number;
  yellowCards: number;
  redCards: number;
  totalCards: number;
  avgCards: number;
}

let leagueGoalsRankCache: { data: LeagueGoalsEntry[]; ts: number } | null = null;

/** Scan in-memory fixture-stats cache for corner data per team. */
function extractCornersFromCache(): TeamCornersEntry[] {
  const teamMap = new Map<number, {
    name: string; logo: string; leagueId: number; leagueName: string;
    totalCorners: number; matches: number;
  }>();

  for (const [key, val] of cache.entries()) {
    if (!key.startsWith("/fixtures/statistics?fixture=")) continue;
    const response = (val.data as any)?.response;
    if (!Array.isArray(response)) continue;

    for (const ts of response) {
      const teamId: number | undefined = ts.team?.id;
      const teamName: string = ts.team?.name ?? "Unknown";
      const teamLogo: string = ts.team?.logo ?? "";
      const cornerStat = (ts.statistics ?? []).find((s: any) => s.type === "Corner Kicks");
      const corners = cornerStat ? (Number(cornerStat.value) || 0) : null;
      if (!teamId || corners === null) continue;

      if (!teamMap.has(teamId)) {
        teamMap.set(teamId, { name: teamName, logo: teamLogo, leagueId: 0, leagueName: "", totalCorners: 0, matches: 0 });
      }
      const entry = teamMap.get(teamId)!;
      entry.totalCorners += corners;
      entry.matches += 1;
    }
  }

  return [...teamMap.entries()]
    .map(([id, d]) => ({
      teamId: id, teamName: d.name, teamLogo: d.logo,
      leagueId: d.leagueId, leagueName: d.leagueName,
      played: d.matches, totalCorners: d.totalCorners,
      avgCorners: d.matches > 0 ? +((d.totalCorners / d.matches).toFixed(2)) : 0,
    }))
    .filter(t => t.played >= 1)
    .sort((a, b) => b.avgCorners - a.avgCorners)
    .slice(0, 20);
}

/** Scan in-memory team-stats cache for card data per team. */
function extractCardsFromCache(): TeamCardsEntry[] {
  const results: TeamCardsEntry[] = [];
  const seen = new Set<number>();

  for (const [key, val] of cache.entries()) {
    if (!key.startsWith("/teams/statistics?")) continue;
    const response = (val.data as any)?.response;
    if (!response?.team?.id) continue;

    const teamId: number = response.team.id;
    if (seen.has(teamId)) continue;
    seen.add(teamId);

    const played: number = response.fixtures?.played?.total ?? 0;
    if (!played) continue;

    let yellow = 0;
    const yellowByMin = response.cards?.yellow ?? {};
    for (const period of Object.values(yellowByMin) as any[]) {
      yellow += period?.total ?? 0;
    }
    let red = 0;
    const redByMin = response.cards?.red ?? {};
    for (const period of Object.values(redByMin) as any[]) {
      red += period?.total ?? 0;
    }

    results.push({
      teamId,
      teamName: response.team.name,
      teamLogo: response.team.logo,
      leagueId: response.league?.id ?? 0,
      leagueName: response.league?.name ?? "",
      played,
      yellowCards: yellow,
      redCards: red,
      totalCards: yellow + red,
      avgCards: played > 0 ? +((yellow + red) / played).toFixed(2) : 0,
    });
  }

  return results.sort((a, b) => b.avgCards - a.avgCards).slice(0, 20);
}

// ── GET /rankings/league-goals ─────────────────────────────────────────────
router.get("/rankings/league-goals", async (_req, res) => {
  try {
    if (leagueGoalsRankCache && Date.now() - leagueGoalsRankCache.ts < RANKINGS_TTL) {
      return res.json({ available: true, leagues: leagueGoalsRankCache.data, cached: true });
    }

    if (apiSuspended && Date.now() - lastSuspendedCheck < SUSPENDED_CACHE_TTL) {
      const stale = leagueGoalsRankCache?.data ?? [];
      return res.json({ available: stale.length > 0, leagues: stale, stale: true });
    }

    const season = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    const entries: LeagueGoalsEntry[] = [];

    for (const leagueId of TOP_LEAGUES) {
      const { data, ok } = await apiFetch(`/standings?league=${leagueId}&season=${season}`, RANKINGS_TTL);
      if (!ok || !Array.isArray(data?.response) || data.response.length === 0) continue;

      const leagueObj = data.response[0]?.league;
      if (!leagueObj) continue;

      const standing = leagueObj.standings?.[0] ?? [];
      if (!standing.length) continue;

      let totalGoals = 0;
      let totalMatchTeams = 0;
      for (const team of standing) {
        totalGoals   += team.all?.goals?.for ?? 0;
        totalMatchTeams += team.all?.played ?? 0;
      }

      const totalMatches = Math.round(totalMatchTeams / 2);
      if (totalMatches === 0) continue;

      entries.push({
        leagueId,
        leagueName: leagueObj.name,
        country:    leagueObj.country ?? "",
        logo:       leagueObj.logo ?? "",
        flag:       leagueObj.flag ?? "",
        totalMatches,
        totalGoals,
        avgGoals: +(totalGoals / totalMatches).toFixed(2),
      });
    }

    entries.sort((a, b) => b.avgGoals - a.avgGoals);
    leagueGoalsRankCache = { data: entries, ts: Date.now() };
    console.log(`[rankings/league-goals] Computed for ${entries.length} leagues`);
    return res.json({ available: entries.length > 0, leagues: entries });
  } catch (err: any) {
    console.error("[rankings/league-goals]", err.message);
    return res.json({ available: false, leagues: [] });
  }
});

// ── GET /rankings/team-corners ─────────────────────────────────────────────
router.get("/rankings/team-corners", (_req, res) => {
  try {
    const corners = extractCornersFromCache();
    return res.json({ available: corners.length > 0, teams: corners, source: "cache" });
  } catch (err: any) {
    console.error("[rankings/team-corners]", err.message);
    return res.json({ available: false, teams: [] });
  }
});

// ── GET /rankings/team-cards ───────────────────────────────────────────────
router.get("/rankings/team-cards", (_req, res) => {
  try {
    const cards = extractCardsFromCache();
    return res.json({ available: cards.length > 0, teams: cards, source: "cache" });
  } catch (err: any) {
    console.error("[rankings/team-cards]", err.message);
    return res.json({ available: false, teams: [] });
  }
});

// ── accumulator-of-the-day ──────────────────────────────────────────────────────
const ACCUMULATOR_TTL = 15 * 60 * 1000;
let accumulatorCache: { data: any; ts: number } | null = null;

function over15Prob(lambdaHome: number, lambdaAway: number): number {
  const p00 = poissonProb(lambdaHome, 0) * poissonProb(lambdaAway, 0);
  const p10 = poissonProb(lambdaHome, 1) * poissonProb(lambdaAway, 0);
  const p01 = poissonProb(lambdaHome, 0) * poissonProb(lambdaAway, 1);
  return Math.min(0.95, Math.max(0.05, 1 - p00 - p10 - p01));
}

router.get("/accumulator-of-the-day", async (_req, res) => {
  try {
    if (accumulatorCache && Date.now() - accumulatorCache.ts < ACCUMULATOR_TTL) {
      return res.json({ available: true, ...accumulatorCache.data, cached: true });
    }

    const { fixtures: prelive } = await getTopLeaguePrelivFromDB(TOP_SIX_LEAGUES);

    if (prelive.length === 0) {
      return res.json({ available: false, picks: [], combinedOdds: null });
    }

    type AccumPick = {
      fixtureId: number;
      homeTeam: string;
      awayTeam: string;
      homeTeamLogo: string;
      awayTeamLogo: string;
      league: string;
      leagueLogo: string;
      kickoff: string;
      market: string;
      marketKey: string;
      confidence: number;
      fairOdd: number;
    };

    const candidates: AccumPick[] = [];

    for (const f of prelive.slice(0, 25)) {
      if (apiSuspended) break;

      const [{ data: homeData, ok: homeOk }, { data: awayData, ok: awayOk }] = await Promise.all([
        apiFetch(`/teams/statistics?team=${f.homeTeam.id}&league=${f.league.id}&season=2025`, STATS_TTL),
        apiFetch(`/teams/statistics?team=${f.awayTeam.id}&league=${f.league.id}&season=2025`, STATS_TTL),
      ]);

      if (!homeOk || !awayOk) continue;

      const hs = homeData?.response;
      const as_ = awayData?.response;
      if (!hs || !as_) continue;

      const hFor     = hs.goals?.for?.average?.home  ?? hs.goals?.for?.average?.total  ?? null;
      const hAgainst = hs.goals?.against?.average?.home ?? hs.goals?.against?.average?.total ?? null;
      const aFor     = as_.goals?.for?.average?.away ?? as_.goals?.for?.average?.total  ?? null;
      const aAgainst = as_.goals?.against?.average?.away ?? as_.goals?.against?.average?.total ?? null;

      if (!hFor || !hAgainst || !aFor || !aAgainst) continue;

      const hAtt = parseFloat(hFor as string);
      const hDef = parseFloat(hAgainst as string);
      const aAtt = parseFloat(aFor as string);
      const aDef = parseFloat(aAgainst as string);

      if (isNaN(hAtt) || isNaN(hDef) || isNaN(aAtt) || isNaN(aDef)) continue;

      const result = calcMatchProbabilities(hAtt, hDef, aAtt, aDef);
      const p = result.probabilities;
      const o15 = over15Prob(result.lambdaHome, result.lambdaAway);
      const dcHome = Math.min(0.95, p.homeWin + p.draw);
      const dcAway = Math.min(0.95, p.awayWin + p.draw);

      const marketOptions = [
        { market: "Mais de 1.5 Gols",   marketKey: "over15",  prob: o15 },
        { market: "Mais de 2.5 Gols",   marketKey: "over25",  prob: p.over25 },
        { market: "Ambas Marcam",        marketKey: "btts",    prob: p.btts },
        { market: "Vitória Mandante",    marketKey: "homeWin", prob: p.homeWin },
        { market: "Dupla Chance 1X",     marketKey: "dcHome",  prob: dcHome },
        { market: "Dupla Chance X2",     marketKey: "dcAway",  prob: dcAway },
      ];

      const eligible = marketOptions.filter(m => m.prob >= 0.65).sort((a, b) => b.prob - a.prob);
      if (eligible.length === 0) continue;

      const best = eligible[0];
      candidates.push({
        fixtureId: f.id,
        homeTeam: f.homeTeam.name,
        awayTeam: f.awayTeam.name,
        homeTeamLogo: f.homeTeam.logo,
        awayTeamLogo: f.awayTeam.logo,
        league: f.league.name,
        leagueLogo: f.league.logo,
        kickoff: f.date,
        market: best.market,
        marketKey: best.marketKey,
        confidence: Math.round(best.prob * 100),
        fairOdd: parseFloat((1 / best.prob).toFixed(2)),
      });
    }

    candidates.sort((a, b) => b.confidence - a.confidence);
    const seen = new Set<number>();
    const picks: AccumPick[] = [];
    for (const c of candidates) {
      if (!seen.has(c.fixtureId)) {
        seen.add(c.fixtureId);
        picks.push(c);
        if (picks.length === 3) break;
      }
    }

    if (picks.length < 2) {
      return res.json({ available: false, picks: [], combinedOdds: null });
    }

    const combinedOdds = parseFloat(picks.reduce((acc, pk) => acc * pk.fairOdd, 1).toFixed(2));
    const data = { picks, combinedOdds, generatedAt: new Date().toISOString() };
    accumulatorCache = { data, ts: Date.now() };

    return res.json({ available: true, ...data, cached: false });
  } catch (err: any) {
    console.error("[accumulator-of-the-day]", err.message);
    return res.json({ available: false, picks: [], combinedOdds: null });
  }
});

// ── Statistics Scanner (Corners + Cards) ────────────────────────────────────────
const SCANNER_TTL       = 20 * 60 * 1000;  // 20 min result cache
const CORNER_HIST_TTL   = 24 * 60 * 60 * 1000; // 24 h per-team/fixture history

let cornerScannerCache: { data: any; ts: number } | null = null;
let cardScannerCache:   { data: any; ts: number } | null = null;

// In-memory map for per-team corner averages (persists across requests, TTL-guarded)
const cornersTeamCache = new Map<number, { avg: number; played: number; ts: number }>();

/** P(X <= maxK) for Poisson(lambda) */
function poissonCDF(lambda: number, maxK: number): number {
  let s = 0;
  for (let k = 0; k <= maxK; k++) s += poissonProb(lambda, k);
  return Math.min(0.99, s);
}

/** Pull per-team corner counts already in the in-memory fixtures/statistics cache. */
function cornersFromInMemory(teamId: number): { total: number; count: number } {
  let total = 0, count = 0;
  for (const [key, val] of cache.entries()) {
    if (!key.startsWith("/fixtures/statistics?fixture=")) continue;
    const resp = (val.data as any)?.response;
    if (!Array.isArray(resp)) continue;
    for (const ts of resp) {
      if (ts.team?.id !== teamId) continue;
      const cs = (ts.statistics ?? []).find((s: any) => s.type === "Corner Kicks");
      if (cs?.value !== null && cs?.value !== undefined) {
        total += Number(cs.value) || 0;
        count++;
      }
    }
  }
  return { total, count };
}

/** Get or compute a team's average corners per match. Caches result for 24 h. */
async function fetchTeamCornerAvg(teamId: number): Promise<{ avg: number; played: number } | null> {
  const cached = cornersTeamCache.get(teamId);
  if (cached && Date.now() - cached.ts < CORNER_HIST_TTL) {
    return { avg: cached.avg, played: cached.played };
  }

  // 1. Try in-memory fixture stats (zero extra API calls)
  let { total, count } = cornersFromInMemory(teamId);
  if (count >= 3) {
    const avg = +(total / count).toFixed(1);
    cornersTeamCache.set(teamId, { avg, played: count, ts: Date.now() });
    return { avg, played: count };
  }

  // 2. Fall back: fetch last 5 completed fixtures for this team (budget-limited)
  const { data: fixData, ok: fixOk } = await scannerApiFetch(`/fixtures?team=${teamId}&last=5&season=2025`, CORNER_HIST_TTL);
  if (!fixOk || !Array.isArray(fixData?.response)) return null;

  for (const fix of (fixData.response as any[]).slice(0, 5)) {
    const fId = fix.fixture?.id;
    if (!fId) continue;
    const { data: sData, ok: sOk } = await scannerApiFetch(`/fixtures/statistics?fixture=${fId}`, CORNER_HIST_TTL);
    if (!sOk || !Array.isArray(sData?.response)) continue;
    for (const ts of sData.response as any[]) {
      if (ts.team?.id !== teamId) continue;
      const cs = (ts.statistics ?? []).find((s: any) => s.type === "Corner Kicks");
      if (cs?.value !== null && cs?.value !== undefined) {
        total += Number(cs.value) || 0;
        count++;
      }
    }
  }

  if (count === 0) return null;
  const avg = +(total / count).toFixed(1);
  cornersTeamCache.set(teamId, { avg, played: count, ts: Date.now() });
  return { avg, played: count };
}

/** Get a team's season goal averages — reuses the same /teams/statistics call. */
const teamGoalsCache = new Map<string, { avgFor: number; avgAgainst: number; played: number; ts: number }>();
const GOALS_HIST_TTL = 24 * 60 * 60 * 1000;

async function fetchTeamGoalAvg(teamId: number, leagueId: number): Promise<{ avgFor: number; avgAgainst: number; played: number } | null> {
  const cacheKey = `${teamId}-${leagueId}`;
  const cached = teamGoalsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < GOALS_HIST_TTL) {
    return { avgFor: cached.avgFor, avgAgainst: cached.avgAgainst, played: cached.played };
  }
  const { data, ok } = await scannerApiFetch(`/teams/statistics?team=${teamId}&league=${leagueId}&season=2025`, STATS_TTL);
  if (!ok || !data?.response) {
    if (cached) return { avgFor: cached.avgFor, avgAgainst: cached.avgAgainst, played: cached.played };
    return null;
  }
  const r = data.response;
  const played: number = r.fixtures?.played?.total ?? 0;
  if (!played) return null;
  const avgFor     = +((r.goals?.for?.total?.total  ?? 0) / played).toFixed(2);
  const avgAgainst = +((r.goals?.against?.total?.total ?? 0) / played).toFixed(2);
  teamGoalsCache.set(cacheKey, { avgFor, avgAgainst, played, ts: Date.now() });
  return { avgFor, avgAgainst, played };
}

/** Get a team's average cards per match from /teams/statistics. */
const cardsTeamCache = new Map<string, { avg: number; played: number; ts: number }>();
const CARD_HIST_TTL = 24 * 60 * 60 * 1000;

async function fetchTeamCardAvg(teamId: number, leagueId: number): Promise<{ avg: number; played: number } | null> {
  const cacheKey = `${teamId}-${leagueId}`;
  const cached = cardsTeamCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CARD_HIST_TTL) {
    return { avg: cached.avg, played: cached.played };
  }

  const { data, ok } = await scannerApiFetch(`/teams/statistics?team=${teamId}&league=${leagueId}&season=2025`, STATS_TTL);
  if (!ok || !data?.response) {
    if (cached) return { avg: cached.avg, played: cached.played };
    return null;
  }
  const r = data.response;
  const played: number = r.fixtures?.played?.total ?? 0;
  if (!played) return null;

  let yellow = 0;
  for (const p of Object.values(r.cards?.yellow ?? {}) as any[]) yellow += p?.total ?? 0;
  let red = 0;
  for (const p of Object.values(r.cards?.red ?? {}) as any[]) red += p?.total ?? 0;

  const avg = +((yellow + red) / played).toFixed(2);
  cardsTeamCache.set(cacheKey, { avg, played, ts: Date.now() });
  return { avg, played };
}

// ── GET /scanner/corners ───────────────────────────────────────────────────────
// Confidence threshold: Over 9.5 >= 60% to be a "strong pick"
const CORNER_CONFIDENCE_THRESHOLD = 60;

router.get("/scanner/corners", async (_req, res) => {
  try {
    if (cornerScannerCache && Date.now() - cornerScannerCache.ts < SCANNER_TTL) {
      return res.json({ available: true, ...cornerScannerCache.data, cached: true });
    }

    resetScannerBudget(); // allow up to SCANNER_CALL_BUDGET fresh API calls per scan

    // Use expanded scanner leagues — prioritized but falls back to all NS fixtures
    const prelive = await getScannerFixtures(SCANNER_LEAGUES, 80);
    if (prelive.length === 0) {
      return res.json({
        available: false, matches: [], isFallback: false,
        fallbackMessage: "Nenhuma oportunidade de alta confiança encontrada hoje. A IA continua monitorando os jogos.",
      });
    }

    type CornerMatch = {
      fixtureId: number;
      homeTeam: string; awayTeam: string;
      homeTeamLogo: string; awayTeamLogo: string;
      league: string; leagueLogo: string; kickoff: string;
      homeAvg: number; awayAvg: number; totalAvg: number;
      over85Pct: number; over95Pct: number;
    };

    const candidates: CornerMatch[] = [];
    // Only scan the top priority fixtures to avoid bursting the rate limit
    const scanBatch = prelive.slice(0, 25);

    for (const f of scanBatch) {
      const [homeCorner, awayCorner] = await Promise.all([
        fetchTeamCornerAvg(f.homeTeam.id),
        fetchTeamCornerAvg(f.awayTeam.id),
      ]);
      // Small delay between fixtures to stay under API rate limit
      await new Promise(r => setTimeout(r, 80));

      if (!homeCorner || !awayCorner) continue;

      const totalAvg = +(homeCorner.avg + awayCorner.avg).toFixed(1);
      if (totalAvg < 5) continue; // discard negligible-corner matches

      const over85 = Math.round((1 - poissonCDF(totalAvg, 8)) * 100);
      const over95 = Math.round((1 - poissonCDF(totalAvg, 9)) * 100);

      candidates.push({
        fixtureId: f.id,
        homeTeam: f.homeTeam.name, awayTeam: f.awayTeam.name,
        homeTeamLogo: f.homeTeam.logo, awayTeamLogo: f.awayTeam.logo,
        league: f.league.name, leagueLogo: f.league.logo,
        kickoff: f.date,
        homeAvg: homeCorner.avg, awayAvg: awayCorner.avg,
        totalAvg, over85Pct: over85, over95Pct: over95,
      });
    }

    candidates.sort((a, b) => b.over95Pct - a.over95Pct);

    // Strong picks: meet the confidence threshold
    const strongPicks = candidates.filter(m => m.over95Pct >= CORNER_CONFIDENCE_THRESHOLD).slice(0, 5);

    let matches: CornerMatch[];
    let isFallback = false;

    if (strongPicks.length > 0) {
      matches = strongPicks;
    } else if (candidates.length > 0) {
      // Intelligent fallback: top 3 by statistical score, no confidence label
      matches = candidates.slice(0, 3);
      isFallback = true;
    } else {
      // Don't cache empty results — let next request retry when API recovers
      return res.json({
        available: false, matches: [], isFallback: false,
        fallbackMessage: "Nenhuma oportunidade de alta confiança encontrada hoje. A IA continua monitorando os jogos.",
        scannedAt: new Date().toISOString(),
        cached: false,
      });
    }

    const data = { matches, isFallback, scannedAt: new Date().toISOString() };
    cornerScannerCache = { data, ts: Date.now() };
    return res.json({ available: true, ...data, cached: false });
  } catch (err: any) {
    console.error("[scanner/corners]", err.message);
    return res.json({ available: false, matches: [], isFallback: false });
  }
});

// ── GET /scanner/cards ─────────────────────────────────────────────────────────
// Confidence threshold: Over 4.5 >= 50% to be a "strong pick"
const CARD_CONFIDENCE_THRESHOLD = 50;

router.get("/scanner/cards", async (_req, res) => {
  try {
    if (cardScannerCache && Date.now() - cardScannerCache.ts < SCANNER_TTL) {
      return res.json({ available: true, ...cardScannerCache.data, cached: true });
    }

    resetScannerBudget(); // allow up to SCANNER_CALL_BUDGET fresh API calls per scan

    const prelive = await getScannerFixtures(SCANNER_LEAGUES, 80);
    if (prelive.length === 0) {
      return res.json({
        available: false, matches: [], isFallback: false,
        fallbackMessage: "Nenhuma oportunidade de alta confiança encontrada hoje. A IA continua monitorando os jogos.",
      });
    }

    type CardMatch = {
      fixtureId: number;
      homeTeam: string; awayTeam: string;
      homeTeamLogo: string; awayTeamLogo: string;
      league: string; leagueLogo: string; kickoff: string;
      homeAvg: number; awayAvg: number; totalAvg: number;
      over35Pct: number; over45Pct: number;
    };

    const candidates: CardMatch[] = [];
    // Only scan the top priority fixtures to avoid bursting the rate limit
    const scanBatch = prelive.slice(0, 25);

    for (const f of scanBatch) {
      const [homeCards, awayCards] = await Promise.all([
        fetchTeamCardAvg(f.homeTeam.id, f.league.id),
        fetchTeamCardAvg(f.awayTeam.id, f.league.id),
      ]);
      // Small delay between fixtures to stay under API rate limit
      await new Promise(r => setTimeout(r, 80));

      if (!homeCards || !awayCards) continue;

      const totalAvg = +(homeCards.avg + awayCards.avg).toFixed(2);
      if (totalAvg < 1.5) continue;

      const over35 = Math.round((1 - poissonCDF(totalAvg, 3)) * 100);
      const over45 = Math.round((1 - poissonCDF(totalAvg, 4)) * 100);

      candidates.push({
        fixtureId: f.id,
        homeTeam: f.homeTeam.name, awayTeam: f.awayTeam.name,
        homeTeamLogo: f.homeTeam.logo, awayTeamLogo: f.awayTeam.logo,
        league: f.league.name, leagueLogo: f.league.logo,
        kickoff: f.date,
        homeAvg: homeCards.avg, awayAvg: awayCards.avg,
        totalAvg, over35Pct: over35, over45Pct: over45,
      });
    }

    candidates.sort((a, b) => b.over45Pct - a.over45Pct);

    const strongPicks = candidates.filter(m => m.over45Pct >= CARD_CONFIDENCE_THRESHOLD).slice(0, 5);

    let matches: CardMatch[];
    let isFallback = false;

    if (strongPicks.length > 0) {
      matches = strongPicks;
    } else if (candidates.length > 0) {
      matches = candidates.slice(0, 3);
      isFallback = true;
    } else {
      // Don't cache empty results — let next request retry when API recovers
      return res.json({
        available: false, matches: [], isFallback: false,
        fallbackMessage: "Nenhuma oportunidade de alta confiança encontrada hoje. A IA continua monitorando os jogos.",
        scannedAt: new Date().toISOString(),
        cached: false,
      });
    }

    const data = { matches, isFallback, scannedAt: new Date().toISOString() };
    cardScannerCache = { data, ts: Date.now() };
    return res.json({ available: true, ...data, cached: false });
  } catch (err: any) {
    console.error("[scanner/cards]", err.message);
    return res.json({ available: false, matches: [], isFallback: false });
  }
});

// ── GET /scanner/opportunities ────────────────────────────────────────────────
// AI Opportunity Scanner: composite score = 40% Over2.5 + 40% BTTS + 20% attack index
// Confidence threshold ≥70% to be a "strong pick"
const OPPORTUNITY_CONFIDENCE_THRESHOLD = 70;
let opportunityScannerCache: { data: any; ts: number } | null = null;

router.get("/scanner/opportunities", async (_req, res) => {
  try {
    if (opportunityScannerCache && Date.now() - opportunityScannerCache.ts < SCANNER_TTL) {
      return res.json({ available: true, ...opportunityScannerCache.data, cached: true });
    }

    resetScannerBudget();

    const prelive = await getScannerFixtures(SCANNER_LEAGUES, 80);
    if (prelive.length === 0) {
      return res.json({ available: false, matches: [], isFallback: false,
        fallbackMessage: "Nenhuma oportunidade de alta confiança encontrada hoje. A IA continua monitorando os jogos." });
    }

    type OpportunityMatch = {
      fixtureId: number;
      homeTeam: string; awayTeam: string;
      homeTeamLogo: string; awayTeamLogo: string;
      league: string; leagueLogo: string; kickoff: string;
      lambdaHome: number; lambdaAway: number;
      over25Pct: number;
      bttsPct: number;
      attackIndex: number;
      confidence: number;
    };

    const candidates: OpportunityMatch[] = [];
    const scanBatch = prelive.slice(0, 25);

    for (const f of scanBatch) {
      const [homeGoals, awayGoals] = await Promise.all([
        fetchTeamGoalAvg(f.homeTeam.id, f.league.id),
        fetchTeamGoalAvg(f.awayTeam.id, f.league.id),
      ]);
      await new Promise(r => setTimeout(r, 80));

      if (!homeGoals || !awayGoals) continue;
      if (homeGoals.played < 5 || awayGoals.played < 5) continue; // need enough matches

      // Poisson-based expected goals (Dixon-Coles style)
      const lambdaHome = +((homeGoals.avgFor + awayGoals.avgAgainst) / 2).toFixed(2);
      const lambdaAway = +((awayGoals.avgFor + homeGoals.avgAgainst) / 2).toFixed(2);
      const lambdaTotal = lambdaHome + lambdaAway;

      if (lambdaTotal < 1.5) continue; // too low-scoring to be interesting

      // Over 2.5 Goals probability (P(goals >= 3))
      const over25 = Math.round((1 - poissonCDF(lambdaTotal, 2)) * 100);

      // BTTS: P(home ≥ 1) × P(away ≥ 1)
      const pHomeScores = 1 - Math.exp(-lambdaHome);
      const pAwayScores = 1 - Math.exp(-lambdaAway);
      const btts = Math.round(pHomeScores * pAwayScores * 100);

      // Attack strength index (0–100, normalized at 4.0 total goals)
      const attackIndex = Math.min(100, Math.round((lambdaTotal / 4.0) * 100));

      // Composite confidence: 40% Over2.5 + 40% BTTS + 20% attack
      const confidence = Math.round(0.40 * over25 + 0.40 * btts + 0.20 * attackIndex);

      candidates.push({
        fixtureId: f.id,
        homeTeam: f.homeTeam.name, awayTeam: f.awayTeam.name,
        homeTeamLogo: f.homeTeam.logo, awayTeamLogo: f.awayTeam.logo,
        league: f.league.name, leagueLogo: f.league.logo,
        kickoff: f.date,
        lambdaHome, lambdaAway,
        over25Pct: over25, bttsPct: btts, attackIndex,
        confidence,
      });
    }

    candidates.sort((a, b) => b.confidence - a.confidence);

    const strongPicks = candidates.filter(m => m.confidence >= OPPORTUNITY_CONFIDENCE_THRESHOLD).slice(0, 5);
    let matches: OpportunityMatch[];
    let isFallback = false;

    if (strongPicks.length > 0) {
      matches = strongPicks;
    } else if (candidates.length > 0) {
      matches = candidates.slice(0, 5);
      isFallback = true;
    } else {
      return res.json({ available: false, matches: [], isFallback: false,
        fallbackMessage: "Nenhuma oportunidade de alta confiança encontrada hoje. A IA continua monitorando os jogos.",
        scannedAt: new Date().toISOString(), cached: false });
    }

    const data = { matches, isFallback, scannedAt: new Date().toISOString() };
    opportunityScannerCache = { data, ts: Date.now() };
    return res.json({ available: true, ...data, cached: false });
  } catch (err: any) {
    console.error("[scanner/opportunities]", err.message);
    return res.json({ available: false, matches: [], isFallback: false });
  }
});

// ── GET /live/matches ─────────────────────────────────────────────────────────
// Returns live fixtures (stats + events) plus recently finished matches.
router.get("/live/matches", (_req, res) => {
  const matches  = getLiveMatches();   // already filtered to LIVE_STATUSES only
  const finished = getFinishedMatches();
  const ts       = Date.now();
  const enriched = matches.map(m => enrichMatchForResponse(m, ts));
  return res.json({
    available: enriched.length > 0,
    count:     enriched.length,
    matches:   enriched,
    finished,
    ts,
  });
});

// ── GET /live/stats/:fixtureId ────────────────────────────────────────────────
// Returns per-fixture stats for both teams (7 stat types each).
router.get("/live/stats/:fixtureId", (req, res) => {
  const id = parseInt(req.params.fixtureId ?? "", 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid fixture id" });
  const stats = getLiveStats(id);
  if (!stats) {
    return res.json({ available: false, fixtureId: id,
      message: "Stats not yet available — retry in 30 seconds" });
  }
  return res.json({ available: true, ...stats });
});

// ── api-status ─────────────────────────────────────────────────────────────────
router.get("/api-status", (_req, res) => {
  res.json({ suspended: apiSuspended, cacheSize: cache.size, liveCount: getLiveCount() });
});

// ── AI Betting Insights ────────────────────────────────────────────────────────
// Generates daily top picks, safe multiple, and aggressive multiple.
// Analysis is driven by cached team statistics — no extra API burst on each request.
// Results are stored in a 24-hour in-memory cache; regenerated once per calendar day.

interface InsightPick {
  fixtureId:  number;
  homeTeam:   string;
  awayTeam:   string;
  homeLogo:   string;
  awayLogo:   string;
  league:     { id: number; name: string; logo: string };
  kickoff:    string;
  betLabel:   string;   // display text, e.g. "Mais de 2.5 Gols"
  betMarket:  string;   // machine key: over25 | over15 | btts | homeWin | awayWin | dc
  confidence: number;   // 0–100
  reasons:    string[]; // max 3 bullets
}

interface BettingInsights {
  generatedAt:        string;
  available:          boolean;
  top3:               InsightPick[];
  safeMultiple:       InsightPick[];
  aggressiveMultiple: InsightPick[];
}

let insightsCache: { data: BettingInsights; ts: number } | null = null;
const INSIGHTS_TTL   = 24 * 60 * 60 * 1000; // 24 hours
let insightsRunning  = false;

/** Form string → score 0–100 (last 5 games, W=3 D=1 L=0, max 15). */
function parseFormScore(form: string): number {
  const last5  = (form ?? "").slice(-5);
  if (!last5) return 50;
  const pts    = last5.split("").reduce((acc, c) => acc + (c === "W" ? 3 : c === "D" ? 1 : 0), 0);
  const maxPts = last5.length * 3;
  return maxPts > 0 ? Math.round((pts / maxPts) * 100) : 50;
}

/**
 * Generates betting insights from today's not-started top-league fixtures.
 * Fetches team season statistics (already cached by warmupFeaturedCache in most cases).
 * No H2H calls — quota is preserved.
 */
async function generateBettingInsights(): Promise<BettingInsights> {
  const { fixtures } = await getFixturesFromDB();

  // Filter: not-started top-league fixtures within the next 24 hours.
  // Using a rolling 24-h window (instead of calendar-day "today") keeps the
  // insights useful late in the day when most daytime matches have already started.
  const nowMs  = Date.now();
  const in24hMs = nowMs + 24 * 60 * 60 * 1000;
  const candidates = fixtures
    .filter(f => {
      if (!f.date) return false;
      const kickoff = new Date(f.date).getTime();
      return kickoff >= nowMs && kickoff <= in24hMs
          && ["NS", "TBD"].includes(f.status.short)
          && TOP_LEAGUES.includes(f.league.id);
    })
    .sort((a, b) => {
      const ai = TOP_LEAGUES.indexOf(a.league.id);
      const bi = TOP_LEAGUES.indexOf(b.league.id);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .slice(0, 30);

  console.log(`[betting-insights] Analyzing ${candidates.length} fixtures for today`);

  const picks: InsightPick[] = [];

  for (const f of candidates) {
    // AI Betting Module uses apiFetchPlayer (never writes apiSuspended) so that
    // a rate-limit hit here cannot cascade and freeze the Fixture or Match Data modules.
    // Shared cache Map means cache hits are free regardless of which function fetches first.
    const [{ data: homeData }, { data: awayData }] = await Promise.all([
      apiFetchPlayer(`/teams/statistics?team=${f.homeTeam.id}&league=${f.league.id}&season=2025`, STATS_TTL),
      apiFetchPlayer(`/teams/statistics?team=${f.awayTeam.id}&league=${f.league.id}&season=2025`, STATS_TTL),
    ]);

    const hR = homeData?.response;
    const aR = awayData?.response;
    if (!hR || !aR) continue;

    // ── Raw stat extraction ───────────────────────────────────────────────────
    const homeForm     = hR.form ?? "";
    const awayForm     = aR.form ?? "";
    const hGoalsFor    = parseFloat(hR.goals?.for?.average?.total     ?? "1.3");
    const aGoalsFor    = parseFloat(aR.goals?.for?.average?.total     ?? "1.3");
    const hGoalsAg     = parseFloat(hR.goals?.against?.average?.total ?? "1.0");
    const aGoalsAg     = parseFloat(aR.goals?.against?.average?.total ?? "1.0");
    const hSoT         = parseFloat(hR.shots_on_goal?.average         ?? "4.0");
    const aSoT         = parseFloat(aR.shots_on_goal?.average         ?? "4.0");
    const hWins        = hR.fixtures?.wins?.total ?? 0;
    const hPlayed      = Math.max(1, hR.fixtures?.played?.total ?? 1);

    // ── Confidence components (each 0–100) ───────────────────────────────────
    // 1. Team form → 30%
    const formScore  = (parseFormScore(homeForm) + parseFormScore(awayForm)) / 2;

    // 2. Goals average → 25%
    const avgGoalsTotal = hGoalsFor + aGoalsFor;
    const goalsScore    = Math.min(100, (avgGoalsTotal / 3.5) * 100);

    // 3. Shots on target → 20%
    const avgSoT     = (hSoT + aSoT) / 2;
    const shotsScore = Math.min(100, (avgSoT / 7.0) * 100);

    // 4. Head-to-head → 15% (proxy: season home win-rate)
    const homeWinRate = hWins / hPlayed;
    const h2hProxy    = Math.min(100, Math.round(homeWinRate * 100 + 10));

    // 5. Home advantage → 10%
    const homeAdv = Math.min(100, Math.round(homeWinRate * 80 + 20));

    const baseConfidence = Math.round(
      formScore  * 0.30 +
      goalsScore * 0.25 +
      shotsScore * 0.20 +
      h2hProxy   * 0.15 +
      homeAdv    * 0.10
    );

    // ── Market probabilities (Poisson) ───────────────────────────────────────
    const probs      = calcMatchProbabilities(hGoalsFor, hGoalsAg, aGoalsFor, aGoalsAg).probabilities;
    const leagueAvg  = 1.35;
    const lH         = (hGoalsFor * aGoalsAg) / leagueAvg;
    const lA         = (aGoalsFor * hGoalsAg) / leagueAvg;
    const totalLam   = lH + lA;
    const over15p    = Math.min(0.97, 1 - poissonProb(totalLam, 0) - poissonProb(totalLam, 1));
    const dcProb     = Math.min(0.95, probs.homeWin + probs.draw);

    const markets: Array<{ key: string; label: string; prob: number }> = [
      { key: "homeWin", label: `${f.homeTeam.name} Ganha`,    prob: probs.homeWin },
      { key: "awayWin", label: `${f.awayTeam.name} Ganha`,    prob: probs.awayWin },
      { key: "over25",  label: "Mais de 2.5 Gols",            prob: probs.over25  },
      { key: "over15",  label: "Mais de 1.5 Gols",            prob: over15p       },
      { key: "btts",    label: "Ambas Marcam",                 prob: probs.btts    },
      { key: "dc",      label: "Dupla Hipótese (Casa/Emp.)",   prob: dcProb        },
    ].sort((a, b) => b.prob - a.prob);

    const best = markets[0]!;

    // Blend formula score + market probability
    const confidence = Math.min(98, Math.round(baseConfidence * 0.60 + Math.round(best.prob * 100) * 0.40));

    // ── Reasons ──────────────────────────────────────────────────────────────
    const reasons: string[] = [];
    if (formScore >= 60)
      reasons.push(`Boa forma recente (${homeForm.slice(-5) || "–"} / ${awayForm.slice(-5) || "–"})`);
    if (avgGoalsTotal >= 2.5)
      reasons.push(`Média combinada de ${avgGoalsTotal.toFixed(1)} gols/jogo`);
    if (avgSoT >= 4.0)
      reasons.push(`${avgSoT.toFixed(1)} finalizações no alvo por jogo`);
    if (best.key === "homeWin" && homeWinRate >= 0.5)
      reasons.push(`${f.homeTeam.name} vence ${Math.round(homeWinRate * 100)}% dos jogos`);
    if (best.key === "btts" && probs.btts >= 0.55)
      reasons.push(`${Math.round(probs.btts * 100)}% de chance de ambas marcarem`);
    if (best.key === "over25" && probs.over25 >= 0.60)
      reasons.push(`${Math.round(probs.over25 * 100)}% de probabilidade O2.5`);
    if (reasons.length === 0)
      reasons.push(`Análise de dados — ${f.league.name} temporada 2025`);

    picks.push({
      fixtureId:  f.id,
      homeTeam:   f.homeTeam.name,
      awayTeam:   f.awayTeam.name,
      homeLogo:   f.homeTeam.logo,
      awayLogo:   f.awayTeam.logo,
      league:     { id: f.league.id, name: f.league.name, logo: f.league.logo },
      kickoff:    f.date,
      betLabel:   best.label,
      betMarket:  best.key,
      confidence,
      reasons:    reasons.slice(0, 3),
    });
  }

  picks.sort((a, b) => b.confidence - a.confidence);

  // Top 3 AI Picks: any market, confidence >= 75
  const top3 = picks.filter(p => p.confidence >= 75).slice(0, 3);

  // Safe Multiple: 3 picks, confidence >= 70, low-risk markets
  const safeKeys = new Set(["over15", "dc", "homeWin"]);
  const safeMultiple = picks.filter(p => p.confidence >= 70 && safeKeys.has(p.betMarket)).slice(0, 3);

  // Aggressive Multiple: 5 picks, confidence >= 65, higher-variance markets
  const aggKeys = new Set(["over25", "btts", "homeWin", "awayWin"]);
  const aggressiveMultiple = picks.filter(p => p.confidence >= 65 && aggKeys.has(p.betMarket)).slice(0, 5);

  const result: BettingInsights = {
    generatedAt: new Date().toISOString(),
    available:   picks.length > 0,
    top3,
    safeMultiple,
    aggressiveMultiple,
  };

  console.log(
    `[betting-insights] Done — ${result.top3.length} top picks | ` +
    `${result.safeMultiple.length} safe | ${result.aggressiveMultiple.length} aggressive`
  );
  return result;
}

// ── Route: GET /betting-insights ──────────────────────────────────────────────
router.get("/betting-insights", async (_req, res) => {
  // Serve from 24-hour cache
  if (insightsCache && Date.now() - insightsCache.ts < INSIGHTS_TTL) {
    return res.json(insightsCache.data);
  }

  // Prevent concurrent generation
  if (insightsRunning) {
    const empty: BettingInsights = {
      generatedAt: new Date().toISOString(), available: false,
      top3: [], safeMultiple: [], aggressiveMultiple: [],
    };
    return res.json(insightsCache?.data ?? empty);
  }

  insightsRunning = true;
  try {
    const data = await generateBettingInsights();
    insightsCache = { data, ts: Date.now() };
    return res.json(data);
  } catch (err: any) {
    console.error("[betting-insights] Generation failed:", err.message);
    const fallback: BettingInsights = {
      generatedAt: new Date().toISOString(), available: false,
      top3: [], safeMultiple: [], aggressiveMultiple: [],
    };
    return res.json(insightsCache?.data ?? fallback);
  } finally {
    insightsRunning = false;
  }
});

// ── GET /modules/status ────────────────────────────────────────────────────────
// Health report for all four independent modules.  Useful for monitoring and debugging.
// Returns the current state of each module without triggering any API calls.
router.get("/modules/status", (_req, res) => {
  const now = Date.now();

  // Live Module — driven by live-engine
  const liveCount  = getLiveCount();
  const liveMax    = 25; // MAX_LIVE_FIXTURES (Performance Rules spec)

  // AI Betting Module — 24 h cache
  const bettingTs   = insightsCache?.ts ?? null;
  const bettingAge  = bettingTs != null ? Math.round((now - bettingTs) / 1000) : null;
  const bettingFresh = bettingTs != null && (now - bettingTs) < INSIGHTS_TTL;

  // Featured / Fixture Module — 30 min featured cache + continuous DB refresh
  const featuredTs   = topBetsCache?.ts ?? null;
  const featuredAge  = featuredTs != null ? Math.round((now - featuredTs) / 1000) : null;
  const featuredFresh = featuredTs != null && (now - featuredTs) < FEATURED_CACHE_TTL;

  // Shared API cache — covers all modules
  const sharedCacheSize = cache.size;

  res.json({
    ts: now,
    apiSuspended,
    modules: {
      live: {
        active:    true,
        liveCount,
        maxFixtures: liveMax,
        updateInterval: "60s",
      },
      aiBetting: {
        active:    true,
        cacheHit:  bettingFresh,
        ageSeconds: bettingAge,
        cacheTtlH:  24,
        picks:      insightsCache?.data?.top3?.length ?? 0,
      },
      matchData: {
        active:        true,
        cacheEntries:  sharedCacheSize,
        statsTtlMin:   10,
      },
      fixture: {
        active:      true,
        featuredCacheHit:  featuredFresh,
        featuredAgeSeconds: featuredAge,
        featuredTtlMin: 30,
      },
    },
  });
});

export default router;
