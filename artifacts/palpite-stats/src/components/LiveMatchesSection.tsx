import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Radio, ChevronDown, ChevronUp, Flame, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
  dangerousAttacks?: number;
}

interface MatchStats {
  home: TeamStats;
  away: TeamStats;
}

interface LiveEvent {
  minute: number;
  extra: number | null;
  type: string;       // "Goal" | "Card" | "subst" | "Var"
  detail: string;     // "Normal Goal" | "Yellow Card" | "Red Card" | "Penalty" | ...
  teamId: number;
  teamName: string;
  playerName: string | null;
  assistName: string | null;
}

interface LiveMatch {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamLogo: string;
  awayTeamLogo: string;
  homeScore: number;
  awayScore: number;
  league: string;
  leagueLogo: string;
  status: string;
  elapsed: number | null;
  stats: MatchStats | null;
  statsStale: boolean;
  events: LiveEvent[] | null;
  eventsStale: boolean;
}

interface LiveData {
  available: boolean;
  count: number;
  matches: LiveMatch[];
  ts: number;
}

type EnrichedMatch = LiveMatch & {
  homeGPI: number;
  awayGPI: number;
  matchGPI: number;
  goalAlert: boolean;
};

// ── Goal Pressure Index ────────────────────────────────────────────────────────
// Weights: SoT 40% | Shots 20% | Corners 15% | Possession dominance 15% | DA 10%

function calcTeamGPI(stats: TeamStats): number {
  const possNum   = parseInt(stats.possession) || 50;
  const soTScore  = Math.min(40, (stats.shotsOnTarget / 8) * 40);
  const shots     = Math.min(20, (stats.shots / 15) * 20);
  const corners   = Math.min(15, (stats.corners / 8) * 15);
  const poss      = Math.max(0, ((possNum - 50) / 50) * 15);
  const da        = Math.min(10, ((stats.dangerousAttacks ?? 0) / 30) * 10);
  return Math.round(Math.min(100, soTScore + shots + corners + poss + da));
}

function enrichMatch(m: LiveMatch): EnrichedMatch {
  if (!m.stats) return { ...m, homeGPI: 0, awayGPI: 0, matchGPI: 0, goalAlert: false };
  const homeGPI  = calcTeamGPI(m.stats.home);
  const awayGPI  = calcTeamGPI(m.stats.away);
  const matchGPI = Math.max(homeGPI, awayGPI);
  const maxSoT   = Math.max(m.stats.home.shotsOnTarget, m.stats.away.shotsOnTarget);
  const maxCorn  = Math.max(m.stats.home.corners, m.stats.away.corners);
  const goalAlert = matchGPI > 75 && (maxSoT >= 5 || maxCorn >= 6);
  return { ...m, homeGPI, awayGPI, matchGPI, goalAlert };
}

// ── Real-time Goal Probability (Poisson) ───────────────────────────────────────

function poissonMass(k: number, lam: number): number {
  if (lam <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-lam);
  for (let i = 1; i <= k; i++) p *= lam / i;
  return p;
}

function poissonAtLeast(k: number, lam: number): number {
  if (k <= 0) return 1;
  let cum = 0;
  for (let i = 0; i < k; i++) cum += poissonMass(i, lam);
  return Math.min(1, Math.max(0, 1 - cum));
}

