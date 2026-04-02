/**
 * request-guard.ts — API Loop Detection and Protection System
 *
 * Intercepts every API-Football call routed through apiFetch() to:
 *   1. Detect loops      — same endpoint ≥5 calls in 10 s → circuit-break 60 s
 *   2. Circuit-break     — serve stale cache instead of calling the blocked endpoint
 *   3. Coalesce inflight — N concurrent identical requests share one HTTP call
 *   4. Log everything    — loop, blocked, coalesced, cache-hit events → circular buffer
 *
 * This module is pure-logic with zero dependencies so it can be imported by
 * both football-api.ts and any future route without circular-import risk.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type RequestOutcome =
  | "api_call"        // real outbound HTTP request made
  | "cache_hit"       // in-memory TTL cache served the result
  | "inflight"        // joined an already-in-flight promise (no HTTP call)
  | "blocked"         // circuit-breaker is open for this endpoint
  | "loop_detected";  // sliding-window threshold triggered; block activated

export interface RequestLogEntry {
  endpoint:  string;
  timestamp: number;
  outcome:   RequestOutcome;
  note?:     string;
}

// ── Configuration ─────────────────────────────────────────────────────────────

/** Sliding window for loop detection (ms). */
const LOOP_WINDOW_MS   = 10_000;  // 10 s

/** Max API calls to the same endpoint within LOOP_WINDOW_MS before loop is declared. */
const LOOP_THRESHOLD   = 5;

/** How long to circuit-break a looping endpoint (ms). */
const BLOCK_DURATION_MS = 60_000; // 60 s

/** Circular log buffer size. */
const LOG_MAX = 500;

// ── Internal state ────────────────────────────────────────────────────────────

/** Per-endpoint call timestamps within the current LOOP_WINDOW_MS. */
const callWindows   = new Map<string, number[]>();

/** Per-endpoint circuit-breaker expiry (ms since epoch). 0 = not blocked. */
const blockedUntil  = new Map<string, number>();

/**
 * In-flight promise registry.
 * When a fetch is in progress, its promise is stored here.
 * Concurrent callers for the same key wait on the same promise instead of
 * launching duplicate HTTP requests.
 */
const inflightMap   = new Map<string, Promise<any>>();

/** Circular request log (newest at end). */
const requestLog: RequestLogEntry[] = [];

// ── Aggregate counters (reset on process restart) ─────────────────────────────
let totalApiCalls     = 0;  // real HTTP requests made
let totalCacheHits    = 0;  // served from TTL cache
let totalInflight     = 0;  // requests coalesced onto an in-flight promise
let totalBlocked      = 0;  // rejected by circuit-breaker
let totalLoopEvents   = 0;  // loop-detected events (each triggers a new block)

// ── Helpers ───────────────────────────────────────────────────────────────────

function addLog(entry: RequestLogEntry): void {
  if (requestLog.length >= LOG_MAX) requestLog.shift();
  requestLog.push(entry);
}

