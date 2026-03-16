import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Trophy,
  Activity,
  BarChart2,
  Users,
  TrendingUp,
  Cpu,
  Swords,
  Globe,
  Clock,
  Target,
  Loader2,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Fixture {
  id: number;
  date: string;
  status: { short: string; long: string; elapsed: number | null };
  league: { id: number; name: string; country: string; logo: string; round: string };
  homeTeam: { id: number; name: string; logo: string; winner: boolean | null };
  awayTeam: { id: number; name: string; logo: string; winner: boolean | null };
  score: { home: number | null; away: number | null };
}

const TABS = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "stats", label: "Team Stats", icon: BarChart2 },
  { id: "h2h", label: "H2H", icon: Swords },
  { id: "players", label: "Players", icon: Users },
  { id: "odds", label: "Odds", icon: TrendingUp },
  { id: "ai", label: "AI Analysis", icon: Cpu },
];

function StatBar({ label, home, away, homeLabel, awayLabel, inverted = false }: {
  label: string; home: number; away: number; homeLabel?: string; awayLabel?: string; inverted?: boolean;
}) {
  const total = home + away || 1;
  const homeWidth = Math.round((home / total) * 100);
  const awayWidth = 100 - homeWidth;
  const homeWins = inverted ? home < away : home > away;
  const awayWins = inverted ? away < home : away > home;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center text-xs font-medium">
        <span className={cn("text-sm tabular-nums font-bold", homeWins ? "text-white" : "text-zinc-400")}>
          {homeLabel ?? home}
        </span>
        <span className="text-zinc-500 text-[10px] uppercase tracking-wider">{label}</span>
        <span className={cn("text-sm tabular-nums font-bold", awayWins ? "text-white" : "text-zinc-400")}>
          {awayLabel ?? away}
        </span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-white/[0.05]">
        <div
          className={cn("h-full rounded-l-full transition-all duration-700", homeWins ? "bg-primary" : "bg-zinc-600")}
          style={{ width: `${homeWidth}%` }}
        />
        <div
          className={cn("h-full rounded-r-full transition-all duration-700", awayWins ? "bg-blue-500" : "bg-zinc-700")}
          style={{ width: `${awayWidth}%` }}
        />
      </div>
    </div>
  );
}

function ProbBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-400 font-medium">{label}</span>
        <span className="text-white font-bold">{pct}%</span>
      </div>
      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className={cn("h-full rounded-full", color)}
        />
      </div>
    </div>
  );
}

function FormBadge({ form }: { form: string }) {
  return (
    <div className="flex gap-1">
      {form
        .slice(-10)
        .split("")
        .map((c, i) => (
          <span
            key={i}
            className={cn(
              "w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center",
              c === "W" && "bg-primary/20 text-primary border border-primary/30",
              c === "D" && "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30",
              c === "L" && "bg-red-500/20 text-red-400 border border-red-500/30"
            )}
          >
            {c}
          </span>
        ))}
    </div>
  );
}

