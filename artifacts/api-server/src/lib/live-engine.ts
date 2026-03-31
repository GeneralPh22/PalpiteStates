/**
 * Live Match Engine
 *
 * Receives fixture data from the existing refreshLiveMatches() worker (runs
 * every 30 s) via updateFromApiResponse(). No duplicate /fixtures?live=all calls.
 *
 * Worker 3 — refreshes per-fixture statistics AND events every 30 s.
 *   - Prioritises major-league matches
 *   - Hard limit: 30 fixtures per cycle (Performance Rules spec)
 *   - Stats:   30 s freshness cache; empty results retried after 10 s (spec)
 *   - Events:  20 s freshness cache (spec)
 *   - Timeout: 8 s per API call (failsafe — stale data shown if delayed)
 *
 * Failsafe: if an API call times out or returns an error, the last cached data
 * is kept and the next worker cycle (30 s later) retries automatically.
 *
 * Frontend reads getLiveMatches() / getLiveStats() / getLiveEvents() — zero API cost.
 */

const API_BASE = "https://v3.football.api-sports.io";

// ── Status sets ───────────────────────────────────────────────────────────────

/** Only these statuses are considered "live" — everything else is filtered out. */
const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "P", "BT"]);

/** These statuses mark a match as definitively over or cancelled. */
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN", "CANC", "ABD", "WO", "PST", "SUSP"]);

/** How long to keep a finished match in the recents store (30 min). */
const FINISHED_TTL_MS = 30 * 60_000;

// ── Major-league priority set (processed first in each worker cycle) ──────────
const PRIORITY_LEAGUE_IDS = new Set([
  39, 140, 78, 61, 135, 71,   // Top-6 domestic
  2, 3, 848,                   // UCL / UEL / UECL
  13, 11, 9, 73,               // Copa Libertadores / Sudamericana / Copa America / Copa do Brasil
  40, 141, 79, 136, 62, 72,   // Tier-2 domestic
]);

const MAX_LIVE_FIXTURES = 30; // hard API-budget cap per cycle (Performance Rules spec)

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LiveFixture {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
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
  dangerousAttacks: number;
}

export interface LiveMatchStats {
  fixtureId: number;
  home: TeamStats;
  away: TeamStats;
  ts: number;
}

export interface LiveEvent {
  minute: number;
  extra: number | null;
  type: string;          // "Goal" | "Card" | "subst" | "Var"
  detail: string;        // "Normal Goal" | "Yellow Card" | "Red Card" | "Penalty" | ...
  teamId: number;
  teamName: string;
  playerName: string | null;
  assistName: string | null;
}

export interface LiveMatchEvents {
  fixtureId: number;
  events: LiveEvent[];
  ts: number;
}

// ── In-memory stores ───────────────────────────────────────────────────────────

const liveMatchesStore     = new Map<number, LiveFixture>();
const liveStatsStore       = new Map<number, LiveMatchStats>();
const liveEventsStore      = new Map<number, LiveMatchEvents>();

/** Recently finished matches — kept for FINISHED_TTL_MS so the UI can show them briefly. */
const finishedMatchesStore = new Map<number, LiveFixture & { finishedAt: number }>();

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
      signal: AbortSignal.timeout(8_000),  // 8 s — failsafe; stale cache shown if exceeded
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

const EMPTY_TEAM_STATS = (name = ""): TeamStats => ({
  team: name, shots: 0, shotsOnTarget: 0, possession: "0%",
  corners: 0, fouls: 0, yellowCards: 0, redCards: 0, dangerousAttacks: 0,
});

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

// ── Stats fetcher ─────────────────────────────────────────────────────────────

async function fetchStatsForFixture(fixtureId: number): Promise<void> {
  const existing = liveStatsStore.get(fixtureId);
  if (existing) {
    const age     = Date.now() - existing.ts;
    const hasData = existing.home.shots > 0 || existing.away.shots > 0 ||
                    existing.home.shotsOnTarget > 0 || existing.home.corners > 0;
    // Fresh with real data → skip; empty → retry after 10 s; stale → refetch after 45 s (spec)
    if (hasData && age < 45_000) return;
    if (!hasData && age < 10_000) return;
  }

  const json = await fetchLiveApi(`/fixtures/statistics?fixture=${fixtureId}`);
  if (!json?.response?.length) {
    // API returned nothing — stamp a time so we retry in 20 s, not immediately
    if (!existing) {
      liveStatsStore.set(fixtureId, {
        fixtureId,
        home: EMPTY_TEAM_STATS(),
        away: EMPTY_TEAM_STATS(),
        ts: Date.now() - 11_000, // intentionally "old" so 10 s empty-retry triggers
      });
    }
    return;
  }

  const homeEntry = json.response[0];
  const awayEntry = json.response[1];
  if (!homeEntry) return;

  liveStatsStore.set(fixtureId, {
    fixtureId,
    home: mapTeamStats(homeEntry.team?.name ?? "", homeEntry.statistics ?? []),
    away: awayEntry
      ? mapTeamStats(awayEntry.team?.name ?? "", awayEntry.statistics ?? [])
      : EMPTY_TEAM_STATS(),
    ts: Date.now(),
  });
}

