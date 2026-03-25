import { Router, type IRouter } from "express";
import {
  getFixturesFromDB,
  saveFixturesToDB,
  isDBFresh,
  getTopLeaguePrelivFromDB,
  type CachedFixture,
} from "../lib/fixture-db.js";

const router: IRouter = Router();

const API_BASE = "https://v3.football.api-sports.io";

const TOP_LEAGUES = [
  39,   // Premier League
  140,  // La Liga
  78,   // Bundesliga
  61,   // Ligue 1
  135,  // Serie A
  71,   // Brasileirão
  2,    // Champions League
  3,    // Europa League
];

// The 6 main leagues always guaranteed in pre-live section
const TOP_SIX_LEAGUES = [39, 140, 78, 61, 135, 71];

const cache = new Map<string, { data: unknown; ts: number }>();
const ODDS_TTL = 5 * 60 * 1000;       // 5 minutes
const STATS_TTL = 10 * 60 * 1000;     // 10 minutes
const MATCH_TTL = 2 * 60 * 1000;      // 2 minutes
const FIXTURE_LIST_TTL = 5 * 60 * 1000;  //  5 minutes – homepage fixture lists
const PRELIVE_TTL = 60 * 1000;           // 60 seconds – pre-live fixtures (in-memory dedup)
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
// Polls /fixtures?live=all every 60s — only when live matches exist in DB.
// Single efficient API call; result updates those specific fixtures in DB.
const LIVE_STATUS_CODES = new Set(["1H", "2H", "ET", "HT", "P", "BT"]);
let liveRefreshRunning = false;

async function refreshLiveMatches() {
  if (liveRefreshRunning || apiSuspended) return;
  liveRefreshRunning = true;
  try {
    // Check DB for live matches — free read, no API cost
    const { fixtures: dbFixtures } = await getFixturesFromDB();
    const hasLive = dbFixtures.some(f => LIVE_STATUS_CODES.has(f.status.short));
    if (!hasLive) return;

    console.log("[live-refresh] Live matches detected — polling /fixtures?live=all");
    const { data, ok } = await apiFetch("/fixtures?live=all", LIVE_TTL);
    if (ok && data && (data.results ?? 0) > 0) {
      await saveFixturesToDB(data.response ?? []);
      console.log(`[live-refresh] Updated ${data.results} live fixtures`);
    }
  } catch (err: any) {
    console.error("[live-refresh] Error:", err.message);
  } finally {
    liveRefreshRunning = false;
  }
}

setInterval(refreshLiveMatches, 60 * 1000);

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

// ── api-status ─────────────────────────────────────────────────────────────────
router.get("/api-status", (_req, res) => {
  res.json({ suspended: apiSuspended, cacheSize: cache.size });
});

export default router;
