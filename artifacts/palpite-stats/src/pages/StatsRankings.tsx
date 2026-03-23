import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Trophy,
  Target,
  CreditCard,
  TrendingUp,
  Loader2,
  AlertCircle,
  BarChart3,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const TABS = [
  { id: "league-goals",  label: "Gols por Liga",       icon: Trophy },
  { id: "team-corners",  label: "Escanteios",           icon: Target },
  { id: "team-cards",    label: "Cartões",              icon: CreditCard },
] as const;

type TabId = typeof TABS[number]["id"];

// ── Data hooks ────────────────────────────────────────────────────────────────

function useLeagueGoals() {
  return useQuery<{ available: boolean; leagues: LeagueGoalsRow[]; stale?: boolean }>({
    queryKey: ["rankings", "league-goals"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/rankings/league-goals`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });
}

function useTeamCorners() {
  return useQuery<{ available: boolean; teams: TeamCornersRow[]; source?: string }>({
    queryKey: ["rankings", "team-corners"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/rankings/team-corners`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 0,
  });
}

function useTeamCards() {
  return useQuery<{ available: boolean; teams: TeamCardsRow[]; source?: string }>({
    queryKey: ["rankings", "team-cards"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/rankings/team-cards`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 0,
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeagueGoalsRow {
  leagueId: number;
  leagueName: string;
  country: string;
  logo: string;
  flag: string;
  totalMatches: number;
  totalGoals: number;
  avgGoals: number;
}

interface TeamCornersRow {
  teamId: number;
  teamName: string;
  teamLogo: string;
  leagueId: number;
  leagueName: string;
  played: number;
  totalCorners: number;
  avgCorners: number;
}

interface TeamCardsRow {
  teamId: number;
  teamName: string;
  teamLogo: string;
  leagueId: number;
  leagueName: string;
  played: number;
  yellowCards: number;
  redCards: number;
  totalCards: number;
  avgCards: number;
}

// ── Shared UI pieces ──────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  const gold   = rank === 1;
  const silver = rank === 2;
  const bronze = rank === 3;
  return (
    <span className={cn(
      "inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-black flex-shrink-0",
      gold   && "bg-amber-400/20 text-amber-300 border border-amber-400/30",
      silver && "bg-zinc-400/15 text-zinc-300 border border-zinc-400/20",
      bronze && "bg-orange-700/20 text-orange-500 border border-orange-700/25",
      !gold && !silver && !bronze && "bg-white/[0.04] text-zinc-600 border border-white/[0.06]"
    )}>
      {rank}
    </span>
  );
}

function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] animate-pulse">
          <div className="w-6 h-6 rounded-full bg-white/[0.06]" />
          <div className="w-7 h-7 rounded-lg bg-white/[0.06]" />
          <div className="flex-1 h-3.5 bg-white/[0.06] rounded-full" />
          <div className="w-12 h-3.5 bg-white/[0.06] rounded-full" />
          <div className="w-10 h-3.5 bg-white/[0.06] rounded-full" />
          <div className="w-10 h-3.5 bg-white/[0.06] rounded-full" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
      <Info className="w-10 h-10 text-zinc-700" />
      <p className="text-zinc-500 text-sm max-w-xs leading-relaxed">{message}</p>
    </div>
  );
}

// ── Tab: League Goals ─────────────────────────────────────────────────────────

function LeagueGoalsTab() {
  const { data, isLoading, error } = useLeagueGoals();

  if (isLoading) return <TableSkeleton />;

  if (error || !data?.available || !data.leagues.length) {
    return (
      <EmptyState message="Dados de gols por liga não disponíveis no momento. Tente novamente em alguns minutos." />
    );
  }

  const max = data.leagues[0]?.avgGoals ?? 1;

  return (
    <div className="space-y-1.5">
      {/* Header */}
      <div className="hidden sm:grid grid-cols-[32px_1fr_80px_80px_80px] gap-3 px-3 pb-1 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">
        <span>#</span>
        <span>Liga / País</span>
        <span className="text-right">Jogos</span>
        <span className="text-right">Gols</span>
        <span className="text-right">Média</span>
      </div>

      {data.leagues.map((row, i) => (
        <div
          key={row.leagueId}
          className="grid grid-cols-[32px_1fr_auto] sm:grid-cols-[32px_1fr_80px_80px_80px] gap-3 items-center px-3 py-3 rounded-xl bg-white/[0.025] hover:bg-white/[0.04] border border-white/[0.05] hover:border-white/[0.10] transition-colors"
        >
          <RankBadge rank={i + 1} />

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative flex-shrink-0">
              {row.logo ? (
                <img src={row.logo} alt={row.leagueName} className="w-7 h-7 object-contain" loading="lazy"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <Trophy className="w-6 h-6 text-zinc-600" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">{row.leagueName}</div>
              <div className="flex items-center gap-1 mt-0.5">
                {row.flag && (
                  <img src={row.flag} alt={row.country} className="w-3.5 h-2.5 object-cover rounded-[2px] opacity-70" loading="lazy" />
                )}
                <span className="text-[10px] text-zinc-600 truncate">{row.country}</span>
              </div>
              {/* Progress bar (mobile) */}
              <div className="sm:hidden mt-1.5 flex items-center gap-2">
                <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${(row.avgGoals / max) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-black text-primary tabular-nums flex-shrink-0">{row.avgGoals.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <span className="hidden sm:block text-right text-xs text-zinc-500 tabular-nums">{row.totalMatches}</span>
          <span className="hidden sm:block text-right text-xs text-zinc-400 tabular-nums font-medium">{row.totalGoals}</span>

          {/* Average — highlighted */}
          <div className="flex flex-col items-end gap-1">
            <span className={cn(
              "text-base font-black tabular-nums",
              i === 0 ? "text-amber-300" : i <= 2 ? "text-primary" : "text-zinc-300"
            )}>
              {row.avgGoals.toFixed(2)}
            </span>
            <div className="hidden sm:block w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full", i === 0 ? "bg-amber-400" : "bg-primary")}
                style={{ width: `${(row.avgGoals / max) * 100}%` }}
              />
            </div>
          </div>
        </div>
      ))}

      {data.stale && (
        <p className="text-center text-[10px] text-zinc-700 pt-2">
          Dados desatualizados — API temporariamente indisponível
        </p>
      )}
    </div>
  );
}

// ── Tab: Team Corners ─────────────────────────────────────────────────────────

function TeamCornersTab() {
  const { data, isLoading } = useTeamCorners();

  if (isLoading) return <TableSkeleton />;

  if (!data?.available || !data.teams.length) {
    return (
      <EmptyState message="Os dados de escanteios são coletados automaticamente dos jogos que os usuários visitam. Acesse detalhes de partidas ao vivo para popular este ranking." />
    );
  }

  const max = data.teams[0]?.avgCorners ?? 1;

  return (
    <div className="space-y-1.5">
      <div className="hidden sm:grid grid-cols-[32px_1fr_72px_80px_80px] gap-3 px-3 pb-1 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">
        <span>#</span>
        <span>Time</span>
        <span className="text-right">Jogos</span>
        <span className="text-right">Total</span>
        <span className="text-right">Média</span>
      </div>

      {data.teams.map((row, i) => (
        <div
          key={row.teamId}
          className="grid grid-cols-[32px_1fr_auto] sm:grid-cols-[32px_1fr_72px_80px_80px] gap-3 items-center px-3 py-3 rounded-xl bg-white/[0.025] hover:bg-white/[0.04] border border-white/[0.05] hover:border-white/[0.10] transition-colors"
        >
          <RankBadge rank={i + 1} />

          <div className="flex items-center gap-2.5 min-w-0">
            {row.teamLogo ? (
              <img src={row.teamLogo} alt={row.teamName} className="w-7 h-7 object-contain flex-shrink-0" loading="lazy"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex-shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">{row.teamName}</div>
              {row.leagueName && (
                <div className="text-[10px] text-zinc-600 truncate">{row.leagueName}</div>
              )}
              {/* Mobile bar */}
              <div className="sm:hidden mt-1.5 flex items-center gap-2">
                <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(row.avgCorners / max) * 100}%` }} />
                </div>
                <span className="text-xs font-black text-blue-400 tabular-nums">{row.avgCorners.toFixed(1)}</span>
              </div>
            </div>
          </div>

          <span className="hidden sm:block text-right text-xs text-zinc-500 tabular-nums">{row.played}</span>
          <span className="hidden sm:block text-right text-xs text-zinc-400 tabular-nums font-medium">{row.totalCorners}</span>

          <div className="flex flex-col items-end gap-1">
            <span className={cn(
              "text-base font-black tabular-nums",
              i === 0 ? "text-amber-300" : i <= 2 ? "text-blue-400" : "text-zinc-300"
            )}>
              {row.avgCorners.toFixed(1)}
            </span>
            <div className="hidden sm:block w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full", i === 0 ? "bg-amber-400" : "bg-blue-500")}
                style={{ width: `${(row.avgCorners / max) * 100}%` }}
              />
            </div>
          </div>
        </div>
      ))}

      <p className="text-center text-[10px] text-zinc-700 pt-2">
        Baseado em {data.teams.reduce((s, t) => s + t.played, 0)} partidas visitadas · Atualiza em tempo real
      </p>
    </div>
  );
}