// ── TAB: Overview ──────────────────────────────────────────────────────────────
function TabOverview({ fixture, analysis }: { fixture: Fixture; analysis: any }) {
  if (!analysis) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-600 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading analysis...
      </div>
    );
  }

  const { probabilities, expectedGoals, homeStats, awayStats } = analysis;

  const getConfidence = (p: number) =>
    p >= 0.65 ? "High" : p >= 0.5 ? "Medium" : "Low";
  const getConfidenceColor = (p: number) =>
    p >= 0.65 ? "text-primary" : p >= 0.5 ? "text-amber-400" : "text-zinc-500";

  const bets = [
    { label: `${fixture.homeTeam.name} Win`, prob: probabilities.homeWin, market: "1X2" },
    { label: `${fixture.awayTeam.name} Win`, prob: probabilities.awayWin, market: "1X2" },
    { label: "Draw", prob: probabilities.draw, market: "1X2" },
    { label: "Over 2.5 Goals", prob: probabilities.over25, market: "Goals" },
    { label: "Both Teams Score", prob: probabilities.btts, market: "BTTS" },
  ].sort((a, b) => b.prob - a.prob);

  const topBet = bets[0];

  return (
    <div className="space-y-6">
      {/* xG & top suggestion */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-5 text-center">
          <div className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-1">Expected Goals</div>
          <div className="text-4xl font-display font-black text-white">{expectedGoals}</div>
          <div className="text-xs text-zinc-600 mt-1">Combined xG</div>
        </div>
        <div className="bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 rounded-2xl p-5">
          <div className="text-xs text-primary uppercase tracking-wider font-semibold mb-2">AI Top Pick</div>
          <div className="text-sm font-bold text-white mb-1">{topBet.label}</div>
          <div className="text-2xl font-display font-black text-primary">{Math.round(topBet.prob * 100)}%</div>
          <div className={cn("text-xs font-semibold mt-1", getConfidenceColor(topBet.prob))}>
            {getConfidence(topBet.prob)} confidence
          </div>
        </div>
      </div>

      {/* Probability bars */}
      <div className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          Match Probabilities
        </h3>
        <ProbBar label={`${fixture.homeTeam.name} Win`} value={probabilities.homeWin} color="bg-primary" />
        <ProbBar label="Draw" value={probabilities.draw} color="bg-zinc-500" />
        <ProbBar label={`${fixture.awayTeam.name} Win`} value={probabilities.awayWin} color="bg-blue-500" />
        <div className="pt-2 border-t border-white/[0.05] space-y-3">
          <ProbBar label="Over 2.5 Goals" value={probabilities.over25} color="bg-amber-500" />
          <ProbBar label="Both Teams Score" value={probabilities.btts} color="bg-emerald-500" />
          <ProbBar label="Over 8.5 Corners" value={probabilities.cornerOver9} color="bg-purple-500" />
          <ProbBar label="Over 3.5 Cards" value={probabilities.over35cards ?? 0.35} color="bg-rose-500" />
        </div>
      </div>

      {/* Team form */}
      {(homeStats || awayStats) && (
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: fixture.homeTeam.name, logo: fixture.homeTeam.logo, stats: homeStats },
            { label: fixture.awayTeam.name, logo: fixture.awayTeam.logo, stats: awayStats },
          ].map(({ label, logo, stats }) =>
            stats ? (
              <div key={label} className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  {logo && <img src={logo} alt="" className="w-6 h-6 object-contain" loading="lazy" />}
                  <span className="text-xs font-bold text-zinc-300 truncate">{label}</span>
                </div>
                <FormBadge form={stats.form ?? ""} />
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-lg font-black text-primary">{stats.wins}</div>
                    <div className="text-[9px] text-zinc-600 uppercase">W</div>
                  </div>
                  <div>
                    <div className="text-lg font-black text-zinc-400">{stats.draws}</div>
                    <div className="text-[9px] text-zinc-600 uppercase">D</div>
                  </div>
                  <div>
                    <div className="text-lg font-black text-red-400">{stats.losses}</div>
                    <div className="text-[9px] text-zinc-600 uppercase">L</div>
                  </div>
                </div>
                <div className="border-t border-white/[0.05] pt-2.5 grid grid-cols-2 gap-y-1.5 text-[10px]">
                  <div className="flex justify-between pr-2">
                    <span className="text-zinc-600">Avg scored</span>
                    <span className="text-zinc-300 font-semibold">{stats.avgGoalsFor ?? "—"}</span>
                  </div>
                  <div className="flex justify-between pl-2 border-l border-white/[0.05]">
                    <span className="text-zinc-600">Avg conceded</span>
                    <span className="text-zinc-300 font-semibold">{stats.avgGoalsAgainst ?? "—"}</span>
                  </div>
                  <div className="flex justify-between pr-2">
                    <span className="text-zinc-600">Over 2.5</span>
                    <span className="text-amber-400 font-semibold">{stats.over25Pct != null ? `${stats.over25Pct}%` : "—"}</span>
                  </div>
                  <div className="flex justify-between pl-2 border-l border-white/[0.05]">
                    <span className="text-zinc-600">BTTS</span>
                    <span className="text-emerald-400 font-semibold">{stats.bttsPct != null ? `${stats.bttsPct}%` : "—"}</span>
                  </div>
                  <div className="flex justify-between pr-2">
                    <span className="text-zinc-600">Clean sheets</span>
                    <span className="text-zinc-300 font-semibold">{stats.cleanSheets ?? "—"}</span>
                  </div>
                  <div className="flex justify-between pl-2 border-l border-white/[0.05]">
                    <span className="text-zinc-600">Failed to score</span>
                    <span className="text-zinc-300 font-semibold">{stats.failedToScore ?? "—"}</span>
                  </div>
                </div>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

// ── TAB: Team Stats ────────────────────────────────────────────────────────────
function TabTeamStats({ fixture, stats }: { fixture: Fixture; stats: any }) {
  if (!stats?.stats) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-600 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading statistics...
      </div>
    );
  }

  const [homeTeamStats, awayTeamStats] = stats.stats;
  const getVal = (teamStats: any, type: string): number => {
    const s = (teamStats?.statistics ?? []).find((s: any) => s.type === type);
    if (!s) return 0;
    const v = s.value;
    if (typeof v === "string" && v.includes("%")) return parseInt(v);
    return typeof v === "number" ? v : parseInt(v ?? "0") || 0;
  };
  const getStr = (teamStats: any, type: string): string => {
    const s = (teamStats?.statistics ?? []).find((s: any) => s.type === type);
    return s?.value != null ? String(s.value) : "0";
  };

  const rows = [
    { label: "Shots on Target", key: "Shots on Goal", inverted: false },
    { label: "Total Shots", key: "Total Shots", inverted: false },
    { label: "Ball Possession", key: "Ball Possession", inverted: false },
    { label: "Corner Kicks", key: "Corner Kicks", inverted: false },
    { label: "Fouls", key: "Fouls", inverted: true },
    { label: "Yellow Cards", key: "Yellow Cards", inverted: true },
    { label: "Red Cards", key: "Red Cards", inverted: true },
    { label: "Goalkeeper Saves", key: "Goalkeeper Saves", inverted: false },
    { label: "Expected Goals", key: "expected_goals", inverted: false },
  ];

  return (
    <div className="space-y-5">
      {/* Team headers */}
      <div className="flex justify-between items-center px-1">
        <div className="flex items-center gap-2">
          {fixture.homeTeam.logo && <img src={fixture.homeTeam.logo} className="w-7 h-7 object-contain" loading="lazy" alt="" />}
          <span className="text-sm font-bold text-white">{fixture.homeTeam.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">{fixture.awayTeam.name}</span>
          {fixture.awayTeam.logo && <img src={fixture.awayTeam.logo} className="w-7 h-7 object-contain" loading="lazy" alt="" />}
        </div>
      </div>

      <div className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-5 space-y-4">
        {rows.map(({ label, key, inverted }) => (
          <StatBar
            key={key}
            label={label}
            home={getVal(homeTeamStats, key)}
            away={getVal(awayTeamStats, key)}
            homeLabel={getStr(homeTeamStats, key)}
            awayLabel={getStr(awayTeamStats, key)}
            inverted={inverted}
          />
        ))}
      </div>

    </div>
  );
}

// ── TAB: H2H ──────────────────────────────────────────────────────────────────
function safeDate(dateStr: string | null | undefined, fmt: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return format(d, fmt);
  } catch {
    return "—";
  }
}

function TabH2H({ h2h, fixture }: { h2h: any; fixture: Fixture }) {
  if (!h2h) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-600 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading head-to-head...</span>
      </div>
    );
  }

  const matches: any[] = Array.isArray(h2h.h2h) ? h2h.h2h : [];

  if (matches.length === 0) {
    return (
      <div className="p-10 text-center bg-[#09090b] border border-white/[0.06] rounded-2xl">
        <Swords className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
        <p className="text-zinc-500 text-sm font-medium">No recent head-to-head matches available.</p>
        <p className="text-zinc-700 text-xs mt-1">These teams may not have faced each other recently.</p>
      </div>
    );
  }

  const homeName = fixture.homeTeam.name;
  const awayName = fixture.awayTeam.name;

  const homeWins = matches.filter((m: any) => {
    const scoreHome = m.score?.home ?? null;
    const scoreAway = m.score?.away ?? null;
    if (scoreHome === null || scoreAway === null) return false;
    const homeIsHome = m.homeTeam?.name === homeName;
    return homeIsHome ? scoreHome > scoreAway : scoreAway > scoreHome;
  }).length;

  const awayWins = matches.filter((m: any) => {
    const scoreHome = m.score?.home ?? null;
    const scoreAway = m.score?.away ?? null;
    if (scoreHome === null || scoreAway === null) return false;
    const awayIsAway = m.awayTeam?.name === awayName;
    return awayIsAway ? scoreAway > scoreHome : scoreHome > scoreAway;
  }).length;

  const draws = matches.filter((m: any) => {
    const scoreHome = m.score?.home ?? null;
    const scoreAway = m.score?.away ?? null;
    return scoreHome !== null && scoreAway !== null && scoreHome === scoreAway;
  }).length;

  const total = Math.max(1, matches.length);

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-5">
        <p className="text-[10px] text-zinc-600 uppercase font-bold tracking-wider text-center mb-4">
          Last {matches.length} meetings
        </p>
        <div className="flex items-center justify-between mb-4">
          <div className="text-center flex-1">
            <div className="text-2xl font-display font-black text-primary">{homeWins}</div>
            <div className="text-[10px] text-zinc-500 uppercase font-semibold truncate px-1">{homeName}</div>
          </div>
          <div className="text-center px-4">
            <div className="text-2xl font-display font-black text-zinc-400">{draws}</div>
            <div className="text-[10px] text-zinc-500 uppercase font-semibold">Draw</div>
          </div>
          <div className="text-center flex-1">
            <div className="text-2xl font-display font-black text-blue-400">{awayWins}</div>
            <div className="text-[10px] text-zinc-500 uppercase font-semibold truncate px-1">{awayName}</div>
          </div>
        </div>
        <div className="h-2 flex rounded-full overflow-hidden bg-white/[0.05]">
          <div className="bg-primary h-full transition-all" style={{ width: `${(homeWins / total) * 100}%` }} />
          <div className="bg-zinc-600 h-full transition-all" style={{ width: `${(draws / total) * 100}%` }} />
          <div className="bg-blue-500 h-full transition-all" style={{ width: `${(awayWins / total) * 100}%` }} />
        </div>
      </div>

      {/* Match list */}
      <div className="space-y-2">
        {matches.map((m: any, i: number) => {
          const scoreHome = m.score?.home ?? null;
          const scoreAway = m.score?.away ?? null;
          const hasScore = scoreHome !== null && scoreAway !== null;
          const isDraw = hasScore && scoreHome === scoreAway;
          const homeWon = hasScore && (scoreHome as number) > (scoreAway as number);
          const leagueName = m.league?.name ?? null;

          return (
            <div key={i} className="bg-[#09090b] border border-white/[0.06] rounded-xl px-4 py-3">
              {leagueName && (
                <div className="flex items-center gap-1.5 mb-2">
                  {m.league?.logo && (
                    <img src={m.league.logo} alt="" className="w-3.5 h-3.5 object-contain opacity-60" loading="lazy" />
                  )}
                  <span className="text-[9px] text-zinc-600 truncate">{leagueName}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 text-right min-w-0">
                  <span className="text-xs font-semibold text-zinc-300 truncate block">{m.homeTeam?.name ?? "Home"}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {hasScore ? (
                    <>
                      <span className={cn("font-display font-black text-lg tabular-nums", homeWon ? "text-white" : isDraw ? "text-zinc-400" : "text-zinc-600")}>
                        {scoreHome}
                      </span>
                      <span className="text-zinc-700">–</span>
                      <span className={cn("font-display font-black text-lg tabular-nums", !homeWon && !isDraw ? "text-white" : isDraw ? "text-zinc-400" : "text-zinc-600")}>
                        {scoreAway}
                      </span>
                    </>
                  ) : (
                    <span className="text-zinc-700 text-sm font-bold px-3">vs</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-zinc-300 truncate block">{m.awayTeam?.name ?? "Away"}</span>
                </div>
              </div>
              <div className="text-center mt-1.5">
                <span className="text-[9px] text-zinc-700">{safeDate(m.date, "dd MMM yyyy")}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── TAB: Odds ─────────────────────────────────────────────────────────────────
function TabOdds({ oddsData, fixture, analysis }: { oddsData: any; fixture: Fixture; analysis: any }) {
  if (!oddsData) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-600 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading odds...
      </div>
    );
  }

  if (!oddsData.available || !oddsData.odds) {
    return (
      <div className="p-10 text-center text-zinc-600">
        <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Odds not available for this fixture.</p>
      </div>
    );
  }

  const { odds } = oddsData;
  const bookmakers = oddsData.bookmakers ?? [];

  const fairOdds = analysis?.probabilities
    ? {
        home: odds.home ? (1 / analysis.probabilities.homeWin).toFixed(2) : null,
        draw: odds.draw ? (1 / analysis.probabilities.draw).toFixed(2) : null,
        away: odds.away ? (1 / analysis.probabilities.awayWin).toFixed(2) : null,
        over25: odds.over25 ? (1 / analysis.probabilities.over25).toFixed(2) : null,
        bttsYes: odds.bttsYes ? (1 / analysis.probabilities.btts).toFixed(2) : null,
      }
    : null;

  const isValue = (odd: number | null, fair: string | null) => {
    if (!odd || !fair) return false;
    return odd > parseFloat(fair);
  };

  const markets = [
    { label: "Home Win (1)", odd: odds.home, fair: fairOdds?.home },
    { label: "Draw (X)", odd: odds.draw, fair: fairOdds?.draw },
    { label: "Away Win (2)", odd: odds.away, fair: fairOdds?.away },
    { label: "Over 2.5 Goals", odd: odds.over25, fair: fairOdds?.over25 },
    { label: "Under 2.5 Goals", odd: odds.under25, fair: null },
    { label: "BTTS Yes", odd: odds.bttsYes, fair: fairOdds?.bttsYes },
    { label: "BTTS No", odd: odds.bttsNo, fair: null },
  ];

  return (
    <div className="space-y-4">
      {bookmakers.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-zinc-500 pb-1">
          <Shield className="w-3 h-3" />
          Source: {bookmakers.join(", ")}
        </div>
      )}

      <div className="bg-[#09090b] border border-white/[0.07] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left px-4 py-3 text-xs text-zinc-500 font-semibold uppercase tracking-wider">Market</th>
              <th className="text-center px-4 py-3 text-xs text-zinc-500 font-semibold uppercase tracking-wider">Odds</th>
              <th className="text-center px-4 py-3 text-xs text-zinc-500 font-semibold uppercase tracking-wider">Fair</th>
              <th className="text-center px-4 py-3 text-xs text-zinc-500 font-semibold uppercase tracking-wider">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {markets.map(({ label, odd, fair }) => {
              const value = isValue(odd, fair);
              return (
                <tr key={label} className={cn("hover:bg-white/[0.02] transition-colors", value && "bg-orange-500/5")}>
                  <td className="px-4 py-3 font-medium text-zinc-300 text-xs">{label}</td>
                  <td className={cn("px-4 py-3 text-center font-bold tabular-nums", value ? "text-orange-400" : "text-white")}>
                    {odd != null ? odd.toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-zinc-600 text-xs tabular-nums">
                    {fair ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {value ? (
                      <span className="text-[10px] font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full">
                        🔥 VALUE
                      </span>
                    ) : (
                      <span className="text-zinc-700 text-[10px]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-zinc-700 text-center">
        Fair odds = 1 / AI Probability. Value bet = bookmaker odds &gt; fair odds.
      </p>
    </div>
  );
}

// ── TAB: AI Analysis ──────────────────────────────────────────────────────────
function TabAI({ fixture, analysis, oddsData, h2hData }: {
  fixture: Fixture; analysis: any; oddsData: any; h2hData: any;
}) {
  if (!analysis) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-600 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading AI analysis...</span>
      </div>
    );
  }

  const { probabilities, expectedGoals, homeStats, awayStats } = analysis;
  const odds = oddsData?.odds;

  const getConf = (p: number) => p >= 0.65 ? "High" : p >= 0.55 ? "Medium" : "Low";
  const getConfStyle = (p: number) =>
    p >= 0.65
      ? "bg-primary/10 text-primary border-primary/20"
      : p >= 0.55
      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
      : "bg-zinc-700/30 text-zinc-500 border-zinc-700/30";

  const allBets = [
    { market: "Match Result", bet: `${fixture.homeTeam.name} Win`, prob: probabilities.homeWin, markets: "1X2" },
    { market: "Match Result", bet: "Draw", prob: probabilities.draw, markets: "1X2" },
    { market: "Match Result", bet: `${fixture.awayTeam.name} Win`, prob: probabilities.awayWin, markets: "1X2" },
    { market: "Goals", bet: "Over 2.5 Goals", prob: probabilities.over25, markets: "O/U" },
    { market: "Goals", bet: "Under 2.5 Goals", prob: 1 - probabilities.over25, markets: "O/U" },
    { market: "Both Teams Score", bet: "BTTS Yes", prob: probabilities.btts, markets: "BTTS" },
    { market: "Both Teams Score", bet: "BTTS No", prob: 1 - probabilities.btts, markets: "BTTS" },
    { market: "Corners", bet: "Over 8.5 Corners", prob: probabilities.cornerOver9, markets: "Corners" },
    { market: "Cards", bet: "Over 3.5 Cards", prob: probabilities.over35cards ?? 0.35, markets: "Cards" },
  ];
  const topBets = [...allBets].sort((a, b) => b.prob - a.prob).slice(0, 3);

  // H2H summary
  const h2hMatches = h2hData?.h2h ?? [];
  const h2hHomeWins = h2hMatches.filter((m: any) => {
    const homeIsHome = m.homeTeam.name === fixture.homeTeam.name;
    return homeIsHome ? m.score.home > m.score.away : m.score.away > m.score.home;
  }).length;
  const h2hAwayWins = h2hMatches.filter((m: any) => {
    const awayIsAway = m.awayTeam.name === fixture.awayTeam.name;
    return awayIsAway ? m.score.away > m.score.home : m.score.home > m.score.away;
  }).length;
  const h2hDraws = h2hMatches.filter((m: any) => m.score.home === m.score.away).length;
  const h2hAvgGoals = h2hMatches.length > 0
    ? ((h2hMatches.reduce((sum: number, m: any) => sum + (m.score.home ?? 0) + (m.score.away ?? 0), 0)) / h2hMatches.length).toFixed(1)
    : null;

  // Key insights
  const insights: string[] = [];
  if (homeStats?.avgGoalsFor != null) {
    insights.push(`${fixture.homeTeam.name} averages ${homeStats.avgGoalsFor} goals per game (${homeStats.avgGoalsAgainst} conceded).`);
  }
  if (awayStats?.avgGoalsFor != null) {
    insights.push(`${fixture.awayTeam.name} averages ${awayStats.avgGoalsFor} goals per game (${awayStats.avgGoalsAgainst} conceded).`);
  }
  if (probabilities.over25 > 0.6) {
    insights.push(`High-scoring match likely — Over 2.5 probability at ${Math.round(probabilities.over25 * 100)}%.`);
  } else if (probabilities.over25 < 0.4) {
    insights.push(`Low-scoring match expected — Under 2.5 probability at ${Math.round((1 - probabilities.over25) * 100)}%.`);
  }
  if (probabilities.btts > 0.6) {
    insights.push(`Both teams expected to score — BTTS probability at ${Math.round(probabilities.btts * 100)}%.`);
  }
  if (homeStats?.cleanSheets > 3) {
    insights.push(`${fixture.homeTeam.name} has kept ${homeStats.cleanSheets} clean sheets this season.`);
  }
  if (h2hMatches.length > 0) {
    insights.push(`Last ${h2hMatches.length} H2H meetings: ${fixture.homeTeam.name} ${h2hHomeWins}W · ${h2hDraws}D · ${h2hAwayWins}W ${fixture.awayTeam.name}.`);
    if (h2hAvgGoals) insights.push(`Average ${h2hAvgGoals} goals per H2H game.`);
  }
  if (expectedGoals) {
    insights.push(`Poisson model predicts ${expectedGoals} combined expected goals.`);
  }

  // Final verdict
  const topResult = allBets
    .filter(b => b.markets === "1X2")
    .sort((a, b) => b.prob - a.prob)[0];
  const goalsCall = probabilities.over25 > 0.5 ? "Over 2.5" : "Under 2.5";
  const topOverall = allBets.sort((a, b) => b.prob - a.prob)[0];

  const probabilityRows = [
    { label: `${fixture.homeTeam.name} Win`, prob: probabilities.homeWin, color: "bg-primary" },
    { label: "Draw", prob: probabilities.draw, color: "bg-zinc-500" },
    { label: `${fixture.awayTeam.name} Win`, prob: probabilities.awayWin, color: "bg-blue-500" },
    { label: "Over 2.5 Goals", prob: probabilities.over25, color: "bg-amber-500" },
    { label: "Under 2.5 Goals", prob: 1 - probabilities.over25, color: "bg-zinc-600" },
    { label: "BTTS Yes", prob: probabilities.btts, color: "bg-emerald-500" },
    { label: "BTTS No", prob: 1 - probabilities.btts, color: "bg-zinc-700" },
    { label: "Over 8.5 Corners", prob: probabilities.cornerOver9, color: "bg-purple-500" },
    { label: "Over 3.5 Cards", prob: probabilities.over35cards ?? 0.35, color: "bg-rose-500" },
  ];

  return (
    <div className="space-y-4">
      {/* Engine banner */}
      <div className="bg-gradient-to-br from-primary/5 to-transparent border border-primary/10 rounded-2xl p-4">
        <p className="text-xs text-zinc-400 leading-relaxed">
          <strong className="text-primary">AI Probability Engine</strong> — Poisson distribution modelling with team attack/defense ratings,
          seasonal form analysis, and bookmaker odds comparison.
        </p>
      </div>

      {/* ── SECTION 1: Match Information ─────────────────────────── */}
      <div className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-4">
        <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Match Information</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between">
            <span className="text-zinc-600">League</span>
            <span className="text-zinc-300 font-medium text-right truncate max-w-[120px]">{fixture.league.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-600">Round</span>
            <span className="text-zinc-300 font-medium text-right truncate max-w-[120px]">{fixture.league.round}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-600">Date</span>
            <span className="text-zinc-300 font-medium">{safeDate(fixture.date, "dd MMM yyyy")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-600">Kick-off</span>
            <span className="text-zinc-300 font-medium">{safeDate(fixture.date, "HH:mm")}</span>
          </div>
          <div className="flex justify-between col-span-2">
            <span className="text-zinc-600">Expected Goals (xG)</span>
            <span className="text-primary font-bold">{expectedGoals}</span>
          </div>
        </div>
      </div>

      {/* ── SECTION 2: Team Form ─────────────────────────────────── */}
      {(homeStats || awayStats) && (
        <div className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-4">
          <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Team Form</h3>
          <div className="space-y-4">
            {[
              { team: fixture.homeTeam, stats: homeStats },
              { team: fixture.awayTeam, stats: awayStats },
            ].filter(({ stats }) => stats).map(({ team, stats }) => (
              <div key={team.id}>
                <div className="flex items-center gap-2 mb-2">
                  {team.logo && <img src={team.logo} alt="" loading="lazy" className="w-5 h-5 object-contain" />}
                  <span className="text-xs font-bold text-zinc-300">{team.name}</span>
                  <span className="ml-auto text-[10px] text-zinc-600">{stats.played} games</span>
                </div>
                <FormBadge form={(stats.form ?? "").slice(-5)} />
                <div className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
                  <div className="bg-primary/5 rounded-lg py-1.5">
                    <div className="font-black text-primary">{stats.wins}</div>
                    <div className="text-[9px] text-zinc-600">WIN</div>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg py-1.5">
                    <div className="font-black text-zinc-400">{stats.draws}</div>
                    <div className="text-[9px] text-zinc-600">DRAW</div>
                  </div>
                  <div className="bg-red-500/5 rounded-lg py-1.5">
                    <div className="font-black text-red-400">{stats.losses}</div>
                    <div className="text-[9px] text-zinc-600">LOSS</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SECTION 3: Statistical Performance ───────────────────── */}
      {(homeStats || awayStats) && (
        <div className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-4">
          <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Statistical Performance</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left py-1.5 text-zinc-600 font-medium w-24">Metric</th>
                  <th className="text-center py-1.5 text-primary font-semibold truncate max-w-[80px]">{fixture.homeTeam.name}</th>
                  <th className="text-center py-1.5 text-blue-400 font-semibold truncate max-w-[80px]">{fixture.awayTeam.name}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {[
                  { label: "Avg Goals Scored", h: homeStats?.avgGoalsFor, a: awayStats?.avgGoalsFor, fmt: (v: any) => v ?? "—" },
                  { label: "Avg Goals Conceded", h: homeStats?.avgGoalsAgainst, a: awayStats?.avgGoalsAgainst, fmt: (v: any) => v ?? "—" },
                  { label: "Over 2.5 %", h: homeStats?.over25Pct, a: awayStats?.over25Pct, fmt: (v: any) => v != null ? `${v}%` : "—" },
                  { label: "BTTS %", h: homeStats?.bttsPct, a: awayStats?.bttsPct, fmt: (v: any) => v != null ? `${v}%` : "—" },
                  { label: "Clean Sheets", h: homeStats?.cleanSheets, a: awayStats?.cleanSheets, fmt: (v: any) => v ?? "—" },
                  { label: "Failed to Score", h: homeStats?.failedToScore, a: awayStats?.failedToScore, fmt: (v: any) => v ?? "—" },
                ].map(({ label, h, a, fmt }) => (
                  <tr key={label}>
                    <td className="py-2 text-zinc-600">{label}</td>
                    <td className="py-2 text-center font-semibold text-zinc-200">{fmt(h)}</td>
                    <td className="py-2 text-center font-semibold text-zinc-200">{fmt(a)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SECTION 4: Head to Head ───────────────────────────────── */}
      {h2hMatches.length > 0 && (
        <div className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-4">
          <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3">
            Head to Head Analysis ({h2hMatches.length} matches)
          </h3>
          <div className="flex items-center justify-between text-center mb-3">
            <div>
              <div className="text-2xl font-display font-black text-primary">{h2hHomeWins}</div>
              <div className="text-[9px] text-zinc-600 uppercase font-semibold truncate max-w-[70px]">{fixture.homeTeam.name}</div>
            </div>
            <div>
              <div className="text-2xl font-display font-black text-zinc-400">{h2hDraws}</div>
              <div className="text-[9px] text-zinc-600 uppercase font-semibold">Draw</div>
            </div>
            <div>
              <div className="text-2xl font-display font-black text-blue-400">{h2hAwayWins}</div>
              <div className="text-[9px] text-zinc-600 uppercase font-semibold truncate max-w-[70px]">{fixture.awayTeam.name}</div>
            </div>
          </div>
          <div className="h-1.5 flex rounded-full overflow-hidden bg-white/[0.05]">
            <div className="bg-primary" style={{ width: `${h2hMatches.length ? (h2hHomeWins / h2hMatches.length) * 100 : 0}%` }} />
            <div className="bg-zinc-600" style={{ width: `${h2hMatches.length ? (h2hDraws / h2hMatches.length) * 100 : 0}%` }} />
            <div className="bg-blue-500" style={{ width: `${h2hMatches.length ? (h2hAwayWins / h2hMatches.length) * 100 : 0}%` }} />
          </div>
          {h2hAvgGoals && (
            <p className="text-[10px] text-zinc-600 text-center mt-2">Average {h2hAvgGoals} goals per meeting</p>
          )}
        </div>
      )}

      {/* ── SECTION 5: Probability Model ─────────────────────────── */}
      <div className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-4">
        <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Probability Model</h3>
        <div className="space-y-2.5">
          {probabilityRows.map(({ label, prob, color }) => (
            <div key={label} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">{label}</span>
                <div className="flex items-center gap-2.5">
                  <span className="text-zinc-600 text-[10px]">Fair: {(1 / prob).toFixed(2)}</span>
                  <span className="font-bold text-white w-10 text-right">{Math.round(prob * 100)}%</span>
                </div>
              </div>
              <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(prob * 100)}%` }}
                  transition={{ duration: 0.7, delay: 0.05 }}
                  className={cn("h-full rounded-full", color)}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="text-[9.5px] text-zinc-700 mt-3 text-center">
          Fair odds = 1 ÷ probability. Calculated by Poisson distribution model.
        </p>
      </div>

      {/* ── SECTION 6: Best Bets ─────────────────────────────────── */}
      <div className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-4">
        <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Best Bets</h3>
        <div className="space-y-3">
          {topBets.map(({ market, bet, prob, markets }, i) => (
            <div key={`${market}-${bet}`} className={cn(
              "rounded-xl p-3.5 border",
              i === 0 ? "bg-primary/5 border-primary/15" : "bg-white/[0.02] border-white/[0.06]"
            )}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-[9.5px] text-zinc-600 uppercase tracking-wider font-semibold">{market} · {markets}</div>
                  <div className={cn("text-sm font-bold mt-0.5", i === 0 ? "text-white" : "text-zinc-300")}>{bet}</div>
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", getConfStyle(prob))}>
                    {getConf(prob)}
                  </span>
                  <div className="text-[10px] text-zinc-600 mt-1">Fair: {(1 / prob).toFixed(2)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round(prob * 100)}%` }}
                    transition={{ duration: 0.8, delay: i * 0.12 }}
                    className={cn("h-full rounded-full", prob >= 0.65 ? "bg-primary" : prob >= 0.55 ? "bg-amber-500" : "bg-zinc-500")}
                  />
                </div>
                <span className="text-xs font-black text-white w-9 text-right tabular-nums">{Math.round(prob * 100)}%</span>
              </div>
              {odds && market === "Goals" && odds.over25 && (
                <div className="mt-1.5 text-[10px] text-zinc-600 flex items-center gap-1">
                  Bookmaker over 2.5: <span className="text-zinc-400 font-medium">{odds.over25.toFixed(2)}</span>
                  {odds.over25 > (1 / prob) && <span className="text-orange-400 font-bold">🔥 VALUE</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTION 7: Key Insights ──────────────────────────────── */}
      {insights.length > 0 && (
        <div className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-4">
          <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Key Insights</h3>
          <ul className="space-y-2">
            {insights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0 mt-1.5" />
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── SECTION 8: Final Verdict ─────────────────────────────── */}
      <div className="bg-gradient-to-br from-primary/8 via-transparent to-transparent border border-primary/15 rounded-2xl p-4">
        <h3 className="text-[11px] font-bold text-primary/80 uppercase tracking-wider mb-2">Final Verdict</h3>
        <p className="text-sm text-zinc-300 leading-relaxed">
          Based on the Poisson model, the strongest outcome is{" "}
          <strong className="text-white">{topResult.bet}</strong> ({Math.round(topResult.prob * 100)}%
          probability, fair odds {(1 / topResult.prob).toFixed(2)}). For goals,{" "}
          <strong className="text-white">{goalsCall} Goals</strong> is the statistical lean
          (xG: {expectedGoals}). The highest-confidence single bet is{" "}
          <strong className="text-primary">{topOverall.bet}</strong> at{" "}
          {Math.round(topOverall.prob * 100)}% — classified as{" "}
          <strong className={topOverall.prob >= 0.65 ? "text-primary" : topOverall.prob >= 0.55 ? "text-amber-400" : "text-zinc-400"}>
            {getConf(topOverall.prob)} confidence
          </strong>.
        </p>
        <p className="text-[10px] text-zinc-700 mt-3">
          ⚠️ Predictions are statistical estimates only. No outcome is guaranteed. Bet responsibly.
        </p>
      </div>
    </div>
  );
}

// ── TAB: Players (Squad + Performance Stats) ──────────────────────────────────
interface SquadPlayer {
  id: number;
  name: string;
  photo: string | null;
  age: number | null;
  position: string;
  nationality: string | null;
  appearances: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  keyPasses: number;
  dribbles: number;
  yellowCards: number;
  redCards: number;
  minutesPlayed: number;
  avgRating: number | null;
  avgGoals: number;
  avgAssists: number;
  avgShots: number;
  avgSOT: number;
  avgKeyPasses: number;
  hotPlayer: boolean;
  shotVolume: boolean;
  playmaker: boolean;
  cardRisk: boolean;
}
interface SquadTeam {
  team: { id: number; name: string; logo: string };
  players: SquadPlayer[];
}
interface PlayersData {
  available: boolean;
  teams: SquadTeam[];
}

type SortKey = "goals" | "shots" | "shotsOnTarget" | "assists" | "avgRating" | "appearances";

function squadPositionBadge(pos: string): { label: string; className: string } {
  const p = pos.toLowerCase();
  if (p.includes("goalkeeper")) return { label: "GK",  className: "bg-amber-500/20 text-amber-400 border-amber-500/20" };
  if (p.includes("defender"))   return { label: "DEF", className: "bg-blue-500/20  text-blue-400  border-blue-500/20" };
  if (p.includes("midfielder")) return { label: "MID", className: "bg-green-500/20 text-green-400 border-green-500/20" };
  return                               { label: "FWD", className: "bg-red-500/20   text-red-400   border-red-500/20" };
}

function RatingBar({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-[10px] text-zinc-700 italic">—</span>;
  const MIN = 5.5, MAX = 9.5;
  const pct = Math.min(100, Math.max(0, ((rating - MIN) / (MAX - MIN)) * 100));
  const color =
    rating >= 7.5 ? "bg-primary"     :
    rating >= 6.8 ? "bg-amber-400"   :
    rating >= 6.0 ? "bg-zinc-500"    : "bg-zinc-700";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn(
        "text-xs font-bold tabular-nums w-7 text-right flex-shrink-0",
        rating >= 7.5 ? "text-primary" : rating >= 6.8 ? "text-amber-400" : "text-zinc-500"
      )}>
        {rating.toFixed(1)}
      </span>
    </div>
  );
}

function PerformanceIndicators({ player }: { player: SquadPlayer }) {
  const indicators = [
    player.hotPlayer  && { icon: "🔥", label: "Hot",      title: "Scored in 2+ of last 5 games (season avg)" },
    player.shotVolume && { icon: "🎯", label: "Shooter",  title: "Averages 3+ shots per game" },
    player.playmaker  && { icon: "🧠", label: "Playmaker",title: "Averages 2+ key passes per game" },
    player.cardRisk   && { icon: "⚠",  label: "Card Risk",title: "High card rate (2+ cards per 5 games avg)" },
  ].filter(Boolean) as { icon: string; label: string; title: string }[];

  if (indicators.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {indicators.map((ind) => (
        <span key={ind.label} title={ind.title}
          className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-white/[0.05] text-zinc-400 border border-white/[0.06]">
          {ind.icon} {ind.label}
        </span>
      ))}
    </div>
  );
}

function PlayerStatChip({ label, value, highlight = false }: {
  label: string; value: string | number; highlight?: boolean;
}) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center rounded-lg px-2 py-1.5 min-w-[40px] border",
      highlight
        ? "bg-primary/10 border-primary/20 text-primary"
        : "bg-white/[0.03] border-white/[0.05] text-zinc-400"
    )}>
      <span className={cn("text-xs font-bold tabular-nums leading-none", highlight ? "text-primary" : "text-zinc-300")}>
        {value}
      </span>
      <span className="text-[8px] uppercase tracking-wide mt-0.5 opacity-70">{label}</span>
    </div>
  );
}

function SquadPlayerCard({ player }: { player: SquadPlayer }) {
  const badge = squadPositionBadge(player.position);
  const hasStats = player.appearances > 0;
  const totalCards = player.yellowCards + player.redCards;

  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-3 pt-3 pb-2">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/[0.06] border border-white/[0.08] overflow-hidden">
          {player.photo ? (
            <img src={player.photo} alt={player.name} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600">
              <Users className="w-4 h-4" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-white leading-tight truncate">{player.name}</span>
            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0", badge.className)}>
              {badge.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-600 mt-0.5 flex-wrap">
            {player.age !== null && <span>{player.age} yrs</span>}
            {player.nationality && <><span className="text-zinc-800">·</span><span>{player.nationality}</span></>}
            {player.minutesPlayed > 0 && <><span className="text-zinc-800">·</span><span>{player.minutesPlayed}'</span></>}
          </div>
          <PerformanceIndicators player={player} />
        </div>
      </div>

      {hasStats ? (
        <>
          {/* Stats chips */}
          <div className="flex items-center gap-1.5 px-3 pb-2.5 flex-wrap">
            <PlayerStatChip label="Apps"  value={player.appearances} />
            <PlayerStatChip label="Goals" value={player.goals}   highlight={player.goals > 0} />
            <PlayerStatChip label="Ast"   value={player.assists} highlight={player.assists > 0} />
            <PlayerStatChip label="Shots" value={player.shots}   highlight={player.shotVolume} />
            <PlayerStatChip label="SOT"   value={player.shotsOnTarget} highlight={player.shotsOnTarget > 0} />
            <PlayerStatChip label="KP"    value={player.keyPasses}    highlight={player.playmaker} />
            {totalCards > 0 && (
              <PlayerStatChip label="Cards" value={totalCards} highlight={player.cardRisk} />
            )}
          </div>

          {/* Averages row */}
          <div className="mx-3 mb-2.5 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
            <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider mb-1.5">Per-Game Averages</p>
            <div className="grid grid-cols-5 gap-1 text-center">
              {[
                { label: "Goals", value: player.avgGoals.toFixed(2),   highlight: player.avgGoals   > 0 },
                { label: "Ast",   value: player.avgAssists.toFixed(2), highlight: player.avgAssists > 0 },
                { label: "Shots", value: player.avgShots.toFixed(1),   highlight: player.shotVolume },
                { label: "SOT",   value: player.avgSOT.toFixed(1),     highlight: player.avgSOT     > 0 },
                { label: "KP",    value: player.avgKeyPasses.toFixed(1),highlight: player.playmaker },
              ].map(({ label, value, highlight }) => (
                <div key={label}>
                  <div className={cn("text-[11px] font-bold tabular-nums", highlight ? "text-primary" : "text-zinc-400")}>
                    {value}
                  </div>
                  <div className="text-[8px] text-zinc-700 uppercase">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Rating bar */}
          <div className="mx-3 mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider">Season Rating</span>
            </div>
            <RatingBar rating={player.avgRating} />
          </div>
        </>
      ) : (
        <p className="text-[10px] text-zinc-700 italic px-3 pb-3">Player performance data updating.</p>
      )}
    </div>
  );
}

function sortPlayers(players: SquadPlayer[], sortKey: SortKey): SquadPlayer[] {
  return [...players].sort((a, b) => {
    switch (sortKey) {
      case "goals":        return b.goals - a.goals;
      case "shots":        return b.shots - a.shots;
      case "shotsOnTarget":return b.shotsOnTarget - a.shotsOnTarget;
      case "assists":      return b.assists - a.assists;
      case "avgRating":    return (b.avgRating ?? 0) - (a.avgRating ?? 0);
      case "appearances":  return b.appearances - a.appearances;
    }
  });
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "appearances",   label: "Apps" },
  { key: "goals",         label: "Goals" },
  { key: "shots",         label: "Shots" },
  { key: "shotsOnTarget", label: "SOT" },
  { key: "assists",       label: "Assists" },
  { key: "avgRating",     label: "Rating" },
];

function TeamSquadSection({ teamData, sectionLabel, sortKey }: {
  teamData: SquadTeam;
  sectionLabel: string;
  sortKey: SortKey;
}) {
  const sorted = sortPlayers(teamData.players, sortKey);
  const positionGroups = ["Goalkeeper", "Defender", "Midfielder", "Forward"] as const;
  const byPosition = Object.fromEntries(
    positionGroups.map((pos) => [pos, sorted.filter((p) => p.position === pos)])
  ) as Record<string, SquadPlayer[]>;

  return (
    <div className="bg-[#09090b] border border-white/[0.07] rounded-2xl overflow-hidden">
      {/* Team header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
        {teamData.team.logo && (
          <img src={teamData.team.logo} alt={teamData.team.name} className="w-6 h-6 object-contain" loading="lazy" />
        )}
        <div>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{sectionLabel}</p>
          <p className="text-sm font-semibold text-white leading-tight">{teamData.team.name}</p>
        </div>
        <span className="ml-auto text-[10px] font-medium text-zinc-600 bg-white/[0.04] px-2 py-0.5 rounded-full">
          {teamData.players.length} players
        </span>
      </div>

      <div className="p-3 space-y-4">
        {teamData.players.length === 0 ? (
          <p className="text-zinc-600 text-xs text-center py-6">No squad data available</p>
        ) : (
          positionGroups.map((pos) => {
            const group = byPosition[pos] ?? [];
            if (group.length === 0) return null;
            const badge = squadPositionBadge(pos);
            return (
              <div key={pos} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider", badge.className)}>
                    {badge.label === "GK" ? "Goalkeepers" : badge.label === "DEF" ? "Defenders" : badge.label === "MID" ? "Midfielders" : "Forwards"}
                  </span>
                  <span className="text-[9px] text-zinc-700">{group.length}</span>
                </div>
                {group.map((p) => <SquadPlayerCard key={p.id} player={p} />)}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function TabPlayers({ data }: { data: PlayersData | undefined }) {
  const [sortKey, setSortKey] = useState<SortKey>("appearances");

  if (!data) {
    return (
      <div className="p-12 text-center bg-[#09090b] border border-white/[0.06] rounded-2xl">
        <Loader2 className="w-8 h-8 text-zinc-700 mx-auto mb-3 animate-spin" />
        <p className="text-zinc-500 text-sm font-medium">Loading player statistics...</p>
        <p className="text-zinc-600 text-xs mt-1">Match data has already loaded independently.</p>
      </div>
    );
  }

  if (!data.available || !Array.isArray(data.teams) || data.teams.length === 0) {
    return (
      <div className="p-12 text-center bg-[#09090b] border border-white/[0.06] rounded-2xl">
        <Users className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
        <p className="text-zinc-500 text-sm font-medium">Player statistics temporarily unavailable.</p>
        <p className="text-zinc-700 text-xs mt-1">Data will appear when the squad is loaded. Match results are unaffected.</p>
      </div>
    );
  }

  const sectionLabels = ["HOME SQUAD", "AWAY SQUAD"];

  return (
    <div className="space-y-5">
      {/* Sort Controls */}
      <div className="bg-[#09090b] border border-white/[0.07] rounded-xl p-3">
        <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider mb-2">Sort players by</p>
        <div className="flex flex-wrap gap-1.5">
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className={cn(
                "text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-colors",
                sortKey === key
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "bg-white/[0.03] border-white/[0.06] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06]"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Indicators legend */}
      <div className="flex flex-wrap gap-2 px-1">
        {[
          { icon: "🔥", label: "Hot — scoring form" },
          { icon: "🎯", label: "Shooter — 3+ shots/game" },
          { icon: "🧠", label: "Playmaker — 2+ KP/game" },
          { icon: "⚠",  label: "Card Risk" },
        ].map(({ icon, label }) => (
          <span key={label} className="text-[9px] text-zinc-600 flex items-center gap-1">
            {icon} <span>{label}</span>
          </span>
        ))}
      </div>

      {/* Team sections */}
      {data.teams.map((teamData, idx) => (
        <TeamSquadSection
          key={teamData.team.id}
          teamData={teamData}
          sectionLabel={sectionLabels[idx] ?? "SQUAD"}
          sortKey={sortKey}
        />
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function FixtureDetail() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState("overview");

  const {
    data: fixtureRaw,
    isLoading: fixtureLoading,
    isFetching: fixtureFetching,
    failureCount,
  } = useQuery({
    queryKey: ["fixture", id],
    queryFn: async () => {
      try {
        const res = await fetch(`${BASE}/api/fixture/${id}`);
        if (!res.ok) return { found: false, reason: "http_error" };
        return res.json();
      } catch {
        return { found: false, reason: "network_error" };
      }
    },
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchInterval: (q) => {
      const d = q.state.data as any;
      if (!d || d.found === false) return 10 * 1000; // retry every 10s when unavailable
      return 30 * 1000; // normal refresh
    },
    retry: 2,
    retryDelay: 3000,
  });

  // Separate the "found" flag from the fixture data
  const fixture = fixtureRaw?.found !== false ? (fixtureRaw as unknown as Fixture) : undefined;
  const fixtureUnavailable = fixtureRaw?.found === false;

  const { data: analysis } = useQuery({
    queryKey: ["fixture-analysis", id],
    queryFn: async () => {
      try {
        const res = await fetch(`${BASE}/api/fixture/${id}/analysis`);
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    enabled: !!fixture,
    staleTime: 10 * 60 * 1000,
  });

  const { data: statsData } = useQuery({
    queryKey: ["fixture-stats", id],
    queryFn: async () => {
      try {
        const res = await fetch(`${BASE}/api/fixture/${id}/stats`);
        if (!res.ok) return { stats: [], available: false };
        return res.json();
      } catch {
        return { stats: [], available: false };
      }
    },
    enabled: activeTab === "stats" && !!fixture,
    staleTime: 5 * 60 * 1000,
  });

  const { data: h2hData } = useQuery({
    queryKey: ["fixture-h2h", id],
    queryFn: async () => {
      try {
        const res = await fetch(`${BASE}/api/fixture/${id}/h2h`);
        if (!res.ok) return { h2h: [], available: false };
        return res.json();
      } catch {
        return { h2h: [], available: false };
      }
    },
    enabled: (activeTab === "h2h" || activeTab === "ai") && !!fixture,
    staleTime: 10 * 60 * 1000,
  });

  const { data: oddsData } = useQuery({
    queryKey: ["fixture-odds", id],
    queryFn: async () => {
      try {
        const res = await fetch(`${BASE}/api/fixture/${id}/odds`);
        if (!res.ok) return { available: false, odds: null };
        return res.json();
      } catch {
        return { available: false, odds: null };
      }
    },
    enabled: (activeTab === "odds" || activeTab === "ai" || activeTab === "overview") && !!fixture,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: playersData } = useQuery<PlayersData>({
    queryKey: ["fixture-squad", id],
    queryFn: async () => {
      try {
        const res = await fetch(`${BASE}/api/fixture/${id}/squad`, {
          signal: AbortSignal.timeout(10_000), // 10 s — never blocks match UI
        });
        if (!res.ok) return { available: false, teams: [] };
        const json = await res.json();
        return json;
      } catch {
        return { available: false, teams: [] };
      }
    },
    enabled: activeTab === "players" && !!fixture,
    staleTime: 6 * 60 * 60 * 1000,   // 6 h — match backend cache
    gcTime:   25 * 60 * 60 * 1000,
    retry: 0,                          // never retry — protect API quota
  });

  if (fixtureLoading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-zinc-400 text-sm font-medium">Loading match statistics...</p>
        </div>
        <div className="space-y-4 animate-pulse mt-8">
          <div className="h-48 bg-white/[0.04] rounded-2xl" />
          <div className="h-12 bg-white/[0.03] rounded-xl" />
          <div className="h-64 bg-white/[0.04] rounded-2xl" />
        </div>
      </div>
    );
  }

  if (fixtureUnavailable || !fixture) {
    const isRetrying = fixtureFetching && failureCount > 0;
    return (
      <div className="container mx-auto px-4 py-24 text-center max-w-3xl">
        <Globe className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">
          {isRetrying ? "Fetching match data..." : "Match data temporarily unavailable"}
        </h2>
        <p className="text-zinc-500 mb-2">
          {isRetrying
            ? "Connecting to data source, please wait..."
            : "Match data is temporarily unavailable. Please refresh."}
        </p>
        {isRetrying ? (
          <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto mt-4" />
        ) : (
          <div className="flex items-center justify-center gap-4 mt-6">
            <button
              onClick={() => window.location.reload()}
              className="text-sm font-semibold text-primary border border-primary/30 px-5 py-2 rounded-full hover:bg-primary/10 transition-colors"
            >
              Refresh page
            </button>
            <Link href="/" className="text-zinc-500 hover:text-white transition-colors inline-flex items-center gap-1 text-sm">
              <ArrowLeft className="w-4 h-4" /> Back to matches
            </Link>
          </div>
        )}
      </div>
    );
  }

  const isLive = ["1H", "2H", "ET", "HT", "P"].includes(fixture.status.short);
  const isFinished = ["FT", "AET", "PEN"].includes(fixture.status.short);
  const hasScore = fixture.score.home !== null && fixture.score.away !== null;

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl">
      {/* Back */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-zinc-500 hover:text-white transition-colors mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Matches
      </Link>

      {/* Match Header Card */}
      <div className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-6 mb-6 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-primary/40 via-blue-500/40 to-primary/40" />

        {/* League */}
        <div className="flex items-center justify-center gap-2 mb-5">
          {fixture.league.logo && (
            <img src={fixture.league.logo} alt="" className="w-5 h-5 object-contain" loading="lazy" />
          )}
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            {fixture.league.name} · {fixture.league.round}
          </span>
        </div>

        {/* Teams & Score */}
        <div className="flex items-center justify-between gap-4">
          {/* Home team */}
          <div className="flex flex-col items-center gap-3 flex-1 min-w-0">
            <div className={cn(
              "w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center",
              fixture.homeTeam.winner === true && "ring-2 ring-primary/50"
            )}>
              {fixture.homeTeam.logo ? (
                <img src={fixture.homeTeam.logo} alt={fixture.homeTeam.name} className="w-11 h-11 md:w-14 md:h-14 object-contain" loading="lazy" />
              ) : <Trophy className="w-7 h-7 text-zinc-600" />}
            </div>
            <span className="text-sm md:text-base font-bold text-center text-white leading-tight line-clamp-2 px-1">
              {fixture.homeTeam.name}
            </span>
          </div>

          {/* Score / VS / Time */}
          <div className="flex flex-col items-center gap-2 flex-shrink-0">
            {hasScore ? (
              <>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "font-display font-black text-4xl md:text-5xl tabular-nums leading-none",
                    fixture.homeTeam.winner === true ? "text-white" : "text-zinc-300"
                  )}>
                    {fixture.score.home}
                  </span>
                  <span className="text-zinc-700 font-bold text-2xl">–</span>
                  <span className={cn(
                    "font-display font-black text-4xl md:text-5xl tabular-nums leading-none",
                    fixture.awayTeam.winner === true ? "text-white" : "text-zinc-300"
                  )}>
                    {fixture.score.away}
                  </span>
                </div>
                {isLive && (
                  <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    {fixture.status.elapsed ? `${fixture.status.elapsed}'` : "LIVE"}
                  </span>
                )}
                {isFinished && (
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-zinc-700 text-zinc-300">FT</span>
                )}
              </>
            ) : (
              <div className="text-center">
                <div className="text-zinc-600 font-bold text-sm">VS</div>
                <div className="flex items-center gap-1 mt-1 text-xs text-zinc-500">
                  <Clock className="w-3 h-3" />
                  {safeDate(fixture.date, "HH:mm")}
                </div>
              </div>
            )}
          </div>

          {/* Away team */}
          <div className="flex flex-col items-center gap-3 flex-1 min-w-0">
            <div className={cn(
              "w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center",
              fixture.awayTeam.winner === true && "ring-2 ring-blue-500/50"
            )}>
              {fixture.awayTeam.logo ? (
                <img src={fixture.awayTeam.logo} alt={fixture.awayTeam.name} className="w-11 h-11 md:w-14 md:h-14 object-contain" loading="lazy" />
              ) : <Trophy className="w-7 h-7 text-zinc-600" />}
            </div>
            <span className="text-sm md:text-base font-bold text-center text-white leading-tight line-clamp-2 px-1">
              {fixture.awayTeam.name}
            </span>
          </div>
        </div>

        {/* Date */}
        <div className="text-center mt-4">
          <span className="text-xs text-zinc-700">
            {safeDate(fixture.date, "EEEE, dd MMM yyyy")}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto gap-1 mb-5 pb-1 scrollbar-none">
        {TABS.map(({ id: tabId, label, icon: Icon }) => (
          <button
            key={tabId}
            onClick={() => setActiveTab(tabId)}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0",
              activeTab === tabId
                ? "bg-primary/15 text-primary border border-primary/25"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05] border border-transparent"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content — single child per motion.div prevents React 19 insertBefore crash */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {(() => {
            switch (activeTab) {
              case "overview": return <TabOverview fixture={fixture} analysis={analysis} />;
              case "stats":    return <TabTeamStats fixture={fixture} stats={statsData} />;
              case "h2h":      return <TabH2H h2h={h2hData} fixture={fixture} />;
              case "players":  return <TabPlayers data={playersData} />;
              case "odds":     return <TabOdds oddsData={oddsData} fixture={fixture} analysis={analysis} />;
              case "ai":       return <TabAI fixture={fixture} analysis={analysis} oddsData={oddsData} h2hData={h2hData} />;
              default:         return <TabOverview fixture={fixture} analysis={analysis} />;
            }
          })()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