/** Prune expired timestamps from the sliding window for `endpoint`. */
function pruneWindow(endpoint: string): number[] {
  const cutoff = Date.now() - LOOP_WINDOW_MS;
  const times  = (callWindows.get(endpoint) ?? []).filter(t => t > cutoff);
  callWindows.set(endpoint, times);
  return times;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns true if the circuit-breaker is currently open for `endpoint`.
 * Auto-clears expired blocks.
 */
export function isBlocked(endpoint: string): boolean {
  const until = blockedUntil.get(endpoint) ?? 0;
  if (until === 0) return false;
  if (Date.now() >= until) {
    blockedUntil.delete(endpoint);
    console.log(`[request-guard] Circuit-breaker cleared for: ${endpoint}`);
    return false;
  }
  return true;
}

/**
 * Record an outbound API call attempt and run loop detection.
 *
 * Returns `true`  — call should proceed.
 * Returns `false` — endpoint is blocked (circuit-breaker open or just tripped).
 *
 * Side effects:
 *   - Pushes timestamp into the sliding window
 *   - If threshold exceeded, opens the circuit-breaker and logs a loop event
 */
export function recordCall(endpoint: string): boolean {
  const now = Date.now();

  // 1. Hard-block check (already circuit-broken from a previous loop)
  if (isBlocked(endpoint)) {
    totalBlocked++;
    const remainingMs = (blockedUntil.get(endpoint) ?? 0) - now;
    addLog({
      endpoint, timestamp: now, outcome: "blocked",
      note: `Circuit open — ${Math.round(remainingMs / 1000)}s remaining`,
    });
    return false;
  }

  // 2. Slide the window and record this call
  const times = pruneWindow(endpoint);
  times.push(now);
  callWindows.set(endpoint, times);

  // 3. Loop detection — if calls-in-window hits threshold, open the breaker
  if (times.length >= LOOP_THRESHOLD) {
    const expiry = now + BLOCK_DURATION_MS;
    blockedUntil.set(endpoint, expiry);
    totalLoopEvents++;
    totalBlocked++;

    console.error(
      `[request-guard] 🚨 LOOP DETECTED — "${endpoint}" ` +
      `called ${times.length}× in ${LOOP_WINDOW_MS / 1000}s. ` +
      `Circuit-breaking for ${BLOCK_DURATION_MS / 1000}s.`
    );
    addLog({
      endpoint, timestamp: now, outcome: "loop_detected",
      note: `${times.length}× in ${LOOP_WINDOW_MS / 1000}s → blocked ${BLOCK_DURATION_MS / 1000}s`,
    });
    return false;
  }

  // 4. All clear — proceed
  totalApiCalls++;
  addLog({ endpoint, timestamp: now, outcome: "api_call" });
  return true;
}

/**
 * Track an in-memory TTL cache hit (no API call made).
 */
export function recordCacheHit(endpoint: string): void {
  totalCacheHits++;
  addLog({ endpoint, timestamp: Date.now(), outcome: "cache_hit" });
}

/**
 * Inflight coalescing wrapper.
 *
 * If a request for `key` is already in-flight, the caller joins that promise
 * without launching a second HTTP request. Once the in-flight promise settles,
 * all waiters get the same result.
 *
 * @param key     Cache/dedup key (typically the API path).
 * @param fetcher Async function that performs the actual HTTP call.
 */
export async function coalescedFetch<T>(
  key:     string,
  fetcher: () => Promise<T>,
): Promise<T> {
  // Concurrent caller — join the existing in-flight promise
  const existing = inflightMap.get(key);
  if (existing) {
    totalInflight++;
    addLog({
      endpoint: key, timestamp: Date.now(), outcome: "inflight",
      note: "Joined in-flight request — no duplicate HTTP call",
    });
    console.log(`[request-guard] ♻️  Coalesced in-flight request: ${key}`);
    return existing as Promise<T>;
  }

  // First caller — start the fetch and register the promise
  const promise = fetcher().finally(() => inflightMap.delete(key));
  inflightMap.set(key, promise);
  return promise;
}

// ── Observability ─────────────────────────────────────────────────────────────

export interface GuardStats {
  totalApiCalls:   number;
  totalCacheHits:  number;
  totalInflight:   number;
  totalBlocked:    number;
  totalLoopEvents: number;
  cacheHitRate:    string;          // "67.2%"
  inflightCount:   number;          // currently in-flight requests
  blockedEndpoints: Record<string, number>;  // endpoint → seconds remaining
}

export function getGuardStats(): GuardStats {
  const now     = Date.now();
  const total   = totalApiCalls + totalCacheHits;
  const hitRate = total > 0 ? ((totalCacheHits / total) * 100).toFixed(1) + "%" : "n/a";

  const blocked: Record<string, number> = {};
  for (const [ep, until] of blockedUntil.entries()) {
    const rem = Math.round((until - now) / 1000);
    if (rem > 0) blocked[ep] = rem;
  }

  return {
    totalApiCalls,
    totalCacheHits,
    totalInflight,
    totalBlocked,
    totalLoopEvents,
    cacheHitRate:     hitRate,
    inflightCount:    inflightMap.size,
    blockedEndpoints: blocked,
  };
}

/**
 * Returns the last `limit` log entries (newest last).
 * Filters by outcome if `filter` is provided.
 */
export function getRequestLog(
  limit:   number   = 100,
  filter?: RequestOutcome,
): RequestLogEntry[] {
  const entries = filter
    ? requestLog.filter(e => e.outcome === filter)
    : requestLog;
  return entries.slice(-limit);
}
