import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Trophy,
  Star,
  Target,
  Key,
  Loader2,
  AlertCircle,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface PlayerRow {
  id: number;
  rank: number;
  name: string;
  photo: string | null;
  teamName: string | null;
  teamLogo: string | null;
  leagueName: string | null;
  position: string | null;
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  keyPasses: number;
  rating: number | null;
}

interface TopPlayersResponse {
  available: boolean;
  scorers: PlayerRow[];
  assists: PlayerRow[];
  shots: PlayerRow[];
  keyPasses: PlayerRow[];
  stale?: boolean;
}

function useTopPlayers() {
  return useQuery<TopPlayersResponse>({
    queryKey: ["top-players-stats"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/top-players-stats`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 12 * 60 * 60 * 1000,
    retry: 1,
  });
}

const CATEGORIES = [
  { id: "scorers",   label: "Top Artilheiros",  icon: Trophy, key: "goals",     unit: "gols",       color: "text-primary" },
  { id: "assists",   label: "Top Assistências", icon: Star,   key: "assists",   unit: "assists",    color: "text-blue-400" },
  { id: "shots",     label: "Mais Chutes",      icon: Target, key: "shots",     unit: "chutes",     color: "text-amber-400" },
  { id: "keyPasses", label: "Passes-Chave",     icon: Key,    key: "keyPasses", unit: "pass-chave", color: "text-emerald-400" },
] as const;

type CategoryId = typeof CATEGORIES[number]["id"];

function RankBadge({ rank }: { rank: number }) {
  return (
    <span className={cn(
      "inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black flex-shrink-0",
      rank === 1 ? "bg-amber-400/20 text-amber-300 border border-amber-400/30" :
      rank === 2 ? "bg-zinc-400/15 text-zinc-300 border border-zinc-400/20" :
      rank === 3 ? "bg-orange-700/20 text-orange-500 border border-orange-700/25" :
      "bg-white/[0.03] text-zinc-600 border border-white/[0.06]"
    )}>
      {rank}
    </span>
  );
}

function PositionBadge({ pos }: { pos: string | null }) {
  if (!pos) return null;
  const colors: Record<string, string> = {
    Attacker: "text-red-400 bg-red-500/10 border-red-500/20",
    Midfielder: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    Defender: "text-green-400 bg-green-500/10 border-green-500/20",
    Goalkeeper: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  };
  const style = colors[pos] ?? "text-zinc-500 bg-white/[0.04] border-white/[0.07]";
  const short = pos === "Attacker" ? "AT" : pos === "Midfielder" ? "MF" : pos === "Defender" ? "DF" : pos === "Goalkeeper" ? "GK" : pos.slice(0, 2).toUpperCase();
  return (
    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${style}`}>{short}</span>
  );
}

function TableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white/[0.02] animate-pulse">
          <div className="w-6 h-6 rounded-full bg-white/[0.06]" />
          <div className="w-8 h-8 rounded-full bg-white/[0.06]" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-white/[0.06] rounded-full w-32" />
            <div className="h-2 bg-white/[0.04] rounded-full w-24" />
          </div>
          <div className="w-10 h-4 bg-white/[0.06] rounded-full" />
        </div>
      ))}
    </div>
  );
}

