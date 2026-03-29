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
  shotsDelta: number;
  attacksDelta: number;
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

// ── Module 3: Goal Alert ──────────────────────────────────────────────────────
function GoalAlertModule({ alerts }: { alerts: TraderMatch[] }) {
  if (alerts.length === 0) return null;

  return (
    <div className="bg-[#0d0d0f] border border-red-500/25 rounded-2xl overflow-hidden shadow-[0_0_20px_rgba(239,68,68,0.07)]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-red-500/15 bg-gradient-to-r from-red-500/[0.08] to-transparent">
        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
        <span className="text-sm font-bold text-red-300">Alerta de Gol</span>
        <span className="ml-auto text-[9px] text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full animate-pulse flex-shrink-0">
          🚨 PERIGO
        </span>
      </div>

      <div className="divide-y divide-red-500/[0.08]">
        {alerts.map(m => (
          <Link key={m.fixtureId} href={`/fixture/${m.fixtureId}`}>
            <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-red-500/[0.04] transition-colors cursor-pointer group">
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="text-[9px] text-red-400 font-semibold uppercase tracking-wider">
                  Possível gol em breve
                </div>
                <TeamLogos
                  home={m.homeTeam} away={m.awayTeam}
                  homeLogo={m.homeTeamLogo} awayLogo={m.awayTeamLogo}
                />
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[9px] text-red-400/70 tabular-nums">
                    +{m.shotsDelta} SoT · +{m.attacksDelta} DA
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
