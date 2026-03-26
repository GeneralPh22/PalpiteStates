/**
 * Centralized in-memory cache manager with named TTL tiers.
 * Single source of truth for all cache durations across the server.
 */

export const TIERS = {
  LIVE:     60       * 1_000,   // 60 s  — live matches + live stats
  FIXTURES: 10  * 60 * 1_000,  // 10 min — today's fixtures + pre-match stats
  ODDS:      5  * 60 * 1_000,  //  5 min — odds data
  TEAMS:     6  * 3600 * 1_000, //  6 h  — team profiles + standings
  LEAGUES:   6  * 3600 * 1_000, //  6 h  — league info
  PLAYERS:  12  * 3600 * 1_000, // 12 h  — top players stats
  SQUAD:    24  * 3600 * 1_000, // 24 h  — squad rosters
} as const;

export type CacheTier = keyof typeof TIERS;

interface Entry<T> {
  data: T;
  ts: number;
}

class CacheManager {
  private readonly store = new Map<string, Entry<unknown>>();

  /** Return cached value if fresh for the given tier, otherwise null. */
  get<T>(key: string, tier: CacheTier): T | null {
    const e = this.store.get(key) as Entry<T> | undefined;
    if (!e) return null;
    if (Date.now() - e.ts > TIERS[tier]) return null;
    return e.data;
  }

  /** Return cached value regardless of age (stale fallback). */
  getStale<T>(key: string): T | null {
    const e = this.store.get(key) as Entry<T> | undefined;
    return e ? (e.data as T) : null;
  }

  /** Store a value with the current timestamp. */
  set<T>(key: string, data: T): void {
    this.store.set(key, { data, ts: Date.now() });
  }

  /** Return true if the entry exists and is still fresh. */
  has(key: string, tier: CacheTier): boolean {
    const e = this.store.get(key);
    return !!e && Date.now() - e.ts <= TIERS[tier];
  }

  delete(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
  get size(): number { return this.store.size; }
}

export const cacheManager = new CacheManager();
