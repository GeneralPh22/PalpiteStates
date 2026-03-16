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
                <div className="text-[10px] text-zinc-600">
                  Goals: {stats.goalsFor} scored · {stats.goalsAgainst} conceded
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
function TabH2H({ h2h, fixture }: { h2h: any; fixture: Fixture }) {
  if (!h2h) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-600 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading head-to-head...
      </div>
    );
  }

  const matches = h2h.h2h ?? [];
  if (matches.length === 0) {
    return (
      <div className="p-10 text-center text-zinc-600">
        No head-to-head records found.
      </div>
    );
  }

  const homeWins = matches.filter((m: any) => {
    const homeIsHome = m.homeTeam.name === fixture.homeTeam.name;
    if (homeIsHome) return m.score.home > m.score.away;
    return m.score.away > m.score.home;
  }).length;
  const awayWins = matches.filter((m: any) => {
    const awayIsAway = m.awayTeam.name === fixture.awayTeam.name;
    if (awayIsAway) return m.score.away > m.score.home;
    return m.score.home > m.score.away;
  }).length;
  const draws = matches.filter((m: any) => m.score.home === m.score.away).length;

  return (
    <div className="space-y-5">
      {/* H2H Summary */}
      <div className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-center flex-1">
            <div className="text-2xl font-display font-black text-primary">{homeWins}</div>
            <div className="text-[10px] text-zinc-500 uppercase font-semibold truncate">{fixture.homeTeam.name}</div>
          </div>
          <div className="text-center px-4">
            <div className="text-2xl font-display font-black text-zinc-400">{draws}</div>
            <div className="text-[10px] text-zinc-500 uppercase font-semibold">Draw</div>
          </div>
          <div className="text-center flex-1">
            <div className="text-2xl font-display font-black text-blue-400">{awayWins}</div>
            <div className="text-[10px] text-zinc-500 uppercase font-semibold truncate">{fixture.awayTeam.name}</div>
          </div>
        </div>
        <div className="h-2 flex rounded-full overflow-hidden bg-white/[0.05]">
          <div className="bg-primary h-full transition-all" style={{ width: `${(homeWins / matches.length) * 100}%` }} />
          <div className="bg-zinc-600 h-full transition-all" style={{ width: `${(draws / matches.length) * 100}%` }} />
          <div className="bg-blue-500 h-full transition-all" style={{ width: `${(awayWins / matches.length) * 100}%` }} />
        </div>
      </div>

      {/* Match list */}
      <div className="space-y-3">
        {matches.map((m: any, i: number) => {
          const isDraw = m.score.home === m.score.away;
          const homeWon = m.score.home > m.score.away;
          return (
            <div key={i} className="bg-[#09090b] border border-white/[0.06] rounded-xl px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 text-right">
                  <span className="text-xs font-semibold text-zinc-300 truncate block">{m.homeTeam.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={cn("font-display font-black text-lg tabular-nums", homeWon ? "text-white" : isDraw ? "text-zinc-400" : "text-zinc-600")}>
                    {m.score.home}
                  </span>
                  <span className="text-zinc-700">–</span>
                  <span className={cn("font-display font-black text-lg tabular-nums", !homeWon && !isDraw ? "text-white" : isDraw ? "text-zinc-400" : "text-zinc-600")}>
                    {m.score.away}
                  </span>
                </div>
                <div className="flex-1">
                  <span className="text-xs font-semibold text-zinc-300 truncate block">{m.awayTeam.name}</span>
                </div>
              </div>
              <div className="text-center mt-1">
                <span className="text-[9px] text-zinc-700">{format(new Date(m.date), "dd MMM yyyy")}</span>
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
function TabAI({ fixture, analysis, oddsData }: { fixture: Fixture; analysis: any; oddsData: any }) {
  if (!analysis) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-600 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const { probabilities } = analysis;
  const odds = oddsData?.odds;

  const suggestions = [
    {
      market: "Match Result (1X2)",
      bet: probabilities.homeWin > probabilities.awayWin
        ? `${fixture.homeTeam.name} Win`
        : probabilities.awayWin > probabilities.homeWin
        ? `${fixture.awayTeam.name} Win`
        : "Draw",
      prob: Math.max(probabilities.homeWin, probabilities.awayWin, probabilities.draw),
    },
    {
      market: "Goals",
      bet: probabilities.over25 > 0.5 ? "Over 2.5 Goals" : "Under 2.5 Goals",
      prob: probabilities.over25 > 0.5 ? probabilities.over25 : 1 - probabilities.over25,
    },
    {
      market: "Both Teams to Score",
      bet: probabilities.btts > 0.5 ? "BTTS Yes" : "BTTS No",
      prob: probabilities.btts > 0.5 ? probabilities.btts : 1 - probabilities.btts,
    },
    {
      market: "Corners",
      bet: "Over 8.5 Corners",
      prob: probabilities.cornerOver9,
    },
  ].sort((a, b) => b.prob - a.prob);

  const getConf = (p: number) => p >= 0.65 ? "High" : p >= 0.5 ? "Medium" : "Low";
  const getConfStyle = (p: number) =>
    p >= 0.65
      ? "bg-primary/10 text-primary border-primary/20"
      : p >= 0.5
      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
      : "bg-zinc-700/30 text-zinc-500 border-zinc-700/30";

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-primary/5 to-transparent border border-primary/10 rounded-2xl p-4">
        <p className="text-xs text-zinc-400 leading-relaxed">
          <strong className="text-primary">AI Probability Engine</strong> — Probabilities calculated using Poisson distribution modelling,
          team form analysis, attack/defense ratings, and bookmaker odds comparison.
        </p>
      </div>

      {suggestions.map(({ market, bet, prob }) => (
        <div key={market} className="bg-[#09090b] border border-white/[0.07] rounded-xl p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold mb-1">{market}</div>
              <div className="text-sm font-bold text-white">{bet}</div>
            </div>
            <span className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full border flex-shrink-0", getConfStyle(prob))}>
              {getConf(prob)} confidence
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">AI Probability</span>
              <span className="font-bold text-white">{Math.round(prob * 100)}%</span>
            </div>
            <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.round(prob * 100)}%` }}
                transition={{ duration: 0.8, delay: 0.15 }}
                className={cn("h-full rounded-full", prob >= 0.65 ? "bg-primary" : prob >= 0.5 ? "bg-amber-500" : "bg-zinc-500")}
              />
            </div>
            {odds && (
              <div className="flex justify-between text-[10px] text-zinc-600 pt-0.5">
                <span>
                  Fair odds:{" "}
                  <span className="text-zinc-400 font-medium">{(1 / prob).toFixed(2)}</span>
                </span>
                {market === "Goals" && odds.over25 && (
                  <span>
                    Bookmaker: <span className="text-zinc-400 font-medium">{odds.over25.toFixed(2)}</span>
                    {odds.over25 > 1 / prob && " 🔥"}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── TAB: Players ──────────────────────────────────────────────────────────────
function TabPlayers() {
  return (
    <div className="space-y-4">
      <div className="p-12 text-center bg-[#09090b] border border-white/[0.06] rounded-2xl">
        <Users className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
        <p className="text-zinc-500 text-sm font-medium">Player statistics not available</p>
        <p className="text-zinc-700 text-xs mt-1">Per-match player data requires a premium API plan. Visit Top Players for season rankings.</p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function FixtureDetail() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: fixture, isLoading: fixtureLoading, error: fixtureError } = useQuery<Fixture>({
    queryKey: ["fixture", id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/fixture/${id}`);
      if (!res.ok) throw new Error("Fixture not found");
      return res.json();
    },
    enabled: !!id,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  const { data: analysis } = useQuery({
    queryKey: ["fixture-analysis", id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/fixture/${id}/analysis`);
      if (!res.ok) throw new Error("Analysis not available");
      return res.json();
    },
    enabled: !!fixture,
    staleTime: 10 * 60 * 1000,
  });

  const { data: statsData } = useQuery({
    queryKey: ["fixture-stats", id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/fixture/${id}/stats`);
      if (!res.ok) throw new Error("Stats not available");
      return res.json();
    },
    enabled: activeTab === "stats" && !!fixture,
    staleTime: 5 * 60 * 1000,
  });

  const { data: h2hData } = useQuery({
    queryKey: ["fixture-h2h", id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/fixture/${id}/h2h`);
      if (!res.ok) throw new Error("H2H not available");
      return res.json();
    },
    enabled: activeTab === "h2h" && !!fixture,
    staleTime: 10 * 60 * 1000,
  });

  const { data: oddsData } = useQuery({
    queryKey: ["fixture-odds", id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/fixture/${id}/odds`);
      if (!res.ok) throw new Error("Odds not available");
      return res.json();
    },
    enabled: (activeTab === "odds" || activeTab === "ai" || activeTab === "overview") && !!fixture,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  if (fixtureLoading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-3xl animate-pulse">
        <div className="h-8 bg-card rounded-lg w-32 mb-8" />
        <div className="h-48 bg-card rounded-2xl mb-6" />
        <div className="h-12 bg-card rounded-xl mb-6" />
        <div className="h-80 bg-card rounded-2xl" />
      </div>
    );
  }

  if (fixtureError || !fixture) {
    return (
      <div className="container mx-auto px-4 py-24 text-center max-w-3xl">
        <Globe className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Fixture Not Found</h2>
        <p className="text-zinc-500 mb-6">This fixture doesn't exist or is no longer available.</p>
        <Link href="/" className="text-primary hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
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
                  {format(new Date(fixture.date), "HH:mm")}
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
            {format(new Date(fixture.date), "EEEE, dd MMM yyyy")}
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

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "overview" && <TabOverview fixture={fixture} analysis={analysis} />}
          {activeTab === "stats" && <TabTeamStats fixture={fixture} stats={statsData} />}
          {activeTab === "h2h" && <TabH2H h2h={h2hData} fixture={fixture} />}
          {activeTab === "players" && <TabPlayers />}
          {activeTab === "odds" && <TabOdds oddsData={oddsData} fixture={fixture} analysis={analysis} />}
          {activeTab === "ai" && <TabAI fixture={fixture} analysis={analysis} oddsData={oddsData} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