// ── Tab: Team Cards ───────────────────────────────────────────────────────────

function TeamCardsTab() {
  const { data, isLoading } = useTeamCards();

  if (isLoading) return <TableSkeleton />;

  if (!data?.available || !data.teams.length) {
    return (
      <EmptyState message="Os dados de cartões são coletados dos jogos visitados. Acesse detalhes de partidas para popular este ranking." />
    );
  }

  const max = data.teams[0]?.avgCards ?? 1;

  return (
    <div className="space-y-1.5">
      <div className="hidden sm:grid grid-cols-[32px_1fr_64px_56px_56px_80px] gap-3 px-3 pb-1 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">
        <span>#</span>
        <span>Time</span>
        <span className="text-right">Jogos</span>
        <span className="text-right text-amber-400">🟨</span>
        <span className="text-right text-red-400">🟥</span>
        <span className="text-right">Média</span>
      </div>

      {data.teams.map((row, i) => (
        <div
          key={row.teamId}
          className="grid grid-cols-[32px_1fr_auto] sm:grid-cols-[32px_1fr_64px_56px_56px_80px] gap-3 items-center px-3 py-3 rounded-xl bg-white/[0.025] hover:bg-white/[0.04] border border-white/[0.05] hover:border-white/[0.10] transition-colors"
        >
          <RankBadge rank={i + 1} />

          <div className="flex items-center gap-2.5 min-w-0">
            {row.teamLogo ? (
              <img src={row.teamLogo} alt={row.teamName} className="w-7 h-7 object-contain flex-shrink-0" loading="lazy"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex-shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">{row.teamName}</div>
              {row.leagueName && (
                <div className="text-[10px] text-zinc-600 truncate">{row.leagueName}</div>
              )}
              {/* Mobile card summary */}
              <div className="sm:hidden flex items-center gap-2 mt-1">
                <span className="flex items-center gap-0.5 text-[10px] text-amber-400 font-semibold">
                  <span className="text-[8px]">🟨</span>{row.yellowCards}
                </span>
                <span className="flex items-center gap-0.5 text-[10px] text-red-400 font-semibold">
                  <span className="text-[8px]">🟥</span>{row.redCards}
                </span>
                <span className="text-[10px] text-zinc-500">·</span>
                <span className="text-[10px] font-black text-rose-400">{row.avgCards.toFixed(2)}/j</span>
              </div>
            </div>
          </div>

          <span className="hidden sm:block text-right text-xs text-zinc-500 tabular-nums">{row.played}</span>
          <span className="hidden sm:block text-right text-xs text-amber-400 font-semibold tabular-nums">{row.yellowCards}</span>
          <span className="hidden sm:block text-right text-xs text-red-400 font-semibold tabular-nums">{row.redCards}</span>

          <div className="flex flex-col items-end gap-1">
            <span className={cn(
              "text-base font-black tabular-nums",
              i === 0 ? "text-amber-300" : i <= 2 ? "text-rose-400" : "text-zinc-300"
            )}>
              {row.avgCards.toFixed(2)}
            </span>
            <div className="hidden sm:block w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full", i === 0 ? "bg-amber-400" : "bg-rose-500")}
                style={{ width: `${(row.avgCards / max) * 100}%` }}
              />
            </div>
          </div>
        </div>
      ))}

      <p className="text-center text-[10px] text-zinc-700 pt-2">
        Baseado em {data.teams.reduce((s, t) => s + t.played, 0)} temporadas analisadas · Atualiza em tempo real
      </p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function StatsRankings() {
  const [activeTab, setActiveTab] = useState<TabId>("league-goals");

  return (
    <div className="container mx-auto px-4 md:px-6 py-8 max-w-3xl">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-black text-white">
            Rankings Estatísticos
          </h1>
        </div>
        <p className="text-sm text-zinc-500 ml-11">
          Dados reais de ligas e times — atualizados automaticamente
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-6 bg-white/[0.03] border border-white/[0.07] rounded-2xl p-1.5">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-semibold transition-all",
              activeTab === id
                ? "bg-primary text-white shadow-lg shadow-primary/20"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
            )}
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="hidden xs:inline sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab labels below for mobile (fallback) */}
      <div className="flex gap-1.5 mb-5 sm:hidden">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex-1 text-center text-[10px] font-semibold py-1 rounded-lg transition-colors",
              activeTab === id ? "text-primary" : "text-zinc-700"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "league-goals" && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-zinc-300">Ligas com Mais Gols</h2>
              <span className="text-[10px] text-zinc-700 bg-white/[0.04] px-2 py-0.5 rounded-full border border-white/[0.06]">
                Média por jogo · temporada 2024/25
              </span>
            </div>
            <LeagueGoalsTab />
          </div>
        )}

        {activeTab === "team-corners" && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-bold text-zinc-300">Times com Mais Escanteios</h2>
              <span className="text-[10px] text-zinc-700 bg-white/[0.04] px-2 py-0.5 rounded-full border border-white/[0.06]">
                Média por partida
              </span>
            </div>
            <TeamCornersTab />
          </div>
        )}

        {activeTab === "team-cards" && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="w-4 h-4 text-rose-400" />
              <h2 className="text-sm font-bold text-zinc-300">Times com Mais Cartões</h2>
              <span className="text-[10px] text-zinc-700 bg-white/[0.04] px-2 py-0.5 rounded-full border border-white/[0.06]">
                Média por jogo
              </span>
            </div>
            <TeamCardsTab />
          </div>
        )}
      </div>

      {/* Info footer */}
      <div className="mt-8 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-zinc-700 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-[11px] text-zinc-600">
            <strong className="text-zinc-500">Gols por liga:</strong> dados das últimas classificações das temporadas em andamento. Cache 30 minutos.
          </p>
          <p className="text-[11px] text-zinc-600">
            <strong className="text-zinc-500">Escanteios e cartões:</strong> calculados automaticamente a partir das partidas analisadas pelos utilizadores. Quanto mais jogos visitados, mais completo o ranking.
          </p>
        </div>
      </div>
    </div>
  );
}
