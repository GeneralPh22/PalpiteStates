/**
 * matchDataWorker — Central background data coordinator for PalpiteStats.
 *
 * Orchestrates all batch fixture fetches on a single 60-second tick.
 * Each data category has its own TTL-guarded interval:
 *
 *   upcoming matches  →  5 min  (fixtures?next=20 + today's date)
 *   finished matches  → 15 min  (fixtures?last=20)
 *   live matches      → 60 s   (handled separately by live-engine + refreshLiveMatches)
 *
 * The frontend NEVER calls API-Football directly.
 * All data flows: API-Football → matchDataWorker → DB/cache → frontend endpoints.
 */

export interface WorkerStatus {
  running:             boolean;
  totalCycles:         number;
  lastCycleAt:         number;
  lastUpcomingFetchAt: number;
  lastFinishedFetchAt: number;
  upcomingNextInSec:   number;
  finishedNextInSec:   number;
}

type AsyncFn = () => Promise<void>;

export const UPCOMING_TTL = 5  * 60 * 1000;  //  5 min — upcoming matches cache
export const FINISHED_TTL = 15 * 60 * 1000;  // 15 min — finished matches cache

class MatchDataWorkerClass {
  private _fetchUpcoming: AsyncFn | null = null;
  private _fetchFinished: AsyncFn | null = null;
  private _isEmergency: (() => boolean) | null = null;

  private running             = false;
  private totalCycles         = 0;
  private lastCycleAt         = 0;
  private lastUpcomingFetchAt = 0;
  private lastFinishedFetchAt = 0;

  /**
   * Wire up fetch callbacks from football-api.ts before calling start().
   * Using callbacks avoids circular imports between the lib and the routes layer.
   */
  configure(opts: {
    fetchUpcoming: AsyncFn;
    fetchFinished: AsyncFn;
    isEmergency: () => boolean;
  }): void {
    this._fetchUpcoming = opts.fetchUpcoming;
    this._fetchFinished = opts.fetchFinished;
    this._isEmergency   = opts.isEmergency;
  }

  async runCycle(): Promise<void> {
    if (this.running) return;
    if (!this._fetchUpcoming || !this._fetchFinished) return;

    this.running     = true;
    this.lastCycleAt = Date.now();
    this.totalCycles++;

    try {
      if (this._isEmergency?.()) {
        console.warn(
          `[matchDataWorker] 🚨 Emergency mode active — skipping batch fetches ` +
          `(cycle #${this.totalCycles})`
        );
        return;
      }

      const now = Date.now();

      // ── Upcoming matches: fetch every 5 min ──────────────────────────────
      if (now - this.lastUpcomingFetchAt >= UPCOMING_TTL) {
        console.log(`[matchDataWorker] Fetching upcoming matches (cycle #${this.totalCycles})`);
        await this._fetchUpcoming();
        this.lastUpcomingFetchAt = Date.now();
      }

      // ── Finished matches: fetch every 15 min ─────────────────────────────
      if (now - this.lastFinishedFetchAt >= FINISHED_TTL) {
        console.log(`[matchDataWorker] Fetching finished matches (cycle #${this.totalCycles})`);
        await this._fetchFinished();
        this.lastFinishedFetchAt = Date.now();
      }

    } catch (err: any) {
      console.error("[matchDataWorker] Cycle error:", err.message);
    } finally {
      this.running = false;
    }
  }

  /**
   * Start the worker. Runs immediately (after 3 s), then every 60 s.
   * Call configure() before start().
   */
  start(): void {
    setTimeout(() => this.runCycle().catch(() => {}), 3_000);
    setInterval(() => this.runCycle().catch(() => {}), 60_000);
    console.log(
      "[matchDataWorker] Started — " +
      "upcoming: 5 min | finished: 15 min | live: handled by live-engine (60 s)"
    );
  }

  getStatus(): WorkerStatus {
    const now = Date.now();
    return {
      running:             this.running,
      totalCycles:         this.totalCycles,
      lastCycleAt:         this.lastCycleAt,
      lastUpcomingFetchAt: this.lastUpcomingFetchAt,
      lastFinishedFetchAt: this.lastFinishedFetchAt,
      upcomingNextInSec:   Math.round(Math.max(0, this.lastUpcomingFetchAt + UPCOMING_TTL - now) / 1000),
      finishedNextInSec:   Math.round(Math.max(0, this.lastFinishedFetchAt + FINISHED_TTL - now) / 1000),
    };
  }
}

export const matchDataWorker = new MatchDataWorkerClass();