function PlayerList({ players, metricKey, unit, color }: {
  players: PlayerRow[];
  metricKey: keyof PlayerRow;
  unit: string;
  color: string;
}) {
  if (players.length === 0) {
    return (
      <div className="py-16 text-center">
        <AlertCircle className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
        <p className="text-zinc-600 text-sm">Nenhum dado disponível no momento</p>
        <p className="text-zinc-700 text-xs mt-1">Os dados serão carregados da API automaticamente</p>
      </div>
    );
  }

  const max = Math.max(...players.map(p => Number(p[metricKey]) ?? 0), 1);

  return (
    <div className="space-y-1.5">
      {players.map((player, i) => {
        const value = Number(player[metricKey]) ?? 0;
        return (
          <div
            key={player.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.025] hover:bg-white/[0.04] border border-white/[0.04] hover:border-white/[0.09] transition-colors"
          >
            <RankBadge rank={i + 1} />

            {/* Photo */}
            <div className="relative flex-shrink-0">
              {player.photo ? (
                <img
                  src={player.photo}
                  alt={player.name}
                  className="w-8 h-8 rounded-full object-cover border border-white/[0.08]"
                  loading="lazy"
                  onError={e => {
                    (e.target as HTMLImageElement).src =
                      "https://via.placeholder.com/40x40/1a1a2e/888?text=" + player.name.charAt(0);
                  }}
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center">
                  <Users className="w-4 h-4 text-zinc-700" />
                </div>
              )}
              {player.teamLogo && (
                <img
                  src={player.teamLogo}
                  alt={player.teamName ?? ""}
                  className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 object-contain rounded-full bg-[#0a0a0c] border border-white/[0.08]"
                  loading="lazy"
                />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-white truncate">{player.name}</span>
                <PositionBadge pos={player.position} />
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] text-zinc-600 truncate">
                  {player.teamName}
                  {player.leagueName && <span className="text-zinc-700"> · {player.leagueName}</span>}
                </span>
              </div>
              {/* Mini progress bar (mobile) */}
              <div className="mt-1.5 sm:hidden">
                <div className="h-0.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full", color.replace("text-", "bg-"))} style={{ width: `${(value / max) * 100}%` }} />
                </div>
              </div>
            </div>

            {/* Desktop bar + value */}
            <div className="hidden sm:flex items-center gap-2 flex-shrink-0 w-32">
              <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full", color.replace("text-", "bg-"))}
                  style={{ width: `${(value / max) * 100}%` }}
                />
              </div>
            </div>

            {/* Value */}
            <div className="flex flex-col items-end flex-shrink-0">
              <span className={cn("text-lg font-black tabular-nums leading-none", i < 3 ? color : "text-zinc-300")}>
                {value}
              </span>
              <span className="text-[9px] text-zinc-700 mt-0.5">{unit}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TopPlayers() {
  const [activeCategory, setActiveCategory] = useState<CategoryId>("scorers");
  const { data, isLoading, error } = useTopPlayers();

  const current = CATEGORIES.find(c => c.id === activeCategory)!;
  const players = data?.[activeCategory as keyof typeof data] as PlayerRow[] | undefined ?? [];

  return (
    <div className="container mx-auto px-4 md:px-6 py-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-black text-white">Top Jogadores</h1>
        </div>
        <p className="text-sm text-zinc-500 ml-11">
          Mínimo 300 minutos jogados · Temporada atual · Premier League, Brasileirão, La Liga
        </p>
      </div>

      {/* Category tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        {CATEGORIES.map(({ id, label, icon: Icon, color }) => (
          <button
            key={id}
            onClick={() => setActiveCategory(id)}
            className={cn(
              "flex items-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all border",
              activeCategory === id
                ? `bg-white/[0.07] border-white/[0.12] ${color}`
                : "text-zinc-600 bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.04] hover:text-zinc-400"
            )}
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <TableSkeleton />
      ) : error || !data?.available ? (
        <div className="py-16 text-center space-y-3">
          <AlertCircle className="w-12 h-12 text-zinc-700 mx-auto" />
          <p className="text-zinc-500 font-medium">Dados indisponíveis no momento</p>
          <p className="text-zinc-700 text-xs max-w-xs mx-auto leading-relaxed">
            {error ? "Erro ao carregar dados dos jogadores. Tente novamente em alguns minutos." : "A API está temporariamente indisponível. Os dados serão carregados automaticamente."}
          </p>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <current.icon className={cn("w-4 h-4", current.color)} />
            <h2 className="text-sm font-bold text-zinc-300">{current.label}</h2>
            <span className="text-[10px] text-zinc-700 bg-white/[0.04] px-2 py-0.5 rounded-full border border-white/[0.06] ml-auto">
              Top {players.length}
            </span>
          </div>
          <PlayerList
            players={players}
            metricKey={current.key as keyof PlayerRow}
            unit={current.unit}
            color={current.color}
          />
        </div>
      )}

      {/* Stale indicator */}
      {data?.stale && (
        <p className="text-center text-[10px] text-zinc-700 mt-4">
          Dados em cache — API temporariamente indisponível
        </p>
      )}

      {/* Data source footer */}
      <div className="mt-8 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-start gap-3">
        <TrendingUp className="w-4 h-4 text-zinc-700 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-zinc-600 leading-relaxed">
          Dados reais de artilharia e assistências das principais ligas. Atualizado a cada 6 horas. Mínimo 300 minutos em campo. Exclui temporadas anteriores.
        </p>
      </div>
    </div>
  );
}
