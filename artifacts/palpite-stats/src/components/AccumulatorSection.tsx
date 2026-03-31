import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Trophy, Clock, TrendingUp, ExternalLink, Zap, Shield } from "lucide-react";
import { Link } from "wouter";

interface AccumPick {
  fixtureId:    number;
  homeTeam:     string;
  awayTeam:     string;
  homeTeamLogo: string;
  awayTeamLogo: string;
  league:       string;
  leagueLogo:   string;
  kickoff:      string;
  market:       string;
  marketKey:    string;
  confidence:   number;
  fairOdd:      number;
  reason:       string;
}

interface AccumulatorData {
  available:         boolean;
  picks:             AccumPick[];
  combinedOdds:      number | null;
  overallConfidence: number | null;
  generatedAt?:      string;
  cached?:           boolean;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const MARKET_COLORS: Record<string, string> = {
  over15:  "text-blue-400",
  btts:    "text-purple-400",
  corners: "text-cyan-400",
  homeWin: "text-amber-400",
  awayWin: "text-orange-400",
  dcHome:  "text-orange-400",
  dcAway:  "text-orange-400",
};

const MARKET_BG: Record<string, string> = {
  over15:  "bg-blue-500/10 border-blue-500/20",
  btts:    "bg-purple-500/10 border-purple-500/20",
  corners: "bg-cyan-500/10 border-cyan-500/20",
  homeWin: "bg-amber-500/10 border-amber-500/20",
  awayWin: "bg-orange-500/10 border-orange-500/20",
  dcHome:  "bg-orange-500/10 border-orange-500/20",
  dcAway:  "bg-orange-500/10 border-orange-500/20",
};

const BETANO_URL  = "https://referme.to/pedroa-6161";
const BETFAIR_URL = "https://promos.betfair.bet.br/choose-your-refer-and-earn-offer?referrerCode=PAXVX77DL";

function PickRow({ pick, idx }: { pick: AccumPick; idx: number }) {
  const kickoffTime = pick.kickoff
    ? new Date(pick.kickoff).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;
  const color  = MARKET_COLORS[pick.marketKey] ?? "text-emerald-400";
  const bg     = MARKET_BG[pick.marketKey]     ?? "bg-emerald-500/10 border-emerald-500/20";

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.08 }}
      className="py-3.5 border-b border-white/5 last:border-0"
    >
      {/* Row header: number + league + time */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/60">
          {idx + 1}
        </div>
        {pick.leagueLogo && (
          <img src={pick.leagueLogo} alt={pick.league} className="w-3 h-3 object-contain opacity-60" />
        )}
        <span className="text-[10px] text-white/40 uppercase tracking-wider truncate flex-1">{pick.league}</span>
        {kickoffTime && (
          <span className="flex items-center gap-0.5 text-[10px] text-white/30 flex-shrink-0">
            <Clock className="w-2.5 h-2.5" />
            {kickoffTime}
          </span>
        )}
      </div>

      {/* Match teams */}
      <Link href={`/fixture/${pick.fixtureId}`}>
        <div className="flex items-center gap-1.5 mb-2 cursor-pointer group ml-7">
          <img
            src={pick.homeTeamLogo}
            alt={pick.homeTeam}
            className="w-4 h-4 object-contain"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          <span className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors truncate">
            {pick.homeTeam}
          </span>
          <span className="text-white/25 text-xs mx-0.5">vs</span>
          <img
            src={pick.awayTeamLogo}
            alt={pick.awayTeam}
            className="w-4 h-4 object-contain"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          <span className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors truncate">
            {pick.awayTeam}
          </span>
        </div>
      </Link>

      {/* Market badge + confidence + fair odd */}
      <div className="ml-7 flex items-center gap-2 flex-wrap mb-2">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${bg} ${color}`}>
          {pick.market}
        </span>
        <span className="text-[11px] font-bold text-emerald-400">{pick.confidence}%</span>
        <span className="text-[10px] text-white/30">·</span>
        <span className="text-[10px] text-white/40">
          odd <span className="text-white/60 font-medium">{pick.fairOdd.toFixed(2)}</span>
        </span>
      </div>

      {/* Reason */}
      {pick.reason && (
        <p className="ml-7 text-[11px] text-white/40 leading-relaxed">{pick.reason}</p>
      )}
    </motion.div>
  );
}

function ConfidenceBar({ pct }: { pct: number }) {
  const color = pct >= 72 ? "bg-emerald-500" : pct >= 65 ? "bg-amber-500" : "bg-orange-500";
  return (
    <div className="w-full bg-white/10 rounded-full h-1 mt-1.5">
      <div className={`h-1 rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export default function AccumulatorSection() {
  const { data, isLoading, isError } = useQuery<AccumulatorData>({
    queryKey: ["accumulator-of-the-day"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/accumulator-of-the-day`);
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
    staleTime: 14 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="mx-4 mb-6 rounded-2xl bg-gradient-to-br from-amber-950/40 to-neutral-900 border border-amber-500/20 p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-48 bg-white/10 rounded" />
          {[0, 1, 2].map(i => (
            <div key={i} className="h-16 bg-white/5 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data?.available || data.picks.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-4 mb-6"
    >
      <div className="rounded-2xl overflow-hidden border border-amber-500/30 bg-gradient-to-br from-amber-950/50 via-neutral-900 to-neutral-900 shadow-xl shadow-amber-900/10">

        {/* Header */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Trophy className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">AI Smart Accumulator</h2>
                <p className="text-[10px] text-white/40">Seleção inteligente por análise estatística</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-1">
              <Zap className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] font-semibold text-amber-400">AI</span>
            </div>
          </div>
        </div>

        {/* Picks */}
        <div className="px-4 pb-2">
          {data.picks.map((pick, i) => (
            <PickRow key={pick.fixtureId} pick={pick} idx={i} />
          ))}
        </div>

        {/* Footer: combined odds + confidence */}
        <div className="mx-4 mb-4 grid grid-cols-2 gap-2">
          {data.combinedOdds != null && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-0.5">
                <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                <p className="text-[10px] text-white/40 uppercase tracking-wider">Odd Combinada</p>
              </div>
              <p className="text-2xl font-black text-amber-400">{data.combinedOdds.toFixed(2)}</p>
              <p className="text-[10px] text-white/30 mt-0.5">{data.picks.length} seleções</p>
            </div>
          )}

          {data.overallConfidence != null && (
            <div className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <p className="text-[10px] text-white/40 uppercase tracking-wider">Confiança</p>
              </div>
              <p className="text-2xl font-black text-emerald-400">{data.overallConfidence}%</p>
              <ConfidenceBar pct={data.overallConfidence} />
            </div>
          )}
        </div>

        {/* CTA buttons */}
        <div className="px-4 pb-4 grid grid-cols-2 gap-2">
          <a
            href={BETANO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#e2211c] hover:bg-[#c41b17] transition-colors text-white text-sm font-semibold"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Ver Odds Betano
          </a>
          <a
            href={BETFAIR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#1e3a5f] hover:bg-[#172d4a] transition-colors text-white text-sm font-semibold"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Ver Odds Betfair
          </a>
        </div>
      </div>
    </motion.section>
  );
}
