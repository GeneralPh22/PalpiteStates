/**
 * Live Match Engine
 *
 * This module does NOT poll the API itself. Instead, it receives fixture data
 * from the existing refreshLiveMatches() worker (already runs every 60 s) via
 * updateFromApiResponse(). This avoids double-calling /fixtures?live=all.
 *
 * Worker 3 — refreshes per-fixture statistics every 90 s, independently.
 *
 * Frontend reads from getLiveMatches() / getLiveStats() — zero API cost.
 */

const API_BASE = "https://v3.football.api-sports.io";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LiveFixture {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo: string;
  awayTeamLogo: string;
  homeScore: number;
  awayScore: number;
  league: string;
  leagueId: number;
  leagueLogo: string;
  status: string;       // "1H" | "HT" | "2H" | "ET" | "P" | ...
  elapsed: number | null;
  ts: number;
}

export interface TeamStats {
  team: string;
  shots: number;
  shotsOnTarget: number;
  possession: string;       // "55%" format
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  dangerousAttacks: number; // API-Football "Dangerous Attacks" stat
}

export interface LiveMatchStats {
  fixtureId: number;
  home: TeamStats;
  away: TeamStats;
  ts: number;
}

// ── In-memory stores ───────────────────────────────────────────────────────────

const liveMatchesStore = new Map<number, LiveFixture>();
const liveStatsStore   = new Map<number, LiveMatchStats>();

// ── Internal helpers ──────────────────────────────────────────────────────────

async function fetchLiveApi(path: string): Promise<any> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: {
        "x-apisports-key":  apiKey,
        "x-rapidapi-host": "v3.football.api-sports.io",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function extractStat(stats: any[], type: string): any {
  return stats?.find((s: any) => s.type === type)?.value ?? null;
}

function mapTeamStats(teamName: string, stats: any[]): TeamStats {
  const possession = extractStat(stats, "Ball Possession");
  return {
    team:             teamName,
    shots:            Number(extractStat(stats, "Total Shots"))       || 0,
    shotsOnTarget:    Number(extractStat(stats, "Shots on Goal"))     || 0,
    possession:       typeof possession === "string" ? possession : "0%",
    corners:          Number(extractStat(stats, "Corner Kicks"))      || 0,
    fouls:            Number(extractStat(stats, "Fouls"))             || 0,
    yellowCards:      Number(extractStat(stats, "Yellow Cards"))      || 0,
    redCards:         Number(extractStat(stats, "Red Cards"))         || 0,
    dangerousAttacks: Number(extractStat(stats, "Dangerous Attacks")) || 0,
  };
}

/** Fetch and store statistics for one live fixture. */
async function fetchStatsForFixture(fixtureId: number): Promise<void> {
  // Skip if stats are fresh (< 55 s old) to avoid wasteful refetches
  const existing = liveStatsStore.get(fixtureId);
  if (existing && Date.now() - existing.ts < 55_000) return;

  const json = await fetchLiveApi(`/fixtures/statistics?fixture=${fixtureId}`);
  if (!json?.response?.length) return;

  const homeEntry = json.response[0];
  const awayEntry = json.response[1];
  if (!homeEntry) return;

  const homeStats = mapTeamStats(homeEntry.team?.name ?? "", homeEntry.statistics ?? []);
  const awayStats = awayEntry
    ? mapTeamStats(awayEntry.team?.name ?? "", awayEntry.statistics ?? [])
    : { team: "", shots: 0, shotsOnTarget: 0, possession: "0%", corners: 0, fouls: 0, yellowCards: 0, redCards: 0 };

  liveStatsStore.set(fixtureId, { fixtureId, home: homeStats, away: awayStats, ts: Date.now() });
}

/** Worker 3 — re-fetches stats every 90 s for all currently-live fixtures. */
async function runStatsWorker(): Promise<void> {
  const ids = [...liveMatchesStore.keys()].slice(0, 8);
  if (ids.length === 0) return;
  await Promise.allSettled(ids.map(fetchStatsForFixture));
  console.log(`[live-engine] Stats worker — refreshed ${liveStatsStore.size}/${ids.length} fixtures`);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Called by the existing refreshLiveMatches() worker in football-api.ts after
 * it has successfully fetched /fixtures?live=all. Processes the raw API response
 * and updates the in-memory store. Zero extra API cost.
 */
export function updateFromApiResponse(fixtures: any[]): void {
  if (!Array.isArray(fixtures)) return;

  const currentIds = new Set<number>();

  for (const f of fixtures) {
    const id: number = f.fixture?.id;
    if (!id) continue;
    currentIds.add(id);

    liveMatchesStore.set(id, {
      fixtureId:    id,
      homeTeam:     f.teams?.home?.name  ?? "",
      awayTeam:     f.teams?.away?.name  ?? "",
      homeTeamLogo: f.teams?.home?.logo  ?? "",
      awayTeamLogo: f.teams?.away?.logo  ?? "",
      homeScore:    f.goals?.home        ?? 0,
      awayScore:    f.goals?.away        ?? 0,
      league:       f.league?.name       ?? "",
      leagueId:     f.league?.id         ?? 0,
      leagueLogo:   f.league?.logo       ?? "",
      status:       f.fixture?.status?.short    ?? "",
      elapsed:      f.fixture?.status?.elapsed  ?? null,
      ts:           Date.now(),
    });
  }

  // Evict matches that are no longer live
  for (const id of liveMatchesStore.keys()) {
    if (!currentIds.has(id)) {
      liveMatchesStore.delete(id);
      liveStatsStore.delete(id);
    }
  }

  // Fetch stats for up to 8 live matches (background, no await)
  const toFetch = [...currentIds].slice(0, 8);
  if (toFetch.length > 0) {
    Promise.allSettled(toFetch.map(fetchStatsForFixture)).then(() => {
      console.log(`[live-engine] ${liveMatchesStore.size} live matches, ${liveStatsStore.size} with stats`);
    });
  }
}

/** Call once at server startup to start the background stats refresh worker. */
export function startLiveEngine(): void {
  // Worker 3: refresh stats for live fixtures every 90 s
  setInterval(runStatsWorker, 90_000);
  console.log("[live-engine] stats worker started (90 s interval)");
}

export function getLiveMatches(): LiveFixture[] {
  return [...liveMatchesStore.values()].sort((a, b) => {
    const rank = (s: string) =>
      s === "1H" || s === "2H" ? 0 : s === "HT" ? 1 : 2;
    return rank(a.status) - rank(b.status);
  });
}

export function getLiveStats(fixtureId: number): LiveMatchStats | null {
  return liveStatsStore.get(fixtureId) ?? null;
}

export function getLiveCount(): number {
  return liveMatchesStore.size;
}