function calcGoalProbs(elapsed: number, matchGPI: number, totalGoals: number) {
  const remaining    = Math.max(0, 90 - elapsed);
  const intensity    = 1 + matchGPI / 100;
  const lambdaPerMin = 0.030 * intensity;
  const lambda10     = lambdaPerMin * 10;
  const lambdaRemain = lambdaPerMin * remaining;

  return {
    nextGoal: Math.min(99, Math.round((1 - Math.exp(-lambda10)) * 100)),
    over15:   Math.min(99, Math.round(poissonAtLeast(Math.max(0, 2 - totalGoals), lambdaRemain) * 100)),
    over25:   Math.min(99, Math.round(poissonAtLeast(Math.max(0, 3 - totalGoals), lambdaRemain) * 100)),
    over35:   Math.min(99, Math.round(poissonAtLeast(Math.max(0, 4 - totalGoals), lambdaRemain) * 100)),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function statusLabel(status: string, elapsed: number | null): string {
  if (status === "HT") return "Intervalo";
  if (status === "ET") return "Prorrog.";
  if (status === "P")  return "Pênaltis";
  if (elapsed !== null) return `${elapsed}'`;
  return status;
}

function gpiColor(gpi: number) {
  return gpi > 75 ? "text-red-400" : gpi > 50 ? "text-amber-400" : "text-emerald-400/70";
}

function gpiBarColor(gpi: number) {
  return gpi > 75 ? "bg-red-500" : gpi > 50 ? "bg-amber-500" : "bg-emerald-500/60";
}

function eventIcon(type: string, detail: string): string {
  if (type === "Goal") {
    if (detail.toLowerCase().includes("own")) return "⚽ (CG)";
    if (detail.toLowerCase().includes("penalty")) return "⚽ (P)";
    return "⚽";
  }
  if (type === "Card") {
    if (detail === "Yellow Card") return "🟨";
    return "🟥";
  }
  if (type === "Var") return "📺";
  if (type === "subst") return "↕";
  return "•";
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PossessionBar({ home, away }: { home: string; away: string }) {
  const h = parseInt(home) || 50;
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className="text-white/50 tabular-nums w-7 text-right">{home}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.08] overflow-hidden flex">
        <div className="h-full bg-emerald-500/70 transition-all" style={{ width: `${h}%` }} />
        <div className="h-full bg-blue-500/70 transition-all"    style={{ width: `${100 - h}%` }} />
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

function MomentumBar({ label, gpi, colorClass }: { label: string; gpi: number; colorClass: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[9px]">
        <span className="text-white/40 truncate max-w-[110px]">{label}</span>
        <span className={cn("font-black tabular-nums ml-2", colorClass)}>{gpi}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", gpiBarColor(gpi))}
          style={{ width: `${gpi}%` }}
        />
      </div>
    </div>
  );
}

function ProbCard({ label, value }: { label: string; value: number }) {
  const hi = value >= 65;
  return (
    <div className={cn(
      "rounded-lg p-2 text-center border flex-1",
      hi ? "bg-amber-500/10 border-amber-500/20" : "bg-white/[0.03] border-white/[0.06]"
    )}>
      <div className="text-[8px] text-white/30 uppercase tracking-wider leading-tight mb-0.5">{label}</div>
      <div className={cn("text-xs font-black tabular-nums", hi ? "text-amber-400" : "text-white/50")}>
        {value}%
      </div>
    </div>
  );
}

/** Chronological match timeline — goals, cards, VAR only (substitutions are filtered out). */
function LiveTimeline({ events, homeTeamId }: { events: LiveEvent[]; homeTeamId: number }) {
  const notable = useMemo(() => {
    return events
      .filter(e => e.type === "Goal" || e.type === "Card" || e.type === "Var")
      .sort((a, b) => a.minute - b.minute || (a.extra ?? 0) - (b.extra ?? 0));
  }, [events]);

  if (notable.length === 0) return null;

  return (
    <div className="space-y-1.5 pt-2 border-t border-white/[0.05]">
      <span className="text-[8.5px] text-white/20 uppercase tracking-widest font-semibold">
        Eventos da Partida
      </span>
      <div className="space-y-1">
        {notable.map((e, i) => {
          const isHome = e.teamId === homeTeamId;
          return (
            <div
              key={i}
              className={cn(
                "flex items-center gap-2 text-[10px]",
                isHome ? "" : "flex-row-reverse"
              )}
            >
              {/* Minute */}
              <span className="text-[9px] text-white/30 tabular-nums w-8 flex-shrink-0 text-center">
                {e.minute}{e.extra ? `+${e.extra}` : ""}'
              </span>
              {/* Icon */}
              <span className="flex-shrink-0 text-[11px] leading-none">
                {eventIcon(e.type, e.detail)}
              </span>
              {/* Player + team */}
              <div className={cn("flex-1 min-w-0", isHome ? "" : "text-right")}>
                <span className="text-white/70 font-medium truncate block leading-tight">
                  {e.playerName ?? e.teamName}
                </span>
                {e.assistName && (
                  <span className="text-white/30 text-[8.5px] truncate block leading-tight">
                    ↳ {e.assistName}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Match Card (full) ──────────────────────────────────────────────────────────

function LiveMatchCard({ match, idx }: { match: EnrichedMatch; idx: number }) {
  const [expanded, setExpanded] = useState(false);
  const label    = statusLabel(match.status, match.elapsed);
  const hasStats = !!match.stats;
  const total    = match.homeScore + match.awayScore;

  const goalProbs = useMemo(() => {
    if (!hasStats || match.elapsed === null || match.elapsed >= 88) return null;
    return calcGoalProbs(match.elapsed, match.matchGPI, total);
  }, [hasStats, match.elapsed, match.matchGPI, total]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04 }}
      className={cn(
        "rounded-xl border overflow-hidden",
        match.goalAlert
          ? "border-red-500/30 bg-red-500/[0.03]"
          : "border-white/[0.08] bg-white/[0.02]"
      )}
    >
      {/* GPI intensity bar across the very top */}
      {match.matchGPI > 0 && (
        <div className="h-0.5 bg-white/[0.04]">
          <div
            className={cn("h-full transition-all duration-700", gpiBarColor(match.matchGPI))}
            style={{ width: `${match.matchGPI}%` }}
          />
        </div>
      )}

      {/* 🚨 Goal Alert Banner */}
      {match.goalAlert && (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 border-b border-red-500/20">
          <span className="text-[11px] font-black text-red-400 animate-pulse tracking-wide">
            🚨 Gol Provável em Breve
          </span>
        </div>
      )}

      {/* ── Match header row ── */}
      <div
        className={cn(
          "p-3 transition-colors",
          "cursor-pointer hover:bg-white/[0.03] active:bg-white/[0.05]"
        )}
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          {match.leagueLogo && (
            <img src={match.leagueLogo} alt={match.league} className="w-4 h-4 object-contain opacity-60 flex-shrink-0" loading="lazy" />
          )}
          <span className="flex-shrink-0 text-[10px] font-black text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-1.5 py-0.5 tabular-nums leading-none">
            {label}
          </span>

          <div className="flex-1 flex items-center justify-between min-w-0 gap-1">
            <div className="flex items-center gap-1 min-w-0">
              {match.homeTeamLogo && <img src={match.homeTeamLogo} alt="" className="w-4 h-4 object-contain flex-shrink-0" loading="lazy" />}
              <span className="text-xs font-semibold text-white truncate">{match.homeTeam}</span>
            </div>
            <span className="flex-shrink-0 text-sm font-black text-white tabular-nums px-2">
              {match.homeScore} – {match.awayScore}
            </span>
            <div className="flex items-center gap-1 min-w-0 justify-end">
              <span className="text-xs font-semibold text-white truncate text-right">{match.awayTeam}</span>
              {match.awayTeamLogo && <img src={match.awayTeamLogo} alt="" className="w-4 h-4 object-contain flex-shrink-0" loading="lazy" />}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {match.matchGPI > 0 && (
              <span className={cn("text-[10px] font-black tabular-nums", gpiColor(match.matchGPI))}>
                {match.matchGPI}
              </span>
            )}
            <span className="text-white/20">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
          </div>
        </div>
      </div>

      {/* ── Expanded panel ── */}
      {expanded && (
        <div className="border-t border-white/[0.05] px-3 pb-3 pt-2 space-y-3">

          {/* Stats loading state */}
          {!hasStats && (
            <div className="flex items-center gap-2 py-2 text-white/30">
              <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
              <span className="text-[11px]">Carregando estatísticas ao vivo...</span>
            </div>
          )}

          {/* Stale stats warning */}
          {hasStats && match.statsStale && (
            <div className="flex items-center gap-1.5 text-amber-400/60">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              <span className="text-[9px]">Dados atualizando...</span>
            </div>
          )}

          {/* ── Attacking Momentum ── */}
          {hasStats && (
            <>
              <div className="flex items-center justify-between text-[9px] text-white/25 font-semibold">
                <span className="truncate max-w-[80px]">{match.stats!.home.team || match.homeTeam}</span>
                <span>Estatísticas</span>
                <span className="truncate max-w-[80px] text-right">{match.stats!.away.team || match.awayTeam}</span>
              </div>

              <div className="space-y-1.5">
                <span className="text-[8.5px] text-white/20 uppercase tracking-widest font-semibold">
                  Pressão Ofensiva
                </span>
                <MomentumBar
                  label={match.homeTeam}
                  gpi={match.homeGPI}
                  colorClass={gpiColor(match.homeGPI)}
                />
                <MomentumBar
                  label={match.awayTeam}
                  gpi={match.awayGPI}
                  colorClass={match.awayGPI > 75 ? "text-red-400" : match.awayGPI > 50 ? "text-amber-400" : "text-blue-400/70"}
                />
              </div>

              {/* ── Match stats ── */}
              <div className="space-y-1.5">
                <PossessionBar home={match.stats!.home.possession} away={match.stats!.away.possession} />
                <StatRow label="Finalizações" home={match.stats!.home.shots}         away={match.stats!.away.shots} />
                <StatRow label="No alvo"      home={match.stats!.home.shotsOnTarget} away={match.stats!.away.shotsOnTarget} />
                <StatRow label="Escanteios"   home={match.stats!.home.corners}       away={match.stats!.away.corners} />
                <StatRow label="Faltas"       home={match.stats!.home.fouls}         away={match.stats!.away.fouls} />
                <StatRow label="🟨"           home={match.stats!.home.yellowCards}   away={match.stats!.away.yellowCards} />
                {(match.stats!.home.redCards > 0 || match.stats!.away.redCards > 0) && (
                  <StatRow label="🟥" home={match.stats!.home.redCards} away={match.stats!.away.redCards} />
                )}
              </div>

              {/* ── Real-time Goal Probabilities ── */}
              {goalProbs && (
                <div className="space-y-1.5 pt-1 border-t border-white/[0.05]">
                  <span className="text-[8.5px] text-white/20 uppercase tracking-widest font-semibold">
                    Probabilidade de Gol
                  </span>
                  <div className="flex gap-1">
                    <ProbCard label="Próx 10'" value={goalProbs.nextGoal} />
                    <ProbCard label="O 1.5"    value={goalProbs.over15} />
                    <ProbCard label="O 2.5"    value={goalProbs.over25} />
                    <ProbCard label="O 3.5"    value={goalProbs.over35} />
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Live Timeline (events) ── */}
          {match.events && match.events.length > 0 && (
            <LiveTimeline events={match.events} homeTeamId={match.homeTeamId} />
          )}
          {match.events !== null && match.events.length === 0 && (
            <div className="pt-1 border-t border-white/[0.05]">
              <span className="text-[10px] text-white/20">Nenhum evento registrado ainda.</span>
            </div>
          )}
          {match.eventsStale && match.events && (
            <div className="flex items-center gap-1.5 text-amber-400/50">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              <span className="text-[9px]">Eventos atualizando...</span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ── Hot Match Card (compact) ───────────────────────────────────────────────────

function HotMatchCard({ match, rank }: { match: EnrichedMatch; rank: number }) {
  const label = statusLabel(match.status, match.elapsed);
  return (
    <div className={cn(
      "flex items-center gap-2 rounded-xl px-3 py-2 border",
      match.goalAlert
        ? "bg-red-500/[0.06] border-red-500/25"
        : "bg-white/[0.02] border-white/[0.08]"
    )}>
      <span className="text-[10px] font-black text-white/20 w-4 flex-shrink-0 tabular-nums">
        #{rank}
      </span>
      {match.leagueLogo && (
        <img src={match.leagueLogo} alt="" className="w-3.5 h-3.5 object-contain opacity-50 flex-shrink-0" loading="lazy" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold text-white truncate leading-tight">
          {match.homeTeam} <span className="text-white/30">vs</span> {match.awayTeam}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <div className="h-1 rounded-full bg-white/[0.06] flex-1 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", gpiBarColor(match.matchGPI))}
              style={{ width: `${match.matchGPI}%` }}
            />
          </div>
          <span className={cn("text-[9px] font-black tabular-nums flex-shrink-0", gpiColor(match.matchGPI))}>
            GPI {match.matchGPI}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <span className="text-xs font-black text-white tabular-nums">
          {match.homeScore}–{match.awayScore}
        </span>
        <span className="text-[9px] text-red-400 tabular-nums font-semibold">{label}</span>
      </div>
      {match.goalAlert && <span className="text-sm flex-shrink-0">🚨</span>}
    </div>
  );
}

// ── Main Section ───────────────────────────────────────────────────────────────

export default function LiveMatchesSection() {
  const { data, isLoading, dataUpdatedAt } = useQuery<LiveData>({
    queryKey: ["live", "matches"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/live/matches`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 55_000,
    gcTime: 5 * 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    retry: 2,
  });

  const enrichedMatches = useMemo<EnrichedMatch[]>(() => {
    return (data?.matches ?? []).map(enrichMatch);
  }, [data?.matches]);

  const hotMatches = useMemo<EnrichedMatch[]>(() => {
    return [...enrichedMatches]
      .filter(m => m.matchGPI > 0)
      .sort((a, b) => b.matchGPI - a.matchGPI)
      .slice(0, 5);
  }, [enrichedMatches]);

  // Is the cached data stale (> 90s since last frontend poll succeeded)?
  const isStaleData = dataUpdatedAt > 0 && (Date.now() - dataUpdatedAt) > 90_000;

  if (isLoading || !data?.available || !data.matches.length) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 space-y-4">

      {/* ── Section Header ── */}
      <div className="flex items-center gap-2">
        <div className="relative w-7 h-7 rounded-lg bg-red-500/15 flex items-center justify-center flex-shrink-0">
          <Radio className="w-3.5 h-3.5 text-red-400" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 animate-ping opacity-75" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500" />
        </div>
        <h2 className="text-base font-bold text-white">Ao Vivo</h2>
        <span className="text-xs bg-red-500/15 text-red-400 border border-red-500/20 rounded-full px-2 py-0.5 font-semibold tabular-nums">
          {data.count} {data.count === 1 ? "jogo" : "jogos"}
        </span>

        {/* Stale data warning */}
        {isStaleData && (
          <span className="flex items-center gap-1 text-[9px] text-amber-400/70 ml-1">
            <AlertTriangle className="w-3 h-3" />
            Dados ao vivo atualizando...
          </span>
        )}

        <span className="text-[10px] text-white/20 ml-auto">Toque para ver stats</span>
      </div>

      {/* ── 🔥 Hot Match Scanner ── */}
      {hotMatches.length > 0 && (
        <div className="rounded-2xl border border-orange-500/20 bg-orange-500/[0.04] p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">
              Jogos Mais Intensos
            </span>
            <span className="ml-auto text-[8.5px] text-white/20">
              GPI = Índice de Pressão de Gol (0–100)
            </span>
          </div>
          <div className="space-y-1.5">
            {hotMatches.map((m, i) => (
              <HotMatchCard key={m.fixtureId} match={m} rank={i + 1} />
            ))}
          </div>
        </div>
      )}

      {/* ── All Live Matches ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {enrichedMatches.map((match, i) => (
          <LiveMatchCard key={match.fixtureId} match={match} idx={i} />
        ))}
      </div>
    </motion.div>
  );
}
