import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Square, Clock, RefreshCw } from "lucide-react";
import { Link } from "wouter";

interface CardMatch {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo: string;
  awayTeamLogo: string;
  league: string;
  leagueLogo: string;
  kickoff: string;
  homeAvg: number;
  awayAvg: number;
  totalAvg: number;
  over35Pct: number;
  over45Pct: number;
}

interface ScannerData {
  available: boolean;
  matches: CardMatch[];
  scannedAt?: string;
  cached?: boolean;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function CardBar({ value }: { value: number }) {
  const pct = Math.min(100, value);
  const color = value >= 70 ? "bg-red-400" : value >= 55 ? "bg-red-500" : "bg-red-700";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-sm font-bold tabular-nums w-10 text-right ${value >= 70 ? "text-red-300" : "text-white/70"}`}>
        {value}%
      </span>
    </div>
  );
}

function MatchCard({ match, idx }: { match: CardMatch; idx: number }) {
  const kickoffTime = match.kickoff
    ? new Date(match.kickoff).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.06 }}
      className="bg-white/[0.03] rounded-xl border border-white/[0.07] hover:border-red-500/30 transition-colors p-3"
    >
      <div className="flex items-center gap-1.5 mb-2">
        {match.leagueLogo && (
          <img src={match.leagueLogo} alt={match.league} className="w-3.5 h-3.5 object-contain opacity-60" />
        )}
        <span className="text-[10px] text-white/40 uppercase tracking-wide truncate">{match.league}</span>
        {kickoffTime && (
          <div className="ml-auto flex items-center gap-0.5 text-[10px] text-white/30">
            <Clock className="w-2.5 h-2.5" />
            {kickoffTime}
          </div>
        )}
      </div>

      <Link href={`/fixture/${match.fixtureId}`}>
        <div className="flex items-center gap-1.5 mb-2.5 cursor-pointer group">
          <img src={match.homeTeamLogo} alt={match.homeTeam} className="w-4 h-4 object-contain" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          <span className="text-sm font-semibold text-white group-hover:text-red-400 transition-colors truncate">{match.homeTeam}</span>
          <span className="text-white/25 text-xs flex-shrink-0">vs</span>
          <img src={match.awayTeamLogo} alt={match.awayTeam} className="w-4 h-4 object-contain" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          <span className="text-sm font-semibold text-white group-hover:text-red-400 transition-colors truncate">{match.awayTeam}</span>
        </div>
      </Link>

      <div className="flex items-center gap-2 mb-2.5 text-[11px] text-white/40">
        <span>Média cartões:</span>
        <span className="text-white/70 font-medium">{match.homeAvg.toFixed(1)} + {match.awayAvg.toFixed(1)}</span>
        <span className="text-red-400 font-semibold ml-auto">= {match.totalAvg.toFixed(1)} total</span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/40 w-24 flex-shrink-0">Over 3.5</span>
          <CardBar value={match.over35Pct} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/40 w-24 flex-shrink-0">Over 4.5</span>
          <CardBar value={match.over45Pct} />
        </div>
      </div>
    </motion.div>
  );
}

export default function CardScannerSection() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<ScannerData>({
    queryKey: ["scanner-cards"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/scanner/cards`);
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
    staleTime: 19 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-lg bg-red-500/20 flex items-center justify-center">
            <Square className="w-3.5 h-3.5 text-red-400" />
          </div>
          <div className="h-4 w-44 bg-white/10 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2].map(i => <div key={i} className="h-28 bg-white/[0.03] rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (isError || !data?.available || !data.matches?.length) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-red-500/20 flex items-center justify-center">
            <Square className="w-3.5 h-3.5 text-red-400 fill-red-400/30" />
          </div>
          <h2 className="text-base font-bold text-white">Alta Probabilidade de Cartões</h2>
          <span className="text-[10px] bg-red-500/15 text-red-400 border border-red-500/20 rounded-full px-2 py-0.5 font-medium">
            Top {data.matches.length} jogos
          </span>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-white/40 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.matches.map((match, i) => (
          <MatchCard key={match.fixtureId} match={match} idx={i} />
        ))}
      </div>
    </motion.div>
  );
}
