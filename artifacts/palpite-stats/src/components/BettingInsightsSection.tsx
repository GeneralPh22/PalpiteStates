import { useQuery }       from "@tanstack/react-query";
import { motion }          from "framer-motion";
import { Brain, TrendingUp, Zap, Shield, ChevronRight, Clock } from "lucide-react";
import { cn }              from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { ptBR }            from "date-fns/locale";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────

interface InsightPick {
  fixtureId:  number;
  homeTeam:   string;
  awayTeam:   string;
  homeLogo:   string;
  awayLogo:   string;
  league:     { id: number; name: string; logo: string };
  kickoff:    string;
  betLabel:   string;
  betMarket:  string;
  confidence: number;
  reasons:    string[];
}

interface BettingInsights {
  generatedAt:        string;
  available:          boolean;
  top3:               InsightPick[];
  safeMultiple:       InsightPick[];
  aggressiveMultiple: InsightPick[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function confColor(c: number) {
  if (c >= 80) return { text: "text-emerald-400", bar: "bg-emerald-500",  border: "border-emerald-500/25", bg: "bg-emerald-500/10" };
  if (c >= 70) return { text: "text-blue-400",    bar: "bg-blue-500",     border: "border-blue-500/20",    bg: "bg-blue-500/8"    };
  return         { text: "text-amber-400",  bar: "bg-amber-500",    border: "border-amber-500/20",   bg: "bg-amber-500/8"   };
}

function kickoffLabel(iso: string) {
  try {
    return format(parseISO(iso), "HH:mm", { locale: ptBR });
  } catch {
    return "--:--";
  }
}

// ── PickCard ──────────────────────────────────────────────────────────────────

function PickCard({ pick, rank }: { pick: InsightPick; rank?: number }) {
  const col = confColor(pick.confidence);

  return (
    <div className={cn(
      "rounded-xl border p-3 space-y-2.5 transition-colors",
      col.border, col.bg
    )}>
      {/* Rank + league */}
      <div className="flex items-center gap-1.5">
        {rank !== undefined && (
          <span className={cn("text-[10px] font-black tabular-nums w-4 flex-shrink-0", col.text)}>
            #{rank}
          </span>
        )}
        {pick.league.logo && (
          <img src={pick.league.logo} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" loading="lazy" />
        )}
        <span className="text-[9px] text-white/30 truncate">{pick.league.name}</span>
        <span className="ml-auto flex items-center gap-0.5 text-[9px] text-white/20">
          <Clock className="w-2.5 h-2.5" />
          {kickoffLabel(pick.kickoff)}
        </span>
      </div>

      {/* Teams */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1">
            {pick.homeLogo && (
              <img src={pick.homeLogo} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" loading="lazy" />
            )}
            <span className="text-[11px] font-semibold text-white truncate">{pick.homeTeam}</span>
          </div>
          <div className="flex items-center gap-1">
            {pick.awayLogo && (
              <img src={pick.awayLogo} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" loading="lazy" />
            )}
            <span className="text-[11px] text-white/55 truncate">{pick.awayTeam}</span>
          </div>
        </div>

        {/* Confidence badge */}
        <div className={cn("rounded-lg border px-2 py-1.5 text-center flex-shrink-0 min-w-[46px]", col.border, col.bg)}>
          <div className="text-[7px] text-white/20 uppercase tracking-wide leading-none mb-0.5">IA</div>
          <div className={cn("text-sm font-black tabular-nums leading-none", col.text)}>{pick.confidence}%</div>
        </div>
      </div>

      {/* Bet label */}
      <div className={cn(
        "text-[10px] font-bold px-2 py-1 rounded-md inline-block",
        col.text, "bg-white/[0.04] border border-white/[0.06]"
      )}>
        {pick.betLabel}
      </div>

      {/* Confidence bar */}
      <div className="space-y-0.5">
        <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-700", col.bar)}
            style={{ width: `${pick.confidence}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[7.5px] text-white/15">
          <span>Confiança da IA</span>
          <span>{pick.confidence}/100</span>
        </div>
      </div>

      {/* Reason bullets */}
      {pick.reasons.length > 0 && (
        <ul className="space-y-0.5 pt-0.5 border-t border-white/[0.04]">
          {pick.reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-1 text-[9px] text-white/30 leading-relaxed">
              <ChevronRight className="w-2.5 h-2.5 flex-shrink-0 mt-0.5 text-white/15" />
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── MultipleCard ──────────────────────────────────────────────────────────────
// Compact pick row for the Safe / Aggressive multiple panels

function MultipleRow({ pick }: { pick: InsightPick }) {
  const col = confColor(pick.confidence);
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-white/[0.04] last:border-0">
      {/* Logos */}
      <div className="flex -space-x-1 flex-shrink-0">
        {pick.homeLogo && <img src={pick.homeLogo} alt="" className="w-4 h-4 object-contain rounded-full ring-1 ring-black/40" loading="lazy" />}
        {pick.awayLogo && <img src={pick.awayLogo} alt="" className="w-4 h-4 object-contain rounded-full ring-1 ring-black/40" loading="lazy" />}
      </div>

      {/* Match + bet */}
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-semibold text-white/80 truncate">
          {pick.homeTeam} × {pick.awayTeam}
        </div>
        <div className="text-[9px] text-white/30 truncate">{pick.betLabel}</div>
      </div>

      {/* Confidence */}
      <span className={cn("text-[10px] font-black tabular-nums flex-shrink-0", col.text)}>
        {pick.confidence}%
      </span>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function InsightsSkeleton() {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4 space-y-4 mb-6">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-lg bg-white/[0.06] animate-pulse" />
        <div className="h-3 w-36 rounded bg-white/[0.06] animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[0,1,2].map(i => (
          <div key={i} className="rounded-xl border border-white/[0.05] p-3 space-y-2 animate-pulse">
            <div className="h-2 w-20 rounded bg-white/[0.05]" />
            <div className="h-3 w-full rounded bg-white/[0.05]" />
            <div className="h-3 w-3/4 rounded bg-white/[0.05]" />
            <div className="h-1 w-full rounded-full bg-white/[0.05]" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BettingInsightsSection() {
  const { data, isLoading } = useQuery<BettingInsights>({
    queryKey: ["betting-insights"],
    queryFn:  async () => {
      const res = await fetch(`${BASE}/api/betting-insights`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime:              23 * 60 * 60 * 1000,  // 23 h — refresh just before server 24 h TTL
    gcTime:                 25 * 60 * 60 * 1000,
    refetchInterval:        false,                  // Daily — no polling
    refetchOnWindowFocus:   false,
    retry: 1,
  });

  if (isLoading) return <InsightsSkeleton />;
  if (!data?.available) return null;

  const { top3, safeMultiple, aggressiveMultiple, generatedAt } = data;
  if (!top3.length && !safeMultiple.length && !aggressiveMultiple.length) return null;

  let genLabel = "";
  try { genLabel = format(parseISO(generatedAt), "HH:mm", { locale: ptBR }); } catch {}

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-6 space-y-4"
    >
      {/* ── Section Header ── */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center flex-shrink-0">
          <Brain className="w-3.5 h-3.5 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-white leading-none">Insights IA de Apostas</h2>
          <p className="text-[9px] text-white/25 leading-none mt-0.5">
            Análise diária de dados — atualizado às {genLabel}
          </p>
        </div>
        <span className="text-[8px] text-violet-400/50 border border-violet-500/15 bg-violet-500/5 px-1.5 py-0.5 rounded-md uppercase tracking-wide flex-shrink-0">
          PRO
        </span>
      </div>

      {/* ── 🔥 Top 3 AI Picks ── */}
      {top3.length > 0 && (
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.03] p-3 space-y-2.5">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-[10px] font-bold text-violet-300 uppercase tracking-widest">
              🔥 Top 3 AI Picks
            </span>
            <span className="ml-auto text-[8px] text-white/15">confiança ≥ 75%</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {top3.map((pick, i) => (
              <PickCard key={pick.fixtureId} pick={pick} rank={i + 1} />
            ))}
          </div>
        </div>
      )}

      {/* ── Safe + Aggressive panels ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* 🟢 Safe Multiple */}
        {safeMultiple.length > 0 && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.02] p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest">
                🟢 Múltipla Segura
              </span>
              <span className="ml-auto text-[8px] text-white/15">{safeMultiple.length} seleções</span>
            </div>
            <p className="text-[9px] text-white/25 leading-relaxed">
              {safeMultiple.length} seleções com alta probabilidade — mercados conservadores.
            </p>
            <div>
              {safeMultiple.map(p => <MultipleRow key={p.fixtureId} pick={p} />)}
            </div>
          </div>
        )}

        {/* 🚀 Aggressive Multiple */}
        {aggressiveMultiple.length > 0 && (
          <div className="rounded-2xl border border-orange-500/20 bg-orange-500/[0.02] p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-[10px] font-bold text-orange-300 uppercase tracking-widest">
                🚀 Múltipla Agressiva
              </span>
              <span className="ml-auto text-[8px] text-white/15">{aggressiveMultiple.length} seleções</span>
            </div>
            <p className="text-[9px] text-white/25 leading-relaxed">
              {aggressiveMultiple.length} seleções — maior risco, maior potencial de retorno.
            </p>
            <div>
              {aggressiveMultiple.map(p => <MultipleRow key={p.fixtureId} pick={p} />)}
            </div>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <p className="text-[8px] text-white/10 text-center leading-relaxed px-2">
        Os insights de IA são gerados por modelos estatísticos e não garantem resultado.
        Aposte com responsabilidade.
      </p>
    </motion.div>
  );
}
