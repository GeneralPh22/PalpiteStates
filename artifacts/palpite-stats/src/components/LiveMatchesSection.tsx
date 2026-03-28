import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Radio, ChevronDown, ChevronUp, Flame, AlertTriangle, Loader2, Wifi, WifiOff } from "lucide-react";
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

interface FinishedMatch {
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
  finishedAt: number;
}

interface LiveData {
  available: boolean;
  count: number;
  matches: LiveMatch[];
  finished: FinishedMatch[];
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

/**
 * Stats-based pressure score (0–100) using the specified live-stats weights.
 * Formula:  SoT × 35%  +  Shots × 25%  +  DA × 20%  +  Corners × 10%  +  Possession × 10%
 *
 * Deliberately uses different weights from calcTeamGPI (GPI: SoT 40% Shots 20% Corners 15%
 * Poss 15% DA 10%) and from calcTeamGPS (GPS: SoT 35% Shots 20% DA 20% Corners 15% Poss 10%).
 * These three formulas are intentionally independent — each serves a different feature.
 */
function calcStatsPressure(stats: TeamStats): number {
  const possNum = parseInt(stats.possession) || 0;
  return Math.min(100, Math.round(
    Math.min(35, (stats.shotsOnTarget           / 8)  * 35) +
    Math.min(25, (stats.shots                   / 15) * 25) +
    Math.min(20, ((stats.dangerousAttacks ?? 0) / 30) * 20) +
    Math.min(10, (stats.corners                 / 8)  * 10) +
    (possNum / 100) * 10
  ));
}

/**
 * Enhanced goal probabilities = Poisson baseline (calcGoalProbs) + stats pressure boost.
 *
 * calcGoalProbs() is UNCHANGED — it remains the foundation.
 * This function adds an additive boost to each Over market when live stats
 * show meaningful pressure above the specified threshold.
 *
 * Thresholds (as specified):
 *   pressure ≥ 50 → boosts Over 0.5 (computed but not displayed — already near 100%)
 *   pressure ≥ 65 → boosts Over 1.5   (up to +15 pp at pressure 100)
 *   pressure ≥ 75 → boosts Over 2.5   (up to +12 pp at pressure 100)
 *   pressure ≥ 85 → boosts Over 3.5   (up to +8 pp at pressure 100)
 */
function calcEnhancedGoalProbs(
  elapsed:    number,
  matchGPI:   number,
  totalGoals: number,
  stats: { home: TeamStats; away: TeamStats } | null
) {
  const base = calcGoalProbs(elapsed, matchGPI, totalGoals);
  if (!stats) return base;

  // Dominant team pressure (higher of home / away)
  const pressure = Math.max(calcStatsPressure(stats.home), calcStatsPressure(stats.away));

  // Linear boosts above each threshold, capped at realistic maximums
  const over15Boost = pressure >= 65 ? Math.round((pressure - 65) * 0.43) : 0; // max ≈ +15
  const over25Boost = pressure >= 75 ? Math.round((pressure - 75) * 0.48) : 0; // max ≈ +12
  const over35Boost = pressure >= 85 ? Math.round((pressure - 85) * 0.53) : 0; // max ≈ +8

  return {
    nextGoal: base.nextGoal,                              // Poisson handles the 10-min window
    over15:   Math.min(99, base.over15 + over15Boost),
    over25:   Math.min(99, base.over25 + over25Boost),
    over35:   Math.min(99, base.over35 + over35Boost),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const LIVE_STATUS_SET = new Set(["1H", "HT", "2H", "ET", "P", "BT"]);

function statusLabel(status: string, elapsed: number | null): string {
  if (status === "HT")   return "Intervalo";
  if (status === "ET")   return "Prorrog.";
  if (status === "P")    return "Pênaltis";
  if (status === "BT")   return "Pausa";
  if (status === "FT")   return "Encerrado";
  if (status === "AET")  return "Enc. (P.E.)";
  if (status === "PEN")  return "Enc. (Pen.)";
  if (status === "CANC") return "Cancelado";
  if (status === "ABD")  return "Abandonado";
  if (status === "PST")  return "Adiado";
  if (status === "WO")   return "W.O.";
  if (status === "SUSP") return "Suspenso";
  if (elapsed !== null)  return `${elapsed}'`;
  return status;
}

function finishedStatusLabel(status: string): string {
  if (status === "FT")   return "Encerrado";
  if (status === "AET")  return "Enc. P.E.";
  if (status === "PEN")  return "Enc. Pen.";
  if (status === "CANC") return "Cancelado";
  if (status === "ABD")  return "Abandonado";
  if (status === "PST")  return "Adiado";
  if (status === "WO")   return "W.O.";
  return status;
}

function gpiColor(gpi: number) {
  return gpi > 75 ? "text-red-400" : gpi > 50 ? "text-amber-400" : "text-emerald-400/70";
}

function gpiBarColor(gpi: number) {
  return gpi > 75 ? "bg-red-500" : gpi > 50 ? "bg-amber-500" : "bg-emerald-500/60";
}

// ── Opportunity Radar types ────────────────────────────────────────────────────

interface OpportunitySignal {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo: string;
  awayTeamLogo: string;
  homeScore: number;
  awayScore: number;
  league: string;
  leagueLogo: string;
  elapsed: number | null;
  status: string;
  tags: string[];          // visual badges: 🚨 ⚡ 🔥
  reasons: string[];       // human-readable why it qualified
  bestLabel: string;       // "O 1.5" | "O 2.5" | "Próx 10'" | "Pressão" | "Spike DA"
  bestProb: number;        // highest probability (0–100); 0 for non-prob triggers
  matchGPI: number;
  over15: number;
  over25: number;
  nextGoal: number;
  isStale?: boolean;       // stats temporarily disappeared — showing last known values
}

/** Snapshot of key stats per fixture used to detect inter-scan spikes. */
interface StatSnapshot {
  da: number;   // total dangerous attacks (home + away)
  sot: number;  // total shots on target (home + away)
}

// ── Opportunity detection (pure function, called every 10 s) ──────────────────

function detectOpportunities(
  matches: EnrichedMatch[],
  prevSnaps: Map<number, StatSnapshot>
): { signals: OpportunitySignal[]; nextSnaps: Map<number, StatSnapshot> } {
  const signals: OpportunitySignal[] = [];
  const nextSnaps = new Map<number, StatSnapshot>();

  for (const m of matches) {
    const total = m.homeScore + m.awayScore;

    // Always update snapshot for DA-spike tracking (even if no stats yet)
    const homeDa  = m.stats?.home.dangerousAttacks ?? 0;
    const awayDa  = m.stats?.away.dangerousAttacks ?? 0;
    const homeSoT = m.stats?.home.shotsOnTarget ?? 0;
    const awaySoT = m.stats?.away.shotsOnTarget ?? 0;
    const totalDa  = homeDa + awayDa;
    const totalSoT = homeSoT + awaySoT;
    nextSnaps.set(m.fixtureId, { da: totalDa, sot: totalSoT });

    // Cannot compute probabilities without stats or elapsed time
    const hasStats = !!m.stats && m.elapsed !== null;
    const probs = hasStats
      ? calcGoalProbs(m.elapsed!, m.matchGPI, total)
      : { nextGoal: 0, over15: 0, over25: 0, over35: 0 };

    const tags: string[]    = [];
    const reasons: string[] = [];
    let qualifies = false;
    let bestLabel = "";
    let bestProb  = 0;

    // ── Condition 1: O1.5 ≥ 75% ──────────────────────────────────────────────
    if (probs.over15 >= 75) {
      qualifies = true;
      reasons.push(`Over 1.5: ${probs.over15}%`);
      if (probs.over15 > bestProb) { bestProb = probs.over15; bestLabel = "O 1.5"; }
    }

    // ── Condition 2: O2.5 ≥ 65% ──────────────────────────────────────────────
    if (probs.over25 >= 65) {
      qualifies = true;
      reasons.push(`Over 2.5: ${probs.over25}%`);
      if (probs.over25 > bestProb) { bestProb = probs.over25; bestLabel = "O 2.5"; }
    }

    // ── Condition 3: Next 10' ≥ 25% ──────────────────────────────────────────
    if (probs.nextGoal >= 25) {
      qualifies = true;
      reasons.push(`Gol próx. 10': ${probs.nextGoal}%`);
      if (probs.nextGoal > bestProb) { bestProb = probs.nextGoal; bestLabel = "Próx 10'"; }
      if (probs.nextGoal >= 50)       tags.push("🚨");
      else                            tags.push("⚡");
    }

    // ── Condition 4: High attacking pressure difference ───────────────────────
    if (hasStats) {
      const gpiDiff = Math.abs(m.homeGPI - m.awayGPI);
      if (gpiDiff >= 35 && Math.max(m.homeGPI, m.awayGPI) >= 55) {
        qualifies = true;
        const domTeam = m.homeGPI > m.awayGPI ? m.homeTeam : m.awayTeam;
        reasons.push(`Alta pressão: ${domTeam} (GPI +${gpiDiff})`);
        tags.push("🔥");
        if (!bestLabel) { bestLabel = "Pressão"; bestProb = Math.max(m.homeGPI, m.awayGPI); }
      }
    }

    // ── Condition 5: Sudden spike in dangerous attacks (inter-scan) ───────────
    const prev = prevSnaps.get(m.fixtureId);
    if (prev && hasStats) {
      const daSpike  = totalDa  - prev.da;
      const sotSpike = totalSoT - prev.sot;
      if (daSpike >= 4) {
        qualifies = true;
        reasons.push(`Spike de ataques perigosos: +${daSpike}`);
        tags.push("⚡");
        if (!bestLabel) { bestLabel = "Spike DA"; bestProb = Math.min(99, daSpike * 10); }
      }
      if (sotSpike >= 2) {
        qualifies = true;
        reasons.push(`Finalizações no alvo crescendo: +${sotSpike}`);
        if (!tags.includes("⚡")) tags.push("⚡");
        if (!bestLabel) { bestLabel = "Momentum"; bestProb = Math.min(99, sotSpike * 15); }
      }
    }

    // ── Additional visual tags (non-qualifying, enhance display) ─────────────
    if (m.goalAlert && !tags.includes("🚨")) tags.push("🚨");
    if (m.matchGPI >= 70 && !tags.includes("🔥")) tags.push("🔥");

    if (qualifies) {
      signals.push({
        fixtureId:    m.fixtureId,
        homeTeam:     m.homeTeam,
        awayTeam:     m.awayTeam,
        homeTeamLogo: m.homeTeamLogo,
        awayTeamLogo: m.awayTeamLogo,
        homeScore:    m.homeScore,
        awayScore:    m.awayScore,
        league:       m.league,
        leagueLogo:   m.leagueLogo,
        elapsed:      m.elapsed,
        status:       m.status,
        tags:         [...new Set(tags)],
        reasons,
        bestLabel,
        bestProb,
        matchGPI:     m.matchGPI,
        over15:       probs.over15,
        over25:       probs.over25,
        nextGoal:     probs.nextGoal,
      });
    }
  }

  // Sort by best probability descending
  signals.sort((a, b) => b.bestProb - a.bestProb);
  return { signals, nextSnaps };
}

// ── Live Opportunity Radar component ──────────────────────────────────────────

function LiveOpportunityRadar({ matches }: { matches: EnrichedMatch[] }) {
  const prevSnapsRef      = useRef<Map<number, StatSnapshot>>(new Map());
  const lastValidRef      = useRef<OpportunitySignal[]>([]);
  const [signals, setSignals] = useState<OpportunitySignal[]>([]);
  const [scanCount, setScanCount] = useState(0); // used to trigger re-renders on interval

  // Core scan function — pure computation, updates state
  const runScan = useCallback(() => {
    const { signals: fresh, nextSnaps } = detectOpportunities(matches, prevSnapsRef.current);
    prevSnapsRef.current = nextSnaps;

    // Failsafe: if a previously-qualifying match temporarily lost its stats,
    // keep showing it with its last known probabilities (marked as stale)
    const freshIds = new Set(fresh.map(s => s.fixtureId));
    const staleCarryOver = lastValidRef.current.filter(prev => {
      if (freshIds.has(prev.fixtureId)) return false; // already in fresh list
      const stillLive = matches.some(m => m.fixtureId === prev.fixtureId);
      const lostStats = matches.find(m => m.fixtureId === prev.fixtureId)?.stats === null;
      return stillLive && lostStats; // still live but stats dropped
    }).map(s => ({ ...s, isStale: true }));

    const combined = [...fresh, ...staleCarryOver];
    if (fresh.length > 0) lastValidRef.current = fresh; // only update cache with fresh data
    setSignals(combined);
    setScanCount(c => c + 1);
  }, [matches]);

  // Run immediately when matches change
  useEffect(() => { runScan(); }, [runScan]);

  // Also run every 10 s independently for spike detection
  useEffect(() => {
    const id = setInterval(runScan, 10_000);
    return () => clearInterval(id);
  }, [runScan]);

  const hasSignals = signals.length > 0;

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.03] p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">📡</span>
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">
            Radar de Oportunidades ao Vivo
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-[8.5px] text-white/20 tabular-nums">
            scan #{scanCount}
          </span>
        </div>
      </div>

      {/* Empty state */}
      {!hasSignals && (
        <div className="flex items-center gap-2 py-1.5 text-white/25">
          <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
          <span className="text-[11px]">
            Monitorando partidas ao vivo para novas oportunidades...
          </span>
        </div>
      )}

      {/* Opportunity cards */}
      {hasSignals && (
        <div className="space-y-1.5">
          {signals.map(sig => (
            <OpportunityCard key={sig.fixtureId} sig={sig} />
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 pt-0.5 border-t border-white/[0.04]">
        <span className="text-[8.5px] text-white/15 uppercase tracking-wider">Legenda:</span>
        <span className="text-[8.5px] text-white/25">🚨 Gol provável</span>
        <span className="text-[8.5px] text-white/25">🔥 Alta pressão</span>
        <span className="text-[8.5px] text-white/25">⚡ Momentum</span>
      </div>
    </div>
  );
}

function OpportunityCard({ sig }: { sig: OpportunitySignal }) {
  const label   = statusLabel(sig.status, sig.elapsed);
  const isHot   = sig.bestProb >= 65 || sig.tags.includes("🚨");
  const probColor = sig.bestProb >= 75 ? "text-red-400" : sig.bestProb >= 65 ? "text-amber-400" : "text-emerald-400";
  const probBg    = sig.bestProb >= 75 ? "bg-red-500/10 border-red-500/20" : sig.bestProb >= 65 ? "bg-amber-500/10 border-amber-500/20" : "bg-emerald-500/10 border-emerald-500/20";

  return (
    <div className={cn(
      "rounded-xl border p-2.5 transition-colors",
      isHot ? "border-amber-500/20 bg-amber-500/[0.04]" : "border-white/[0.07] bg-white/[0.02]",
      sig.isStale && "opacity-60"
    )}>
      <div className="flex items-start gap-2">
        {/* Tags column */}
        <div className="flex flex-col items-center gap-0.5 flex-shrink-0 w-6 pt-0.5">
          {sig.tags.slice(0, 3).map((t, i) => (
            <span key={i} className="text-[13px] leading-none">{t}</span>
          ))}
        </div>

        {/* Match info */}
        <div className="flex-1 min-w-0 space-y-1">
          {/* Teams row */}
          <div className="flex items-center gap-1">
            {sig.homeTeamLogo && (
              <img src={sig.homeTeamLogo} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" loading="lazy" />
            )}
            <span className="text-[11px] font-semibold text-white truncate">
              {sig.homeTeam}
            </span>
            <span className="flex-shrink-0 text-[11px] font-black text-white/60 tabular-nums px-1">
              {sig.homeScore}–{sig.awayScore}
            </span>
            <span className="text-[11px] font-semibold text-white truncate text-right flex-1">
              {sig.awayTeam}
            </span>
            {sig.awayTeamLogo && (
              <img src={sig.awayTeamLogo} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" loading="lazy" />
            )}
          </div>

          {/* Reasons */}
          <div className="flex flex-wrap gap-1">
            {sig.reasons.map((r, i) => (
              <span key={i} className="text-[8.5px] bg-white/[0.05] border border-white/[0.08] rounded-full px-1.5 py-0.5 text-white/50">
                {r}
              </span>
            ))}
            {sig.isStale && (
              <span className="text-[8.5px] bg-amber-500/10 border border-amber-500/20 rounded-full px-1.5 py-0.5 text-amber-400/70">
                Stats atualizando...
              </span>
            )}
          </div>
        </div>

        {/* Best probability badge */}
        <div className={cn("rounded-lg border px-2 py-1 text-center flex-shrink-0 min-w-[48px]", probBg)}>
          <div className="text-[7.5px] text-white/30 uppercase tracking-wide leading-none mb-0.5">
            {sig.bestLabel}
          </div>
          <div className={cn("text-xs font-black tabular-nums leading-none", probColor)}>
            {sig.bestProb > 0 ? `${sig.bestProb}%` : "–"}
          </div>
        </div>

        {/* Minute badge */}
        <div className="flex-shrink-0 text-center">
          <span className="text-[9px] text-red-400 font-bold tabular-nums">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
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

// ── AI Goal Pressure Detector ─────────────────────────────────────────────────
// Calculates a per-team pressure score from live stats and inter-scan DA spikes.
// Completely independent of calcGoalProbs and detectOpportunities.

interface PressureSnap {
  homeDa: number;
  awayDa: number;
}

interface PressureResult {
  score: number;               // composite pressure score
  level: "critical" | "elevated";
  label: string;               // human-readable alert text
  icons: string[];             // e.g. ["🔥", "🚨"]
  dominantTeam: string;        // team exerting the most pressure
}

/**
 * Pure pressure-score formula for a single team.
 * Formula (as specified):
 *   DA × 2  +  SoT × 3  +  Shots × 1
 *   + 2 if possession > 55%
 *   + 3 if recent DA spike ≥ 3 since last scan
 */
function calcTeamPressureScore(stats: TeamStats, prevDa: number): number {
  const possNum     = parseInt(stats.possession) || 0;
  const recentSpike = stats.dangerousAttacks - prevDa >= 3 ? 3 : 0;
  return (
    stats.dangerousAttacks * 2 +
    stats.shotsOnTarget    * 3 +
    stats.shots            * 1 +
    (possNum > 55 ? 2 : 0)    +
    recentSpike
  );
}

/** Returns a PressureResult if either team's score ≥ 12, otherwise null. */
function getPressureResult(
  match: EnrichedMatch,
  prevSnap: PressureSnap | undefined
): PressureResult | null {
  if (!match.stats) return null;

  // On first scan prevSnap is undefined → spike bonus = 0 (safe default)
  const prevHomeDa = prevSnap?.homeDa ?? match.stats.home.dangerousAttacks;
  const prevAwayDa = prevSnap?.awayDa ?? match.stats.away.dangerousAttacks;

  const homeScore = calcTeamPressureScore(match.stats.home, prevHomeDa);
  const awayScore = calcTeamPressureScore(match.stats.away, prevAwayDa);
  const topScore  = Math.max(homeScore, awayScore);
  const domTeam   = homeScore >= awayScore ? match.homeTeam : match.awayTeam;

  if (topScore < 12) return null;

  const icons: string[] = ["🔥"]; // always shown for score ≥ 12
  let level: PressureResult["level"];
  let label: string;

  if (topScore >= 18) {
    level = "critical";
    label = "Alta Probabilidade de Gol";
    icons.push("🚨");
  } else {
    level = "elevated";
    label = "Pressão de Gol Aumentando";
    icons.push("⚡");
  }

  return { score: topScore, level, label, icons, dominantTeam: domTeam };
}

/** Banner shown inside each LiveMatchCard when pressure score ≥ 12. */
function PressureAlertBanner({ result }: { result: PressureResult }) {
  const isCritical = result.level === "critical";
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-3 py-1.5 border-b",
      isCritical
        ? "bg-orange-500/10 border-orange-500/20"
        : "bg-yellow-500/[0.06] border-yellow-500/[0.12]"
    )}>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {result.icons.map((icon, i) => (
          <span
            key={i}
            className={cn("text-[12px] leading-none", isCritical && "animate-pulse")}
          >
            {icon}
          </span>
        ))}
      </div>
      <span className={cn(
        "text-[10px] font-bold tracking-wide",
        isCritical ? "text-orange-400" : "text-yellow-400/80"
      )}>
        {result.label}
      </span>
      <span className="ml-auto text-[8px] text-white/20 font-mono tabular-nums">
        {result.dominantTeam} · {result.score}pts
      </span>
    </div>
  );
}

/**
 * Scans all live matches every 10 s, tracks inter-scan DA spikes via a ref,
 * and returns a Map<fixtureId, PressureResult> for any match that qualifies.
 * Completely separate from the Opportunity Radar and calcGoalProbs.
 */
function usePressureScanner(matches: EnrichedMatch[]): Map<number, PressureResult> {
  const prevSnapsRef = useRef<Map<number, PressureSnap>>(new Map());
  const [results, setResults] = useState<Map<number, PressureResult>>(new Map());

  const runScan = useCallback(() => {
    const nextSnaps   = new Map<number, PressureSnap>();
    const nextResults = new Map<number, PressureResult>();

    for (const m of matches) {
      if (m.stats) {
        // Always update the snapshot (even if no pressure alert)
        nextSnaps.set(m.fixtureId, {
          homeDa: m.stats.home.dangerousAttacks,
          awayDa: m.stats.away.dangerousAttacks,
        });
        const result = getPressureResult(m, prevSnapsRef.current.get(m.fixtureId));
        if (result) nextResults.set(m.fixtureId, result);
      }
    }

    prevSnapsRef.current = nextSnaps;
    setResults(nextResults);
  }, [matches]);

  // Immediate scan on data change
  useEffect(() => { runScan(); }, [runScan]);

  // Independent 10 s interval for spike detection
  useEffect(() => {
    const id = setInterval(runScan, 10_000);
    return () => clearInterval(id);
  }, [runScan]);

  return results;
}

// ── Match Card (full) ──────────────────────────────────────────────────────────

function LiveMatchCard({ match, idx, pressureResult }: {
  match: EnrichedMatch;
  idx: number;
  pressureResult?: PressureResult;
}) {
  const [expanded, setExpanded] = useState(false);
  const label    = statusLabel(match.status, match.elapsed);
  const hasStats = !!match.stats;
  const total    = match.homeScore + match.awayScore;

  const goalProbs = useMemo(() => {
    if (!hasStats || match.elapsed === null || match.elapsed >= 88) return null;
    // Enhanced: Poisson baseline + stats-based pressure boost (calcEnhancedGoalProbs)
    // calcGoalProbs() is called internally — the Poisson model is untouched.
    return calcEnhancedGoalProbs(match.elapsed, match.matchGPI, total, match.stats);
  }, [hasStats, match.elapsed, match.matchGPI, total, match.stats]);

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

      {/* 🚨 Goal Alert Banner (GPI-based — existing logic untouched) */}
      {match.goalAlert && (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 border-b border-red-500/20">
          <span className="text-[11px] font-black text-red-400 animate-pulse tracking-wide">
            🚨 Gol Provável em Breve
          </span>
        </div>
      )}

      {/* 🔥 Pressure Alert Banner (score-based — AI Goal Pressure Detector) */}
      {pressureResult && (
        <PressureAlertBanner result={pressureResult} />
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

// ── PRO Live Goal Scanner ─────────────────────────────────────────────────────
// Uses a separate GPS (Goal Pressure Score) formula — independent from GPI,
// calcGoalProbs, detectOpportunities, and usePressureScanner.
// Data source: enriched matches already in memory (no extra API calls).
// Refreshes automatically whenever live data updates (every ~60 s via WS/poll).

type GoalPressureLevel = "very_high" | "high" | "moderate" | "none";

interface GoalScannerResult {
  fixtureId:    number;
  homeTeam:     string;
  awayTeam:     string;
  homeTeamLogo: string;
  awayTeamLogo: string;
  homeScore:    number;
  awayScore:    number;
  league:       string;
  leagueLogo:   string;
  elapsed:      number | null;
  status:       string;
  gps:          number;          // 0–100 Goal Pressure Score (may include momentum bonus)
  level:        GoalPressureLevel;
  levelLabel:   string;
  dominantTeam: string;          // team driving the highest pressure
  // Raw stats for the Attack Radar
  homeDA:    number;   awayDA:    number;   maxDA:    number;
  homeShots: number;   awayShots: number;   maxShots: number;
  homeSoT:   number;   awaySoT:   number;   maxSoT:   number;
  // Momentum (last-5-minute pressure filter)
  hasMomentum:   boolean;        // true when stats increased over last 5 polls
  momentumBonus: number;         // bonus points added to base GPS (0 if no momentum)
}

/** One row of the 5-minute momentum history (one entry ≈ one 60 s poll). */
interface MomentumSnapshot {
  fixtureId: number;
  sot:       number;   // total shots on target (home + away)
  shots:     number;   // total shots
  corners:   number;   // total corners
  da:        number;   // total dangerous attacks
}

/**
 * GPS formula (0–100):
 *   SoT × 35% + Shots × 20% + DA × 20% + Corners × 15% + Possession × 10%
 * Each component is normalised against a realistic max (SoT 8, Shots 15, DA 30, Corners 8).
 */
function calcTeamGPS(stats: TeamStats): number {
  const possNum = parseInt(stats.possession) || 0;
  return Math.min(100, Math.round(
    Math.min(35, (stats.shotsOnTarget              / 8)  * 35) +
    Math.min(20, (stats.shots                      / 15) * 20) +
    Math.min(20, ((stats.dangerousAttacks ?? 0)    / 30) * 20) +
    Math.min(15, (stats.corners                    / 8)  * 15) +
    (possNum / 100) * 10
  ));
}

/** Computes the full GPS for a match including context bonuses. */
function computeMatchGPS(match: EnrichedMatch): GoalScannerResult | null {
  if (!match.stats) return null;

  const homeBase      = calcTeamGPS(match.stats.home);
  const awayBase      = calcTeamGPS(match.stats.away);
  const dominantIsHome = homeBase >= awayBase;
  const dominantTeam  = dominantIsHome ? match.homeTeam : match.awayTeam;
  let gps             = Math.max(homeBase, awayBase);

  // ── Context factors (additive bonuses) ───────────────────────────────────
  // Factor 1: late game (minute > 60) → +5
  if (match.elapsed !== null && match.elapsed > 60) gps += 5;
  // Factor 2: one-goal margin (teams are fighting) → +3
  if (Math.abs(match.homeScore - match.awayScore) === 1) gps += 3;
  // Factor 3: losing team is the dominant attacker (motivation to equalise) → +4
  const homeIsLosing = match.homeScore < match.awayScore;
  const awayIsLosing = match.awayScore < match.homeScore;
  if ((dominantIsHome && homeIsLosing) || (!dominantIsHome && awayIsLosing)) gps += 4;

  gps = Math.min(100, gps);

  let level: GoalPressureLevel;
  let levelLabel: string;
  if      (gps >= 80) { level = "very_high"; levelLabel = "🔥 Probabilidade Muito Alta"; }
  else if (gps >= 70) { level = "high";      levelLabel = "Alta Probabilidade de Gol";   }
  else if (gps >= 60) { level = "moderate";  levelLabel = "Pressão Moderada";            }
  else                { level = "none";      levelLabel = "";                             }

  const homeDA    = match.stats.home.dangerousAttacks ?? 0;
  const awayDA    = match.stats.away.dangerousAttacks ?? 0;
  const homeShots = match.stats.home.shots;
  const awayShots = match.stats.away.shots;
  const homeSoT   = match.stats.home.shotsOnTarget;
  const awaySoT   = match.stats.away.shotsOnTarget;

  return {
    fixtureId: match.fixtureId, homeTeam: match.homeTeam, awayTeam: match.awayTeam,
    homeTeamLogo: match.homeTeamLogo, awayTeamLogo: match.awayTeamLogo,
    homeScore: match.homeScore, awayScore: match.awayScore,
    league: match.league, leagueLogo: match.leagueLogo,
    elapsed: match.elapsed, status: match.status,
    gps, level, levelLabel, dominantTeam,
    homeDA, awayDA, maxDA: Math.max(homeDA, awayDA, 1),
    homeShots, awayShots, maxShots: Math.max(homeShots, awayShots, 1),
    homeSoT, awaySoT, maxSoT: Math.max(homeSoT, awaySoT, 1),
    // Momentum fields start at zero; LiveGoalScanner applies the 5-minute pressure filter.
    hasMomentum: false, momentumBonus: 0,
  };
}

/** Dual horizontal bar comparing one stat between home and away team. */
function AttackRadar({
  label, home, away, max,
}: { label: string; home: number; away: number; max: number }) {
  const homePct = Math.round((home / max) * 100);
  const awayPct = Math.round((away / max) * 100);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[8px] text-white/20 w-14 text-right truncate flex-shrink-0 leading-none">
        {label}
      </span>
      {/* Home bar — grows right */}
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-400/60 transition-all duration-700"
          style={{ width: `${homePct}%` }}
        />
      </div>
      <div className="flex items-center gap-0.5 text-[8px] tabular-nums text-white/25 w-8 text-center flex-shrink-0">
        <span>{home}</span><span className="text-white/10">·</span><span>{away}</span>
      </div>
      {/* Away bar — grows left */}
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden flex justify-end">
        <div
          className="h-full rounded-full bg-purple-400/60 transition-all duration-700"
          style={{ width: `${awayPct}%` }}
        />
      </div>
    </div>
  );
}

/** Single scanner entry card. */
function ScannerCard({ result }: { result: GoalScannerResult }) {
  const label      = statusLabel(result.status, result.elapsed);
  const isAlert    = result.gps >= 75;
  const isHigh     = result.gps >= 70;
  const gpsColor   = result.gps >= 80 ? "text-red-400" : result.gps >= 70 ? "text-amber-400" : "text-yellow-400/80";
  const gpsBorder  = result.gps >= 80 ? "bg-red-500/10 border-red-500/25" : result.gps >= 70 ? "bg-amber-500/10 border-amber-500/25" : "bg-yellow-500/10 border-yellow-500/20";
  const barColor   = result.gps >= 80 ? "bg-red-500" : result.gps >= 70 ? "bg-amber-500" : "bg-yellow-500";

  return (
    <div className={cn(
      "rounded-xl border p-2.5 space-y-2",
      isHigh ? "border-amber-500/20 bg-amber-500/[0.03]" : "border-white/[0.07] bg-white/[0.02]"
    )}>
      {/* Alert + momentum row */}
      {(isAlert || result.hasMomentum) && (
        <div className="flex items-center gap-2">
          {isAlert && (
            <span className="text-[10px] font-black text-red-400 animate-pulse">🚨 Gol Possível em Breve</span>
          )}
          {result.hasMomentum && (
            <span
              className="text-[9px] font-bold text-emerald-400/90 ml-auto"
              title={`Pressão crescente nos últimos 5 minutos (+${result.momentumBonus} pts)`}
            >
              ⚡ momentum +{result.momentumBonus}
            </span>
          )}
        </div>
      )}

      {/* Match header */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1">
            {result.homeTeamLogo && (
              <img src={result.homeTeamLogo} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" loading="lazy" />
            )}
            <span className="text-[11px] font-semibold text-white truncate">{result.homeTeam}</span>
          </div>
          <div className="flex items-center gap-1">
            {result.awayTeamLogo && (
              <img src={result.awayTeamLogo} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" loading="lazy" />
            )}
            <span className="text-[11px] text-white/60 truncate">{result.awayTeam}</span>
          </div>
        </div>

        {/* Score + minute */}
        <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
          <span className="text-sm font-black text-white tabular-nums">
            {result.homeScore}–{result.awayScore}
          </span>
          <span className="text-[8.5px] text-red-400 font-bold tabular-nums">{label}</span>
        </div>

        {/* GPS badge */}
        <div className={cn("rounded-lg border px-2 py-1 text-center flex-shrink-0 min-w-[42px]", gpsBorder)}>
          <div className="text-[7px] text-white/25 uppercase tracking-wide leading-none mb-0.5">GPS</div>
          <div className={cn("text-sm font-black tabular-nums leading-none", gpsColor)}>{result.gps}</div>
        </div>
      </div>

      {/* Pressure level label */}
      {result.levelLabel && (
        <div className="text-[10px] text-white/40 leading-none">{result.levelLabel}</div>
      )}

      {/* GPS progress bar */}
      <div className="space-y-0.5">
        <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-700", barColor)}
            style={{ width: `${result.gps}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[7.5px] text-white/15">
          <span>Pressão de Gol</span>
          <span>{result.gps}/100</span>
        </div>
      </div>

      {/* Attack Radar */}
      <div className="space-y-1 pt-1 border-t border-white/[0.04]">
        <div className="flex items-center justify-between">
          <span className="text-[7.5px] text-white/15 uppercase tracking-widest">Radar de Ataque</span>
          <div className="flex items-center gap-2 text-[7px] text-white/15">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-sm bg-blue-400/50 inline-block" />
              {result.homeTeam.split(" ")[0]}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-sm bg-purple-400/50 inline-block" />
              {result.awayTeam.split(" ")[0]}
            </span>
          </div>
        </div>
        <AttackRadar label="At. Perigosos" home={result.homeDA}    away={result.awayDA}    max={result.maxDA}    />
        <AttackRadar label="Finalizações"  home={result.homeShots} away={result.awayShots} max={result.maxShots} />
        <AttackRadar label="No Alvo"       home={result.homeSoT}   away={result.awaySoT}   max={result.maxSoT}   />
      </div>
    </div>
  );
}

/**
 * PRO Live Goal Scanner — always visible; shows top 5 matches by GPS score (≥ 60).
 *
 * Momentum Filter (Last-5-Minute Pressure):
 *   Every time the match list updates (~60 s via WS/poll), the component snapshots
 *   the combined stats (SoT, shots, corners, DA) for each fixture.  We keep the last
 *   5 snapshots (≈ 5 minutes of data).  When all 5 snapshots are available, we compare
 *   the current stats against the oldest snapshot.  If any key stat increased, a bonus
 *   is added to the base GPS score:
 *     • Shots on Target  up → +4 pts
 *     • Dangerous Attacks up → +3 pts
 *     • Total Shots       up → +3 pts
 *     • Corners           up → +2 pts
 *   Max total momentum bonus: 12 pts (capped at 100).
 *
 * No extra API calls — all data comes from the already-enriched match list.
 */
function LiveGoalScanner({ matches }: { matches: EnrichedMatch[] }) {
  // Rolling buffer of up to 5 stat snapshots (one per ~60 s poll).
  // Key = fixtureId so we can look up per-match history efficiently.
  const historyRef = useRef<Map<number, MomentumSnapshot>[]>([]);

  // ── Snapshot current stats on every update ──────────────────────────────────
  useEffect(() => {
    if (matches.length === 0) return;
    const snap = new Map<number, MomentumSnapshot>(
      matches
        .filter(m => m.stats)
        .map(m => [
          m.fixtureId,
          {
            fixtureId: m.fixtureId,
            sot:       m.stats!.home.shotsOnTarget + m.stats!.away.shotsOnTarget,
            shots:     m.stats!.home.shots          + m.stats!.away.shots,
            corners:   m.stats!.home.corners        + m.stats!.away.corners,
            da:        (m.stats!.home.dangerousAttacks ?? 0) + (m.stats!.away.dangerousAttacks ?? 0),
          },
        ])
    );
    // Append new snapshot and keep only the last 5 (≈ 5 minutes)
    historyRef.current = [...historyRef.current, snap].slice(-5);
  }, [matches]);

  // ── Compute GPS + apply momentum bonus ──────────────────────────────────────
  const scanResults = useMemo<GoalScannerResult[]>(() => {
    const history = historyRef.current;
    // We need at least 2 snapshots to detect momentum (oldest vs current)
    const oldSnap  = history.length >= 2 ? history[0] : undefined;

    return matches
      .map(m => {
        const base = computeMatchGPS(m);
        if (!base || base.level === "none") return null;

        // ── Momentum bonus ─────────────────────────────────────────────────
        let momentumBonus = 0;
        if (oldSnap && m.stats) {
          const old = oldSnap.get(m.fixtureId);
          if (old) {
            const currSoT     = m.stats.home.shotsOnTarget + m.stats.away.shotsOnTarget;
            const currShots   = m.stats.home.shots          + m.stats.away.shots;
            const currCorners = m.stats.home.corners        + m.stats.away.corners;
            const currDA      = (m.stats.home.dangerousAttacks ?? 0) + (m.stats.away.dangerousAttacks ?? 0);

            if (currSoT     > old.sot)     momentumBonus += 4; // shots on target increased
            if (currDA      > old.da)      momentumBonus += 3; // dangerous attacks increased
            if (currShots   > old.shots)   momentumBonus += 3; // total shots increased
            if (currCorners > old.corners) momentumBonus += 2; // corners increased
          }
        }

        const boostedGps = Math.min(100, base.gps + momentumBonus);

        // Recompute level and label if GPS changed
        let level:      GoalPressureLevel;
        let levelLabel: string;
        if      (boostedGps >= 80) { level = "very_high"; levelLabel = "🔥 Probabilidade Muito Alta"; }
        else if (boostedGps >= 70) { level = "high";      levelLabel = "Alta Probabilidade de Gol";   }
        else if (boostedGps >= 60) { level = "moderate";  levelLabel = "Pressão Moderada";            }
        else                       { level = "none";      levelLabel = "";                             }

        // Re-filter: if the boost pushed a borderline match into a visible tier, keep it;
        // if momentum did nothing and base level is already "none" (< 60), still drop it.
        if (level === "none") return null;

        return {
          ...base,
          gps:          boostedGps,
          level,
          levelLabel,
          hasMomentum:  momentumBonus > 0,
          momentumBonus,
        } satisfies GoalScannerResult;
      })
      .filter((r): r is GoalScannerResult => r !== null)
      .sort((a, b) => b.gps - a.gps)
      .slice(0, 5); // top 5 as specified
  }, [matches]);  // history is a ref — no need to list it as dependency

  // ── Always render (never hide) ───────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.02] p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <span className="text-sm">🔥</span>
        <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">
          Scanner de Gols ao Vivo
        </span>
        <span className="ml-auto text-[8px] text-white/15 tabular-nums">
          {scanResults.length > 0 ? `top ${scanResults.length} · GPS 0–100` : "GPS 0–100"}
        </span>
      </div>

      {/* Cards — or empty state */}
      {scanResults.length > 0 ? (
        <div className="space-y-2">
          {scanResults.map(result => (
            <ScannerCard key={result.fixtureId} result={result} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-5 gap-1.5">
          <span className="text-lg opacity-40">⚽</span>
          <p className="text-[11px] text-white/30 text-center leading-snug">
            No strong goal opportunities detected right now.
          </p>
          <p className="text-[9px] text-white/15 text-center">
            Scanner updates every 60 s
          </p>
        </div>
      )}
    </div>
  );
}

// ── WebSocket hook ─────────────────────────────────────────────────────────────
/**
 * Connects to the live WebSocket server. When the server pushes a live:update
 * message, it writes the payload directly into the react-query cache, causing
 * an instant re-render with no extra HTTP request.
 *
 * Falls back to 15 s polling if the WebSocket cannot connect or is closed.
 */
function useLiveWebSocket(onUpdate: (data: LiveData) => void): boolean {
  const [connected, setConnected] = useState(false);
  const wsRef    = useRef<WebSocket | null>(null);
  const aliveRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stableOnUpdate = useCallback(onUpdate, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    aliveRef.current = true;

    function connect() {
      if (!aliveRef.current) return;
      try {
        const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
        const url   = `${proto}//${window.location.host}${BASE}/api/ws/live`;
        const ws    = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          console.log("[ws] connected to live updates");
        };

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data as string);
            if (msg.type === "live:update" && msg.data) {
              stableOnUpdate(msg.data as LiveData);
            }
          } catch { /* ignore malformed messages */ }
        };

        ws.onclose = () => {
          setConnected(false);
          if (aliveRef.current) {
            timerRef.current = setTimeout(connect, 5_000);
          }
        };

        ws.onerror = () => {
          setConnected(false);
          // onclose fires after onerror; reconnect is handled there
        };
      } catch {
        setConnected(false);
        if (aliveRef.current) {
          timerRef.current = setTimeout(connect, 5_000);
        }
      }
    }

    connect();

    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [stableOnUpdate]);

  return connected;
}

// ── Main Section ───────────────────────────────────────────────────────────────

export default function LiveMatchesSection() {
  const queryClient = useQueryClient();

  // WS → writes directly into the query cache for instant UI update
  const wsConnected = useLiveWebSocket(
    useCallback(
      (freshData: LiveData) => {
        queryClient.setQueryData(["live", "matches"], freshData);
      },
      [queryClient]
    )
  );

  const { data, isLoading, isError, dataUpdatedAt } = useQuery<LiveData>({
    queryKey: ["live", "matches"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/live/matches`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 55_000,
    gcTime: 5 * 60_000,
    // When WS is active the cache is kept fresh via push; fall back to 10 s polling if not
    refetchInterval: wsConnected ? 60_000 : 10_000,
    refetchIntervalInBackground: true,
    retry: 3,  // up to 3 retries on network/HTTP failure
  });

  const enrichedMatches = useMemo<EnrichedMatch[]>(() => {
    // Frontend safety filter — only render genuinely live statuses
    return (data?.matches ?? [])
      .filter(m => LIVE_STATUS_SET.has(m.status))
      .map(enrichMatch);
  }, [data?.matches]);

  // AI Goal Pressure Detector — runs every 10 s, returns pressure results per fixture
  const pressureResults = usePressureScanner(enrichedMatches);

  const hotMatches = useMemo<EnrichedMatch[]>(() => {
    return [...enrichedMatches]
      .filter(m => m.matchGPI > 0)
      .sort((a, b) => b.matchGPI - a.matchGPI)
      .slice(0, 5);
  }, [enrichedMatches]);

  // Is the cached data stale (> 90s since last frontend poll succeeded)?
  const isStaleData = dataUpdatedAt > 0 && (Date.now() - dataUpdatedAt) > 90_000;

  // ── Render guards ────────────────────────────────────────────────────────────
  // Case 1: First load with nothing cached yet — stay silent to avoid flash
  if (isLoading && !data) return null;

  // Case 2: No live matches right now (normal during off-peak hours) — hide section
  if (!isLoading && data?.available === true && data.matches.length === 0) return null;

  // Case 3: API unavailable or query failed after all retries — show reconnecting banner
  const showReconnecting = (isError && !data) || (!!data && !data.available);
  if (showReconnecting) {
    return (
      <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.02] p-3.5 flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0 inline-block" />
        <span className="text-[12px] text-white/40">Live data reconnecting...</span>
      </div>
    );
  }

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

        {/* WebSocket connection indicator */}
        <span
          className={cn(
            "flex items-center gap-1 text-[9px] ml-1",
            wsConnected ? "text-emerald-400/60" : "text-white/20"
          )}
          title={wsConnected ? "Conexão em tempo real ativa" : "Atualizações via polling (15s)"}
        >
          {wsConnected
            ? <Wifi    className="w-3 h-3" />
            : <WifiOff className="w-3 h-3" />
          }
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

      {/* ── 📡 Live Opportunity Radar ── */}
      {enrichedMatches.length > 0 && (
        <LiveOpportunityRadar matches={enrichedMatches} />
      )}

      {/* ── 🔥 PRO Live Goal Scanner ── */}
      <LiveGoalScanner matches={enrichedMatches} />

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
          <LiveMatchCard
            key={match.fixtureId}
            match={match}
            idx={i}
            pressureResult={pressureResults.get(match.fixtureId)}
          />
        ))}
      </div>

      {/* ── Recently Finished Matches ── */}
      {(data.finished?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pt-1">
            <div className="w-1.5 h-1.5 rounded-full bg-white/20 flex-shrink-0" />
            <span className="text-[11px] font-semibold text-white/30 uppercase tracking-widest">
              Partidas Encerradas
            </span>
            <span className="text-[10px] text-white/15">
              ({data.finished!.length})
            </span>
          </div>
          <div className="space-y-1">
            {data.finished!.map(m => (
              <div
                key={m.fixtureId}
                className="flex items-center gap-2 rounded-xl px-3 py-2 border border-white/[0.05] bg-white/[0.01] opacity-60"
              >
                {m.leagueLogo && (
                  <img src={m.leagueLogo} alt="" className="w-3.5 h-3.5 object-contain opacity-40 flex-shrink-0" loading="lazy" />
                )}
                <div className="flex-1 flex items-center justify-between min-w-0 gap-2">
                  <div className="flex items-center gap-1 min-w-0">
                    {m.homeTeamLogo && (
                      <img src={m.homeTeamLogo} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" loading="lazy" />
                    )}
                    <span className="text-[11px] text-white/50 truncate">{m.homeTeam}</span>
                  </div>
                  <span className="flex-shrink-0 text-xs font-black text-white/40 tabular-nums px-1.5">
                    {m.homeScore} – {m.awayScore}
                  </span>
                  <div className="flex items-center gap-1 min-w-0 justify-end">
                    <span className="text-[11px] text-white/50 truncate text-right">{m.awayTeam}</span>
                    {m.awayTeamLogo && (
                      <img src={m.awayTeamLogo} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" loading="lazy" />
                    )}
                  </div>
                </div>
                <span className="text-[9px] text-white/25 font-medium flex-shrink-0">
                  {finishedStatusLabel(m.status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
