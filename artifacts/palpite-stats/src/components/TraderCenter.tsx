import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Flame, Zap, AlertTriangle, Activity, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface TraderMatch {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  elapsed: number;
  status: string;
  homeTeamLogo: string;
  awayTeamLogo: string;
  league: string;
  goalPressureScore: number;
  homePressure: number;
  awayPressure: number;
  totalSoT: number;
  totalDA: number;
  totalShots: number;
  totalCorners: number;
  shotsDelta: number;
  attacksDelta: number;
  // Momentum signals
  signals: string[];
  signalCount: number;
  goalProb: number;
  alertLevel: 0 | 1 | 2 | 3;
  alertLabel: string;
  pressurePct: number;
  signal?: string;
}

interface TraderData {
  hotRanking: TraderMatch[];
  overSignals: TraderMatch[];
  goalAlerts: TraderMatch[];
  liveCount: number;
  ts: number;
}

function useTraderData() {
  return useQuery<TraderData>({
    queryKey: ["trader-center"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/trader`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 25 * 1000,
    refetchInterval: 30 * 1000,
    refetchIntervalInBackground: true,
    retry: 2,
  });
}

function TeamLogos({ home, away, homeLogo, awayLogo }: {
  home: string; away: string; homeLogo: string; awayLogo: string;
}) {
  return (
    <div className="flex items-center gap-1.5 min-w-0 flex-1">
      {homeLogo
        ? <img src={homeLogo} alt="" className="w-4 h-4 object-contain flex-shrink-0"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
        : null}
      <span className="text-[11px] font-semibold text-white truncate">{home}</span>
      <span className="text-zinc-700 flex-shrink-0 text-[10px]">×</span>
      <span className="text-[11px] font-semibold text-white truncate">{away}</span>
      {awayLogo
        ? <img src={awayLogo} alt="" className="w-4 h-4 object-contain flex-shrink-0"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
        : null}
    </div>
  );
}

function ScoreBadge({ home, away }: { home: number; away: number }) {
  return (
    <span className="text-[10px] font-black tabular-nums text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded flex-shrink-0">
      {home}–{away}
    </span>
  );
}

function MinuteBadge({ elapsed }: { elapsed: number }) {
  if (!elapsed) return null;
  return (
    <span className="text-[9px] text-zinc-600 flex-shrink-0 tabular-nums">{elapsed}'</span>
  );
}

// ── Module 1: Hot Ranking ─────────────────────────────────────────────────────
function HotRankingModule({ matches }: { matches: TraderMatch[] }) {
  if (matches.length === 0) return null;

  return (
    <div className="bg-[#0d0d0f] border border-white/[0.07] rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05] bg-gradient-to-r from-orange-500/[0.06] to-transparent">
        <Flame className="w-4 h-4 text-orange-400 flex-shrink-0" />
        <span className="text-sm font-bold text-white">Jogos Mais Quentes</span>
        <span className="ml-auto text-[9px] text-orange-400/60 bg-orange-500/10 border border-orange-500/15 px-1.5 py-0.5 rounded-full flex-shrink-0">
          AO VIVO
        </span>
      </div>

      <div className="divide-y divide-white/[0.035]">
        {matches.map((m, i) => (
          <Link key={m.fixtureId} href={`/fixture/${m.fixtureId}`}>
            <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors cursor-pointer group">
              {/* Rank badge */}
              <div className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0",
                i === 0 ? "bg-orange-400/20 text-orange-300"
                  : i === 1 ? "bg-zinc-400/15 text-zinc-400"
                  : i === 2 ? "bg-amber-700/20 text-amber-600"
                  : "bg-white/[0.04] text-zinc-700"
              )}>
                {i + 1}
              </div>

              <TeamLogos
                home={m.homeTeam} away={m.awayTeam}
                homeLogo={m.homeTeamLogo} awayLogo={m.awayTeamLogo}
              />

              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[10px] font-black text-orange-400 tabular-nums">
                    {m.goalPressureScore.toFixed(0)}
                    <span className="text-[8px] text-orange-400/50 ml-0.5 font-normal">pts</span>
                  </span>
                  <MinuteBadge elapsed={m.elapsed} />
                </div>
                <ScoreBadge home={m.homeScore} away={m.awayScore} />
                <ChevronRight className="w-3.5 h-3.5 text-zinc-800 group-hover:text-zinc-500 transition-colors" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Module 2: Over Scanner ────────────────────────────────────────────────────
function OverScannerModule({ signals }: { signals: TraderMatch[] }) {
  if (signals.length === 0) return null;

  return (
    <div className="bg-[#0d0d0f] border border-white/[0.07] rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05] bg-gradient-to-r from-blue-500/[0.06] to-transparent">
        <Zap className="w-4 h-4 text-blue-400 flex-shrink-0" />
        <span className="text-sm font-bold text-white">Scanner Over</span>
        <span className="ml-auto text-[9px] text-blue-400/60 bg-blue-500/10 border border-blue-500/15 px-1.5 py-0.5 rounded-full flex-shrink-0">
          {signals.length} sinal{signals.length !== 1 ? "is" : ""}
        </span>
      </div>

      <div className="divide-y divide-white/[0.035]">
        {signals.map(m => (
          <Link key={m.fixtureId} href={`/fixture/${m.fixtureId}`}>
            <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors cursor-pointer group">
              {/* Signal badge */}
              <span className={cn(
                "text-[9px] font-black px-2 py-1 rounded-lg flex-shrink-0 border",
                m.signal === "over_1_5"
                  ? "text-blue-300 bg-blue-500/10 border-blue-500/25"
                  : "text-sky-400 bg-sky-500/10 border-sky-500/20"
              )}>
                {m.signal === "over_1_5" ? "Over 1.5" : "Over 0.5"}
              </span>

              <TeamLogos
                home={m.homeTeam} away={m.awayTeam}
                homeLogo={m.homeTeamLogo} awayLogo={m.awayTeamLogo}
              />

              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[9px] text-zinc-500 tabular-nums">
                    SoT: <span className="text-zinc-300 font-semibold">{m.totalSoT}</span>
                  </span>
                  <MinuteBadge elapsed={m.elapsed} />
                </div>
                <ScoreBadge home={m.homeScore} away={m.awayScore} />
                <ChevronRight className="w-3.5 h-3.5 text-zinc-800 group-hover:text-zinc-500 transition-colors" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Module 3: Live Goal Scanner ───────────────────────────────────────────────

const ALERT_CONFIG = {
  3: { label: "🔥 Alerta de Gol",    border: "border-red-500/35",    header: "from-red-500/[0.10]",  labelCls: "text-red-300",    badge: "text-red-400 bg-red-500/10 border-red-500/20",    pulseBadge: true,  probCls: "text-red-400",    barCls: "bg-red-500" },
  2: { label: "⚡ Alta Pressão",      border: "border-orange-500/30", header: "from-orange-500/[0.08]", labelCls: "text-orange-300", badge: "text-orange-400 bg-orange-500/10 border-orange-500/20", pulseBadge: false, probCls: "text-orange-400", barCls: "bg-orange-500" },
  1: { label: "🌡️ Aquecendo",        border: "border-amber-500/25",  header: "from-amber-500/[0.06]",  labelCls: "text-amber-300",  badge: "text-amber-400 bg-amber-500/10 border-amber-500/20",   pulseBadge: false, probCls: "text-amber-400",  barCls: "bg-amber-500" },
} as const;

function AlertCard({ m }: { m: TraderMatch }) {
  const cfg = ALERT_CONFIG[m.alertLevel as 1 | 2 | 3];

  return (
    <Link href={`/fixture/${m.fixtureId}`}>
      <div className={cn(
        "rounded-xl border overflow-hidden cursor-pointer hover:brightness-110 transition-all",
        cfg.border,
        m.alertLevel === 3 && "shadow-[0_0_18px_rgba(239,68,68,0.10)]",
      )}>
        {/* Card header */}
        <div className={cn(
          "flex items-center justify-between px-3 py-2 bg-gradient-to-r to-transparent border-b",
          cfg.header,
          m.alertLevel === 3 ? "border-red-500/15" : m.alertLevel === 2 ? "border-orange-500/10" : "border-amber-500/10",
        )}>
          <span className={cn("text-[11px] font-bold", cfg.labelCls)}>{cfg.label}</span>
          <div className="flex items-center gap-2">
            <ScoreBadge home={m.homeScore} away={m.awayScore} />
            <span className={cn(
              "text-[9px] font-semibold px-1.5 py-0.5 rounded-full border tabular-nums",
              cfg.badge,
              cfg.pulseBadge && "animate-pulse",
            )}>
              {m.elapsed}'
            </span>
          </div>
        </div>

        {/* Match */}
        <div className="px-3 pt-2 pb-1">
          <TeamLogos
            home={m.homeTeam} away={m.awayTeam}
            homeLogo={m.homeTeamLogo} awayLogo={m.awayTeamLogo}
          />
        </div>

        {/* Signals list */}
        {m.signals.length > 0 && (
          <div className="px-3 pb-2">
            <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1">Sinais detectados</p>
            <ul className="space-y-0.5">
              {m.signals.map((s, i) => (
                <li key={i} className={cn("text-[10px] flex items-center gap-1", cfg.probCls, "opacity-80")}>
                  <span className="w-1 h-1 rounded-full bg-current flex-shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Goal probability bar */}
        <div className="px-3 pb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Probabilidade de gol</span>
            <span className={cn("text-[11px] font-black tabular-nums", cfg.probCls)}>{m.goalProb}%</span>
          </div>
          <div className="h-1 w-full bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-700", cfg.barCls)}
              style={{ width: `${m.goalProb}%` }}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}

function GoalAlertModule({ alerts }: { alerts: TraderMatch[] }) {
  if (alerts.length === 0) return null;

  const topAlerts = alerts.slice(0, 5); // cap at 5

  return (
    <div className="bg-[#0d0d0f] border border-white/[0.07] rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05] bg-gradient-to-r from-red-500/[0.06] to-transparent">
        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
        <span className="text-sm font-bold text-white">Live Goal Scanner</span>
        <span className="ml-auto text-[9px] text-red-400/80 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full animate-pulse flex-shrink-0">
          {topAlerts.length} alerta{topAlerts.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="p-3 flex flex-col gap-2">
        {topAlerts.map(m => <AlertCard key={m.fixtureId} m={m} />)}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function TraderCenter() {
  const { data, isLoading } = useTraderData();

  // Don't render anything if there are no live matches at all
  if (isLoading) return null;
  if (!data) return null;

  const { hotRanking, overSignals, goalAlerts, liveCount } = data;
  const hasContent = hotRanking.length > 0 || overSignals.length > 0 || goalAlerts.length > 0;
  if (!hasContent) return null;

  return (
    <div className="mb-8">
      {/* Section header */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.09]">
          <Activity className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-bold text-white tracking-tight">Central do Trader</span>
        </div>
        {liveCount > 0 && (
          <span className="text-[10px] text-zinc-600 tabular-nums">
            {liveCount} jogo{liveCount !== 1 ? "s" : ""} ao vivo
          </span>
        )}
      </div>

      {/* Modules stacked vertically */}
      <div className="flex flex-col gap-3">
        {goalAlerts.length > 0 && <GoalAlertModule alerts={goalAlerts} />}
        {hotRanking.length > 0 && <HotRankingModule matches={hotRanking} />}
        {overSignals.length > 0 && <OverScannerModule signals={overSignals} />}
      </div>
    </div>
  );
}