// ── Events fetcher ─────────────────────────────────────────────────────────────

async function fetchEventsForFixture(fixtureId: number): Promise<void> {
  const existing = liveEventsStore.get(fixtureId);
  if (existing && Date.now() - existing.ts < 20_000) return; // 20 s freshness (spec)

  const json = await fetchLiveApi(`/fixtures/events?fixture=${fixtureId}`);
  if (!json?.response) return;

  const events: LiveEvent[] = (json.response as any[]).map(e => ({
    minute:     e.time?.elapsed    ?? 0,
    extra:      e.time?.extra      ?? null,
    type:       e.type             ?? "",
    detail:     e.detail           ?? "",
    teamId:     e.team?.id         ?? 0,
    teamName:   e.team?.name       ?? "",
    playerName: e.player?.name     ?? null,
    assistName: e.assist?.name     ?? null,
  }));

  liveEventsStore.set(fixtureId, { fixtureId, events, ts: Date.now() });
}

// ── Priority sorter ────────────────────────────────────────────────────────────

function prioritisedIds(): number[] {
  const all = [...liveMatchesStore.values()];
  all.sort((a, b) => {
    const ap = PRIORITY_LEAGUE_IDS.has(a.leagueId) ? 0 : 1;
    const bp = PRIORITY_LEAGUE_IDS.has(b.leagueId) ? 0 : 1;
    return ap - bp;
  });
  return all.slice(0, MAX_LIVE_FIXTURES).map(m => m.fixtureId);
}

// ── Worker 3 — stats + events every 60 s ──────────────────────────────────────

