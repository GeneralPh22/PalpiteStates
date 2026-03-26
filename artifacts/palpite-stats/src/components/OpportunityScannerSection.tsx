import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Sparkles, RefreshCw, TrendingUp, Target, Zap } from "lucide-react";
import { format } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface OpportunityMatch {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo: string;
  awayTeamLogo: string;
  league: string;
  leagueLogo: string;
  kickoff: string;
  lambdaHome: number;
  lambdaAway: number;
  over25Pct: number;
  bttsPct: number;
  attackIndex: number;
  confidence: number;
}

interface ScannerData {
  available: boolean;
  matches: OpportunityMatch[];
  isFallback?: boolean;
  fallbackMessage?: string;
  scannedAt?: string;
  cached?: boolean;
}

function kickoffTime(iso: string) {
  try { return format(new Date(iso), "HH:mm"); } catch { return ""; }
}

function ConfidenceRing({ value }: { value: number }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  const color = value >= 75 ? "#a855f7" : value >= 65 ? "#7c3aed" : "#6d28d9";
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="flex-shrink-0">
      <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(139,92,246,0.12)" strokeWidth="3" />
      <circle
        cx="18" cy="18" r={r} fill="none"
        stroke={color} strokeWidth="3"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
      />
      <text x="18" y="22" textAnchor="middle" fontSize="9" fontWeight="800" fill="white">
        {value}%
      </text>
    </svg>
  );
}

function FactorBadge({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border" style={{
      borderColor: `${color}30`,
      backgroundColor: `${color}10`,
    }}>
      <span style={{ color }}>{icon}</span>
      <span className="text-[9px] font-medium" style={{ color: `${color}cc` }}>{label}</span>
      <span className="text-[9px] font-black tabular-nums" style={{ color }}>{value}%</span>
    </div>
  );
}

function MatchCard({ match, idx }: { match: OpportunityMatch; idx: number }) {
  const time = kickoffTime(match.kickoff);
  const xgTotal = (match.lambdaHome + match.lambdaAway).toFixed(2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.06 }}
      className="rounded-xl border border-purple-500/[0.12] bg-purple-500/[0.03] hover:bg-purple-500/[0.06] hover:border-purple-500/[0.22] transition-all"
    >
      <div className="p-3">
        <div className="flex items-start gap-2.5">
          <ConfidenceRing value={match.confidence} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 text-xs font-semibold text-white mb-0.5">
              {match.homeTeamLogo && (
                <img src={match.homeTeamLogo} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" loading="lazy" />
              )}
              <span className="truncate">{match.homeTeam}</span>
              <span className="text-zinc-600 flex-shrink-0 text-[10px]">×</span>
              <span className="truncate">{match.awayTeam}</span>
              {match.awayTeamLogo && (
                <img src={match.awayTeamLogo} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" loading="lazy" />
              )}
            </div>
            <div className="flex items-center gap-1.5 mb-2">
              {match.leagueLogo && (
                <img src={match.leagueLogo} alt="" className="w-3 h-3 object-contain opacity-50" loading="lazy" />
              )}
              <span className="text-[9px] text-zinc-500 truncate">{match.league}</span>
              {time && (
                <>
                  <span className="text-zinc-700 text-[9px]">·</span>
                  <span className="text-[9px] text-zinc-500 tabular-nums">{time}</span>
                </>
              )}
              <span className="text-zinc-700 text-[9px]">·</span>
              <span className="text-[9px] text-purple-400 font-semibold tabular-nums">{xgTotal} xG</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <FactorBadge icon={<TrendingUp className="w-2.5 h-2.5" />} label="Over 2.5" value={match.over25Pct} color="#a855f7" />
              <FactorBadge icon={<Target className="w-2.5 h-2.5" />} label="BTTS" value={match.bttsPct} color="#8b5cf6" />
              <FactorBadge icon={<Zap className="w-2.5 h-2.5" />} label="Ataque" value={match.attackIndex} color="#7c3aed" />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function OpportunityScannerSection() {
  const { data, isLoading, isError, isFetching, refetch } = useQuery<ScannerData>({
    queryKey: ["scanner", "opportunities"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/scanner/opportunities`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 20 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <h2 className="text-base font-bold text-white">Scanner IA de Oportunidades</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 animate-pulse h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || (!data?.available && !data?.isFallback && !data?.matches?.length)) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <h2 className="text-base font-bold text-white">Scanner IA de Oportunidades</h2>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-5 text-center">
          <p className="text-sm text-white/40">
            {data?.fallbackMessage ?? "Nenhuma oportunidade de alta confiança encontrada hoje. A IA continua monitorando os jogos."}
          </p>
        </div>
      </motion.div>
    );
  }

  if (!data?.matches?.length) return null;

  const isFallback = data.isFallback ?? false;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <h2 className="text-base font-bold text-white">Scanner IA de Oportunidades</h2>
          {isFallback ? (
            <span className="text-[10px] bg-white/[0.06] text-white/40 border border-white/10 rounded-full px-2 py-0.5 font-medium">
              Melhores do dia
            </span>
          ) : (
            <span className="text-[10px] bg-purple-500/15 text-purple-400 border border-purple-500/20 rounded-full px-2 py-0.5 font-medium">
              Top {data.matches.length} oportunidades ≥{isFallback ? "" : "70%"}
            </span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-white/40 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isFallback && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[11px] text-white/35">
          Nenhuma oportunidade acima de 70% hoje. Mostrando as melhores estatísticas disponíveis.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.matches.map((match, i) => (
          <MatchCard key={match.fixtureId} match={match} idx={i} />
        ))}
      </div>
    </motion.div>
  );
}
