import pg from "pg";

const { Pool } = pg;

let _pool: InstanceType<typeof Pool> | null = null;

function getPool() {
  if (!_pool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

export interface CachedFixture {
  id: number;
  date: string;
  status: { short: string; long: string; elapsed: number | null };
  league: { id: number; name: string; country: string; logo: string; round: string };
  homeTeam: { id: number; name: string; logo: string; winner: boolean | null };
  awayTeam: { id: number; name: string; logo: string; winner: boolean | null };
  score: { home: number | null; away: number | null };
}

function rowToFixture(row: any): CachedFixture {
  return {
    id: row.fixture_id,
    date: row.match_date instanceof Date ? row.match_date.toISOString() : row.match_date,
    status: {
      short: row.status_short,
      long: row.status_long,
      elapsed: row.elapsed ?? null,
    },
    league: {
      id: row.league_id,
      name: row.league_name,
      country: row.league_country ?? "",
      logo: row.league_logo ?? "",
      round: row.league_round ?? "",
    },
    homeTeam: {
      id: row.home_team_id ?? 0,
      name: row.home_team,
      logo: row.home_logo ?? "",
      winner: row.home_winner ?? null,
    },
    awayTeam: {
      id: row.away_team_id ?? 0,
      name: row.away_team,
      logo: row.away_logo ?? "",
      winner: row.away_winner ?? null,
    },
    score: {
      home: row.home_score ?? null,
      away: row.away_score ?? null,
    },
  };
}

// ── Read ─────────────────────────────────────────────────────────────────────

/**
 * Get fixtures from DB that are either today, upcoming, or live.
 * Returns { fixtures, ageMs } — ageMs is how old the newest record is.
 */
export async function getFixturesFromDB(): Promise<{ fixtures: CachedFixture[]; ageMs: number; count: number }> {
  try {
    const pool = getPool();
    const result = await pool.query(`
      SELECT *,
             EXTRACT(EPOCH FROM (NOW() - last_updated)) * 1000 AS age_ms
      FROM fixtures_cache
      WHERE match_date >= NOW() - INTERVAL '3 hours'
        AND match_date <= NOW() + INTERVAL '7 days'
      ORDER BY match_date ASC
      LIMIT 200
    `);

    if (result.rows.length === 0) {
      return { fixtures: [], ageMs: Infinity, count: 0 };
    }

    const ageMs = Math.min(...result.rows.map((r: any) => Number(r.age_ms ?? Infinity)));
    const fixtures = result.rows.map(rowToFixture);
    return { fixtures, ageMs, count: fixtures.length };
  } catch (err: any) {
    console.error("[fixture-db] getFixturesFromDB error:", err.message);
    return { fixtures: [], ageMs: Infinity, count: 0 };
  }
}

/**
 * Fetch a single fixture from DB by its fixture_id.
 * Returns null if not found.  Never throws — errors are logged and null returned.
 */
export async function getFixtureByIdFromDB(fixtureId: number): Promise<CachedFixture | null> {
  try {
    const pool = getPool();
    const result = await pool.query(
      "SELECT * FROM fixtures_cache WHERE fixture_id = $1 LIMIT 1",
      [fixtureId]
    );
    if (result.rows.length === 0) return null;
    return rowToFixture(result.rows[0]);
  } catch (err: any) {
    console.error("[fixture-db] getFixtureByIdFromDB error:", err.message);
    return null;
  }
}

// ── Write ────────────────────────────────────────────────────────────────────

/**
 * Upsert a batch of fixtures from the API response into the DB.
 */
export async function saveFixturesToDB(fixtures: any[]): Promise<void> {
  if (!fixtures || fixtures.length === 0) return;
  const pool = getPool();

  const now = new Date().toISOString();
  let saved = 0;

  for (const item of fixtures) {
    try {
      const f = item.fixture ?? {};
      const t = item.teams ?? {};
      const g = item.goals ?? {};
      const l = item.league ?? {};
      const s = item.score ?? {};

      const fixtureId = f.id;
      if (!fixtureId) continue;

      await pool.query(
        `INSERT INTO fixtures_cache (
          fixture_id, home_team, away_team, home_logo, away_logo,
          league_id, league_name, league_logo, league_country, league_round,
          match_date, status_short, status_long, elapsed,
          home_score, away_score, home_winner, away_winner,
          home_team_id, away_team_id, raw_json, last_updated
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14,
          $15, $16, $17, $18,
          $19, $20, $21, $22
        )
        ON CONFLICT (fixture_id) DO UPDATE SET
          home_team      = EXCLUDED.home_team,
          away_team      = EXCLUDED.away_team,
          home_logo      = EXCLUDED.home_logo,
          away_logo      = EXCLUDED.away_logo,
          league_id      = EXCLUDED.league_id,
          league_name    = EXCLUDED.league_name,
          league_logo    = EXCLUDED.league_logo,
          league_country = EXCLUDED.league_country,
          league_round   = EXCLUDED.league_round,
          match_date     = EXCLUDED.match_date,
          status_short   = EXCLUDED.status_short,
          status_long    = EXCLUDED.status_long,
          elapsed        = EXCLUDED.elapsed,
          home_score     = EXCLUDED.home_score,
          away_score     = EXCLUDED.away_score,
          home_winner    = EXCLUDED.home_winner,
          away_winner    = EXCLUDED.away_winner,
          home_team_id   = EXCLUDED.home_team_id,
          away_team_id   = EXCLUDED.away_team_id,
          raw_json       = EXCLUDED.raw_json,
          last_updated   = EXCLUDED.last_updated`,
        [
          fixtureId,
          t.home?.name ?? "Home",
          t.away?.name ?? "Away",
          t.home?.logo ?? "",
          t.away?.logo ?? "",
          l.id ?? 0,
          l.name ?? "Unknown League",
          l.logo ?? "",
          l.country ?? "",
          l.round ?? "",
          f.date ?? now,
          f.status?.short ?? "NS",
          f.status?.long ?? "Not Started",
          f.status?.elapsed ?? null,
          g.home ?? null,
          g.away ?? null,
          t.home?.winner ?? null,
          t.away?.winner ?? null,
          t.home?.id ?? 0,
          t.away?.id ?? 0,
          JSON.stringify(item),
          now,
        ]
      );
      saved++;
    } catch (rowErr: any) {
      console.error("[fixture-db] Row upsert error:", rowErr.message);
    }
  }

  console.log(`[fixture-db] Saved ${saved}/${fixtures.length} fixtures to DB`);
}

/**
 * Get upcoming (NS-status) fixtures for a specific list of league IDs.
 * Used by the pre-live refresh to check which top leagues are already represented.
 */
export async function getTopLeaguePrelivFromDB(leagueIds: number[]): Promise<{
  fixtures: CachedFixture[];
  leaguesFound: Set<number>;
}> {
  if (leagueIds.length === 0) return { fixtures: [], leaguesFound: new Set() };
  try {
    const pool = getPool();
    const placeholders = leagueIds.map((_, i) => `$${i + 1}`).join(", ");
    const result = await pool.query(
      `SELECT * FROM fixtures_cache
       WHERE status_short = 'NS'
         AND match_date >= NOW()
         AND match_date <= NOW() + INTERVAL '14 days'
         AND league_id = ANY(ARRAY[${placeholders}]::int[])
       ORDER BY match_date ASC
       LIMIT 100`,
      leagueIds
    );
    const fixtures = result.rows.map(rowToFixture);
    const leaguesFound = new Set(result.rows.map((r: any) => Number(r.league_id)));
    return { fixtures, leaguesFound };
  } catch (err: any) {
    console.error("[fixture-db] getTopLeaguePrelivFromDB error:", err.message);
    return { fixtures: [], leaguesFound: new Set() };
  }
}

/**
 * Get upcoming NS fixtures for the scanner — prioritizes specified leagues but
 * falls back to ALL leagues in the DB so the scanner always finds matches.
 * Covers the next 48 hours, ordered priority leagues first then by date.
 */
export async function getScannerFixtures(
  priorityLeagueIds: number[],
  limit: number = 80,
): Promise<CachedFixture[]> {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT *,
         CASE WHEN league_id = ANY($1::int[]) THEN 0 ELSE 1 END AS _priority
       FROM fixtures_cache
       WHERE status_short = 'NS'
         AND match_date >= NOW()
         AND match_date <= NOW() + INTERVAL '48 hours'
       ORDER BY _priority ASC, match_date ASC
       LIMIT $2`,
      [priorityLeagueIds, limit],
    );
    return result.rows.map(rowToFixture);
  } catch (err: any) {
    console.error("[fixture-db] getScannerFixtures error:", err.message);
    return [];
  }
}

// ── Staleness ────────────────────────────────────────────────────────────────

const FIXTURE_FRESH_MS = 10 * 60 * 1000; // 10 minutes

export function isDBFresh(ageMs: number): boolean {
  return ageMs < FIXTURE_FRESH_MS;
}