async function runLiveDataWorker(): Promise<void> {
  const ids = prioritisedIds();
  if (ids.length === 0) return;

  // Interleave stats + events to spread API calls
  const tasks: Promise<void>[] = [];
  for (const id of ids) {
    tasks.push(fetchStatsForFixture(id));
    tasks.push(fetchEventsForFixture(id));
  }
  await Promise.allSettled(tasks);

  console.log(
    `[live-engine] worker — ${ids.length} fixtures | ` +
    `stats: ${liveStatsStore.size} | events: ${liveEventsStore.size}`
  );
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Remove one fixture from all live stores and, if finished, move to the finished store. */
function evictLiveFixture(id: number, fixture?: LiveFixture): void {
  if (fixture && FINISHED_STATUSES.has(fixture.status)) {
    // Promote to finished store — only if not already there
    if (!finishedMatchesStore.has(id)) {
      finishedMatchesStore.set(id, { ...fixture, finishedAt: Date.now() });
    }
  }
  liveMatchesStore.delete(id);
  liveStatsStore.delete(id);
  liveEventsStore.delete(id);
}

/** Remove expired entries from the finished matches store. */
function evictOldFinishedMatches(): void {
  const cutoff = Date.now() - FINISHED_TTL_MS;
  for (const [id, m] of finishedMatchesStore) {
    if (m.finishedAt < cutoff) finishedMatchesStore.delete(id);
  }
}

/**
 * Called by refreshLiveMatches() in football-api.ts every 60 s.
 * Parses raw /fixtures?live=all response, updates the store, evicts stale entries,
 * and triggers background fetch of stats+events for new/priority matches.
 */
export function updateFromApiResponse(fixtures: any[]): void {
  if (!Array.isArray(fixtures)) return;

  const seenIds = new Set<number>();

  for (const f of fixtures) {
    const id: number = f.fixture?.id;
    if (!id) continue;

    const status: string = f.fixture?.status?.short ?? "";

    // Never add finished/cancelled matches to the live store
    if (FINISHED_STATUSES.has(status)) {
      // If it was previously live, evict and promote to finished
      const existing = liveMatchesStore.get(id);
      if (existing) {
        evictLiveFixture(id, { ...existing, status });
        console.log(`[live-engine] match ${id} transitioned to ${status} — moved to finished`);
      }
      continue; // do NOT add to seenIds so the eviction below also handles it
    }

    // Only accept genuine live statuses
    if (!LIVE_STATUSES.has(status)) {
      console.log(`[live-engine] ignoring fixture ${id} with unexpected status "${status}"`);
      continue;
    }

    seenIds.add(id);
    liveMatchesStore.set(id, {
      fixtureId:    id,
      homeTeam:     f.teams?.home?.name  ?? "",
      awayTeam:     f.teams?.away?.name  ?? "",
      homeTeamId:   f.teams?.home?.id    ?? 0,
      awayTeamId:   f.teams?.away?.id    ?? 0,
      homeTeamLogo: f.teams?.home?.logo  ?? "",
      awayTeamLogo: f.teams?.away?.logo  ?? "",
      homeScore:    f.goals?.home        ?? 0,
      awayScore:    f.goals?.away        ?? 0,
      league:       f.league?.name       ?? "",
      leagueId:     f.league?.id         ?? 0,
      leagueLogo:   f.league?.logo       ?? "",
      status,
      elapsed:      f.fixture?.status?.elapsed ?? null,
      ts:           Date.now(),
    });
  }

  // Evict matches that disappeared from the live feed
  // API-Football stops including a match in /fixtures?live=all once it finishes,
  // so "disappeared" almost always means "finished". We always promote these to
  // the finished store using the last known score/status.
  for (const [id, fixture] of liveMatchesStore) {
    if (!seenIds.has(id)) {
      // Add to finished store if not already there (use "FT" as fallback status)
      if (!finishedMatchesStore.has(id)) {
        finishedMatchesStore.set(id, {
          ...fixture,
          status:     FINISHED_STATUSES.has(fixture.status) ? fixture.status : "FT",
          finishedAt: Date.now(),
        });
      }
      liveMatchesStore.delete(id);
      liveStatsStore.delete(id);
      liveEventsStore.delete(id);
    }
  }

  // Background: fetch stats + events for priority matches
  const ids = prioritisedIds();
  if (ids.length > 0) {
    const tasks = [
      ...ids.map(fetchStatsForFixture),
      ...ids.map(fetchEventsForFixture),
    ];
    Promise.allSettled(tasks).then(() => {
      console.log(
        `[live-engine] ${liveMatchesStore.size} live | ` +
        `${liveStatsStore.size} stats | ${liveEventsStore.size} events | ` +
        `${finishedMatchesStore.size} recently finished`
      );
    });
  }
}

/** 30 s safety cleanup — removes any live-store entries with finished statuses. */
function runCleanupWorker(): void {
  let removed = 0;
  for (const [id, fixture] of liveMatchesStore) {
    if (!LIVE_STATUSES.has(fixture.status)) {
      evictLiveFixture(id, fixture);
      removed++;
    }
  }
  evictOldFinishedMatches();
  if (removed > 0) {
    console.log(`[live-engine] cleanup — removed ${removed} non-live fixture(s)`);
  }
}

/** Call once at server startup. */
export function startLiveEngine(): void {
  setInterval(runLiveDataWorker, 30_000);  // stats + events every 30 s
  setInterval(runCleanupWorker,  30_000);  // safety: evict finished matches every 30 s
  console.log("[live-engine] data worker started (stats + events 30 s | cleanup 30 s)");
}

export function getLiveMatches(): LiveFixture[] {
  return [...liveMatchesStore.values()]
    // Double-filter: only genuine live statuses
    .filter(m => LIVE_STATUSES.has(m.status))
    .sort((a, b) => {
      const rank = (s: string) =>
        s === "1H" || s === "2H" ? 0 : s === "HT" ? 1 : 2;
      return rank(a.status) - rank(b.status);
    });
}

export function getLiveStats(fixtureId: number): LiveMatchStats | null {
  return liveStatsStore.get(fixtureId) ?? null;
}

export function getLiveEvents(fixtureId: number): LiveMatchEvents | null {
  return liveEventsStore.get(fixtureId) ?? null;
}

/** Returns recently finished matches (within FINISHED_TTL_MS) for the UI. */
export function getFinishedMatches(): Array<LiveFixture & { finishedAt: number }> {
  evictOldFinishedMatches();
  return [...finishedMatchesStore.values()].sort((a, b) => b.finishedAt - a.finishedAt);
}

export function getLiveCount(): number {
  return liveMatchesStore.size;
}
