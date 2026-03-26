import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Radio, ChevronDown, ChevronUp } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ──────────────────────────────────────────────────────────────────────

interface TeamStats {
  team: string;
  shots: number;
  shotsOnTarget: number;
  possession: string;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
}

interface MatchStats {
  home: TeamStats;
  away: TeamStats;
}

interface LiveMatch {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo: string;
  awayTeamLogo: string;
  homeScore: number;
  awayScore: number;
  league: string;
  leagueLogo: string;
  status: string;
  elapsed: number | null;
  stats: MatchStats | null;
}

interface LiveData {
  available: boolean;
  count: number;
  matches: LiveMatch[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function statusLabel(status: string, elapsed: number | null): string {
  if (status === "HT") return "Intervalo";
  if (status === "ET") return "Prorrogação";
  if (status === "P")  return "Pênaltis";
  if (elapsed !== null) return `${elapsed}'`;
  return status;
}

function PossessionBar({ home, away }: { home: string; away: string }) {
  const h = parseInt(home) || 50;
  const a = parseInt(away) || 50;
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className="text-white/50 tabular-nums w-7 text-right">{home}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.08] overflow-hidden flex">
        <div className="h-full bg-emerald-500/70 rounded-l-full transition-all" style={{ width: `${h}%` }} />
        <div className="h-full bg-blue-500/70 rounded-r-full transition-all" style={{ width: `${a}%` }} />
      </div>
      <span className="text-white/50 tabular-nums w-7">{away}</span>
    </div>
  );
}

function StatRow({ label, home, away }: { label: string; home: number | string; away: number | string }) {
  return (
    <div className="flex items-center justify-between text-[10px] text-white/40">
      <span className="tabular-nums text-white/70 font-medium w-8 text-center">{home}</span>
      <span className="flex-1 text-center">{label}</span>
      <span className="tabular-nums text-white/70 font-medium w-8 text-center">{away}</span>
    </div>
  );
}

// ── Match Card ─────────────────────────────────────────────────────────────────

function LiveMatchCard({ match, idx }: { match: LiveMatch; idx: number }) {
  const [expanded, setExpanded] = useState(false);
  const label = statusLabel(match.status, match.elapsed);
  const hasStats = !!match.stats;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.05 }}
      className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden"
    >
      {/* Header row */}
      <div
        className={`p-3 ${hasStats ? "cursor-pointer hover:bg-white/[0.03] active:bg-white/[0.05]" : ""} transition-colors`}
        onClick={() => hasStats && setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          {/* League logo */}
          {match.leagueLogo && (
            <img src={match.leagueLogo} alt={match.league} className="w-4 h-4 object-contain opacity-60 flex-shrink-0" loading="lazy" />
          )}
          {/* Minute badge */}
          <span className="flex-shrink-0 text-[10px] font-black text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-1.5 py-0.5 tabular-nums leading-none">
            {label}
          </span>

          {/* Match */}
          <div className="flex-1 flex items-center justify-between min-w-0 gap-1">
            <div className="flex items-center gap-1 min-w-0">
              {match.homeTeamLogo && (
                <img src={match.homeTeamLogo} alt="" className="w-4 h-4 object-contain flex-shrink-0" loading="lazy" />
              )}
              <span className="text-xs font-semibold text-white truncate">{match.homeTeam}</span>
            </div>

            {/* Score */}
            <span className="flex-shrink-0 text-sm font-black text-white tabular-nums px-2">
              {match.homeScore} – {match.awayScore}
            </span>

            <div className="flex items-center gap-1 min-w-0 justify-end">
              <span className="text-xs font-semibold text-white truncate text-right">{match.awayTeam}</span>
              {match.awayTeamLogo && (
                <img src={match.awayTeamLogo} alt="" className="w-4 h-4 object-contain flex-shrink-0" loading="lazy" />
              )}
            </div>
          </div>

          {hasStats && (
            <span className="text-white/20 flex-shrink-0 ml-1">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
          )}
        </div>
      </div>

      {/* Expandable stats — no AnimatePresence (React 19 safety) */}
      {expanded && hasStats && match.stats && (
        <div className="overflow-hidden border-t border-white/[0.05]">
          <div className="px-3 pb-3 pt-2 space-y-1.5">
            {/* Team name headers */}
            <div className="flex items-center justify-between text-[9px] text-white/25 font-semibold mb-2">
              <span className="truncate max-w-[80px]">{match.stats.home.team || match.homeTeam}</span>
              <span className="text-center flex-1">Estatísticas</span>
              <span className="truncate max-w-[80px] text-right">{match.stats.away.team || match.awayTeam}</span>
            </div>

            <PossessionBar home={match.stats.home.possession} away={match.stats.away.possession} />
            <StatRow label="Finalizações" home={match.stats.home.shots} away={match.stats.away.shots} />
            <StatRow label="No alvo" home={match.stats.home.shotsOnTarget} away={match.stats.away.shotsOnTarget} />
            <StatRow label="Escanteios" home={match.stats.home.corners} away={match.stats.away.corners} />
            <StatRow label="Faltas" home={match.stats.home.fouls} away={match.stats.away.fouls} />
            <StatRow label="🟨" home={match.stats.home.yellowCards} away={match.stats.away.yellowCards} />
            {(match.stats.home.redCards > 0 || match.stats.away.redCards > 0) && (
              <StatRow label="🟥" home={match.stats.home.redCards} away={match.stats.away.redCards} />
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── Main Section ──────────────────────────────────────────────────────────────

export default function LiveMatchesSection() {
  const { data, isLoading } = useQuery<LiveData>({
    queryKey: ["live", "matches"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/live/matches`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 55 * 1000,          // slightly under 60s to ensure fresh refetch
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,    // poll every 60 s (matches live engine cadence)
    refetchIntervalInBackground: true,
    retry: 1,
  });

  // Don't show the section at all while loading or when no live matches
  if (isLoading || !data?.available || !data.matches.length) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="relative w-7 h-7 rounded-lg bg-red-500/15 flex items-center justify-center flex-shrink-0">
          <Radio className="w-3.5 h-3.5 text-red-400" />
          {/* Pulsing dot */}
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 animate-ping opacity-75" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500" />
        </div>
        <h2 className="text-base font-bold text-white">Ao Vivo</h2>
        <span className="text-xs bg-red-500/15 text-red-400 border border-red-500/20 rounded-full px-2 py-0.5 font-semibold tabular-nums">
          {data.count} {data.count === 1 ? "jogo" : "jogos"}
        </span>
        <span className="text-[10px] text-white/20 ml-auto">Toque para ver stats</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {data.matches.map((match, i) => (
          <LiveMatchCard key={match.fixtureId} match={match} idx={i} />
        ))}
      </div>
    </motion.div>
  );
}
