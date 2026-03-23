import { useGetMatches } from "@workspace/api-client-react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import {
  Activity,
  ChevronRight,
  ChevronDown,
  Clock,
  Trophy,
  Target,
  Globe,
  RefreshCw,
  Flame,
  CheckCircle2,
  Radio,
  Filter,
  Loader2,
  Search,
  X,
  MapPin,
} from "lucide-react";
import { cn, formatProbability } from "@/lib/utils";
import { MatchInsights } from "@/components/MatchInsights";
import { sortMatchesByLeague } from "@/lib/leaguePriority";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface LiveMatch {
  id: number;
  date: string;
  status: { short: string; long: string; elapsed: number | null };
  league: { id: number; name: string; country: string; logo: string; flag: string; round: string };
  homeTeam: { id: number; name: string; logo: string; winner: boolean | null };
  awayTeam: { id: number; name: string; logo: string; winner: boolean | null };
  score: { home: number | null; away: number | null };
}

interface TodayMatchesResponse {
  total: number;
  matches: LiveMatch[];
  demo: boolean;
  stale?: boolean;
  isUpcoming?: boolean;
  apiStatus?: string;
}

interface LeagueGroup {
  league: LiveMatch["league"];
  matches: LiveMatch[];
}

interface CountryGroup {
  country: string;
  flag: string;
  leagues: LeagueGroup[];
}

const today = new Date().toISOString().split("T")[0];

const LIVE_STATUSES = new Set(["1H", "2H", "ET", "HT", "P", "BT"]);

function useTodayMatches() {
  return useQuery<TodayMatchesResponse>({
    queryKey: ["matches-today", today],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/matches-today`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      console.log("[Home] Fixtures response:", {
        total: data.total,
        isUpcoming: data.isUpcoming,
        apiStatus: data.apiStatus,
        stale: data.stale,
        firstMatch: data.matches?.[0]?.homeTeam?.name,
      });
      return data;
    },
    staleTime: 60 * 1000,               // 1 minute – allows frequent live refresh
    gcTime: 15 * 60 * 1000,
    refetchInterval: (query) => {
      if (query.state.status === "error") return 15 * 1000;
      const d = query.state.data as TodayMatchesResponse | undefined;
      if (!d || d.total === 0) return 10 * 1000;       // 10s retry when empty
      const hasLive = d.matches.some(m => LIVE_STATUSES.has(m.status.short));
      return hasLive ? 60 * 1000 : 5 * 60 * 1000;     // 60s live / 5min otherwise
    },
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    retry: 3,
    retryDelay: 10 * 1000,
    placeholderData: keepPreviousData,
  });
}

interface PreliveResponse {
  total: number;
  matches: LiveMatch[];
  available: boolean;
  message?: string;
  leaguesFound?: number[];
  leaguesMissing?: number[];
}

function usePreliveMatches() {
  return useQuery<PreliveResponse>({
    queryKey: ["prelive-matches"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/prelive-matches`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,        // 5 min – top-league upcoming data changes slowly
    gcTime: 30 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,  // re-fetch every 5 min in background
    refetchIntervalInBackground: true,
    retry: 2,
    retryDelay: 15 * 1000,
  });
}

interface FeaturedBet {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string;
  awayLogo: string;
  league: { id: number; name: string; country: string; logo: string };
  date: string;
  market: string;
  probability: number;
  confidence: "High" | "Medium" | "Low";
  marketRating: string;
  insight: string;
}

interface HotMatchItem {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string;
  awayLogo: string;
  league: { id: number; name: string; country: string; logo: string };
  date: string;
  avgGoals: number | null;
  reason: string;
  hotScore: number;
}

function useTopBets() {
  return useQuery<{ available: boolean; bets: FeaturedBet[] }>({
    queryKey: ["top-bets"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/top-bets`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    retry: 2,
  });
}

function useHotMatches() {
  return useQuery<{ available: boolean; matches: HotMatchItem[] }>({
    queryKey: ["hot-matches"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/hot-matches`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    retry: 2,
  });
}

function confidenceColor(c: FeaturedBet["confidence"]) {
  return c === "High" ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/25"
    : c === "Medium" ? "text-amber-400 bg-amber-400/10 border-amber-400/25"
    : "text-zinc-400 bg-zinc-400/10 border-zinc-400/20";
}

function ConfidenceDots({ level }: { level: FeaturedBet["confidence"] }) {
  const dots = level === "High" ? 3 : level === "Medium" ? 2 : 1;
  const color = level === "High" ? "bg-emerald-400" : level === "Medium" ? "bg-amber-400" : "bg-zinc-500";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3].map(i => (
        <span key={i} className={cn("w-1.5 h-1.5 rounded-full", i <= dots ? color : "bg-zinc-800")} />
      ))}
    </div>
  );
}

function ProbabilityRing({ value }: { value: number }) {
  const color = value >= 76 ? "text-emerald-400" : value >= 61 ? "text-amber-400" : "text-blue-400";
  const barColor = value >= 76 ? "bg-emerald-500" : value >= 61 ? "bg-amber-500" : "bg-blue-500";
  return (
    <div className="flex flex-col items-end gap-1">
      <div className={`text-2xl font-black tabular-nums leading-none ${color}`}>{value}%</div>
      <div className="w-14 h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function HotScoreFlames({ score }: { score: number }) {
  const flames = score >= 80 ? 3 : score >= 60 ? 2 : 1;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3].map(i => (
        <span key={i} className={cn("text-[11px]", i <= flames ? "opacity-100" : "opacity-20")}>🔥</span>
      ))}
    </div>
  );
}

function kickoffTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return format(d, "HH:mm");
  } catch {
    return "";
  }
}

function TeamLogoName({ logo, name }: { logo: string; name: string }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {logo ? (
        <img src={logo} alt={name} className="w-5 h-5 object-contain flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
      ) : null}
      <span className="text-xs font-semibold text-white truncate">{name}</span>
    </div>
  );
}

function TopBetsSection() {
  const { data, isLoading } = useTopBets();
  const bets = data?.bets ?? [];

  if (isLoading) return (
    <div className="flex items-center gap-2 text-zinc-600 text-xs py-4">
      <Loader2 className="w-4 h-4 animate-spin" />
      Calculando melhores apostas...
    </div>
  );
  if (!data?.available || bets.length === 0) return null;

  return (
    <div className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <Flame className="w-5 h-5 text-orange-400" />
        <h2 className="text-lg font-display font-bold text-white">Top 3 Apostas do Dia</h2>
        <span className="text-xs text-zinc-600 bg-white/[0.04] px-2 py-0.5 rounded-full border border-white/[0.07]">
          Análise AI · dados reais
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {bets.map((bet, i) => (
          <div key={bet.fixtureId} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] overflow-hidden hover:border-white/[0.14] transition-colors">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500/10 to-amber-500/5 px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {bet.league.logo && (
                  <img src={bet.league.logo} alt={bet.league.name} className="w-4 h-4 object-contain flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                )}
                <span className="text-[10px] text-zinc-400 truncate">{bet.league.name}</span>
              </div>
              <span className="text-[10px] text-orange-400 font-bold flex-shrink-0">#{i + 1}</span>
            </div>

            <div className="px-4 py-3 space-y-3">
              {/* Teams + kickoff time */}
              <div className="space-y-1.5">
                <TeamLogoName logo={bet.homeLogo} name={bet.homeTeam} />
                <div className="text-[9px] text-zinc-700 pl-1">vs</div>
                <TeamLogoName logo={bet.awayLogo} name={bet.awayTeam} />
                {bet.date && (
                  <div className="flex items-center gap-1 pt-0.5">
                    <Clock className="w-2.5 h-2.5 text-zinc-700" />
                    <span className="text-[9px] text-zinc-700 tabular-nums">{kickoffTime(bet.date)}</span>
                  </div>
                )}
              </div>

              {/* Market + Probability */}
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5 space-y-1.5">
                <div className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold">Previsão</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-white leading-tight">{bet.market}</span>
                  <ProbabilityRing value={bet.probability} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${confidenceColor(bet.confidence)}`}>
                    {bet.marketRating}
                  </span>
                  <ConfidenceDots level={bet.confidence} />
                </div>
              </div>

              {/* Insight */}
              <p className="text-[10px] text-zinc-500 leading-relaxed">{bet.insight}</p>

              {/* Affiliate buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/[0.05]">
                <a
                  href="https://referme.to/pedroa-6161"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1 rounded-lg bg-[#e63946]/15 border border-[#e63946]/30 hover:bg-[#e63946]/25 px-2 py-1.5 transition-colors"
                >
                  <span className="text-[10px] font-semibold text-[#e63946]">Apostar Betano</span>
                </a>
                <a
                  href="https://promos.betfair.bet.br/choose-your-refer-and-earn-offer?referrerCode=PAXVX77DL"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1 rounded-lg bg-[#f9a825]/10 border border-[#f9a825]/25 hover:bg-[#f9a825]/20 px-2 py-1.5 transition-colors"
                >
                  <span className="text-[10px] font-semibold text-[#f9a825]">Ver Betfair</span>
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HotMatchesSection() {
  const { data, isLoading } = useHotMatches();
  const matches = data?.matches ?? [];

  if (isLoading) return (
    <div className="flex items-center gap-2 text-zinc-600 text-xs py-2">
      <Loader2 className="w-4 h-4 animate-spin" />
      Carregando jogos quentes...
    </div>
  );
  if (!data?.available || matches.length === 0) return null;

  return (
    <div className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-5 h-5 text-red-400" />
        <h2 className="text-lg font-display font-bold text-white">Jogos Quentes do Dia</h2>
        <span className="text-xs text-zinc-600 bg-white/[0.04] px-2 py-0.5 rounded-full border border-white/[0.07]">
          Principais ligas
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {matches.map(m => (
          <Link key={m.fixtureId} href={`/fixture/${m.fixtureId}`}>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3 flex items-center gap-4 hover:border-white/[0.14] hover:bg-white/[0.04] transition-all cursor-pointer group">
              {/* League + time */}
              <div className="flex flex-col gap-0.5 w-28 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  {m.league.logo && (
                    <img src={m.league.logo} alt={m.league.name} className="w-3.5 h-3.5 object-contain flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  )}
                  <span className="text-[9px] text-zinc-600 truncate">{m.league.name}</span>
                </div>
                {m.date && (
                  <span className="text-[9px] text-zinc-700 tabular-nums pl-0.5">{kickoffTime(m.date)}</span>
                )}
              </div>

              {/* Teams + reason */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <TeamLogoName logo={m.homeLogo} name={m.homeTeam} />
                  <span className="text-zinc-700 text-[10px] flex-shrink-0">×</span>
                  <TeamLogoName logo={m.awayLogo} name={m.awayTeam} />
                </div>
                {m.reason && (
                  <p className="text-[9px] text-zinc-600 truncate">{m.reason}</p>
                )}
              </div>

              {/* Hot score + avg goals */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="flex flex-col items-end gap-0.5">
                  <HotScoreFlames score={m.hotScore} />
                  {m.avgGoals !== null && (
                    <div className="text-right">
                      <div className="text-[8px] text-zinc-700 uppercase tracking-wider">xG média</div>
                      <div className="text-xs font-bold text-amber-400 tabular-nums">{m.avgGoals.toFixed(1)}</div>
                    </div>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-800 group-hover:text-zinc-500 transition-colors" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function isLiveStatus(short: string) {
  return LIVE_STATUSES.has(short);
}
function isFinishedStatus(short: string) {
  return ["FT", "AET", "PEN"].includes(short);
}

function groupByLeague(matches: LiveMatch[]): LeagueGroup[] {
  const map = new Map<number, LeagueGroup>();
  for (const m of matches) {
    if (!map.has(m.league.id)) {
      map.set(m.league.id, { league: m.league, matches: [] });
    }
    map.get(m.league.id)!.matches.push(m);
  }
  return Array.from(map.values());
}

function groupByCountry(groups: LeagueGroup[]): CountryGroup[] {
  const map = new Map<string, CountryGroup>();
  for (const g of groups) {
    const key = g.league.country || "International";
    if (!map.has(key)) {
      map.set(key, { country: key, flag: g.league.flag ?? "", leagues: [] });
    }
    map.get(key)!.leagues.push(g);
  }
  return Array.from(map.values());
}

function MatchCard({ match, idx }: { match: LiveMatch; idx: number }) {
  const isLive = isLiveStatus(match.status.short);
  const isFinished = isFinishedStatus(match.status.short);
  const hasScore = match.score.home !== null && match.score.away !== null;
  const hasValidId = match.id != null && !isNaN(Number(match.id));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.5) }}
    >
      <Link
        href={hasValidId ? `/fixture/${match.id}` : "#"}
        onClick={!hasValidId ? (e) => e.preventDefault() : undefined}
        className={cn("block group", !hasValidId && "pointer-events-none opacity-60")}
      >
        <div
          className={cn(
            "relative flex flex-col rounded-xl overflow-hidden border transition-all duration-300 cursor-pointer",
            "bg-[#09090b] shadow-xl shadow-black/60",
            isLive
              ? "border-red-500/30 group-hover:border-red-500/55 shadow-red-950/20"
              : isFinished
              ? "border-white/[0.07] group-hover:border-white/[0.16]"
              : "border-white/[0.06] group-hover:border-primary/25"
          )}
        >
          {isLive && (
            <div className="absolute inset-0 bg-gradient-to-br from-red-950/12 via-transparent to-transparent pointer-events-none" />
          )}

          {/* Status + time */}
          <div className="flex items-center justify-between px-3.5 pt-3 pb-2.5 border-b border-white/[0.05]">
            <span className="text-[9.5px] text-zinc-600 uppercase tracking-wider font-medium truncate max-w-[120px]">
              {match.league.round}
            </span>
            <div className="flex-shrink-0 ml-2">
              {isLive ? (
                <span className="flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white shadow-md shadow-red-500/30 ring-1 ring-red-400/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  {match.status.elapsed ? `${match.status.elapsed}'` : "LIVE"}
                </span>
              ) : isFinished ? (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-zinc-700/80 text-zinc-300 border border-zinc-600/25">
                  FT
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-400 border border-white/[0.07]">
                  <Clock className="w-3 h-3" />
                  {format(new Date(match.date), "HH:mm")}
                </span>
              )}
            </div>
          </div>

          {/* Teams & Score */}
          <div className="flex items-center justify-between gap-2 px-3.5 py-4">
            {/* Home */}
            <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
              <div
                className={cn(
                  "w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0",
                  "bg-white/[0.04] border border-white/[0.08]",
                  match.homeTeam.winner === true && "ring-2 ring-primary/50 ring-offset-1 ring-offset-[#09090b]"
                )}
              >
                {match.homeTeam.logo ? (
                  <img src={match.homeTeam.logo} alt={match.homeTeam.name} loading="lazy" className="w-8 h-8 object-contain" />
                ) : (
                  <Trophy className="w-4 h-4 text-zinc-500" />
                )}
              </div>
              <span className={cn("text-[10.5px] font-semibold text-center leading-tight line-clamp-2 w-full", match.homeTeam.winner === true ? "text-white" : "text-zinc-300")}>
                {match.homeTeam.name}
              </span>
            </div>

            {/* Score / VS */}
            <div className="flex flex-col items-center gap-0.5 flex-shrink-0 px-1">
              {hasScore ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className={cn("font-display font-black text-[1.85rem] leading-none tabular-nums", match.homeTeam.winner === true ? "text-white" : "text-zinc-100")}>
                      {match.score.home}
                    </span>
                    <span className="text-zinc-700 font-bold text-base">–</span>
                    <span className={cn("font-display font-black text-[1.85rem] leading-none tabular-nums", match.awayTeam.winner === true ? "text-white" : "text-zinc-100")}>
                      {match.score.away}
                    </span>
                  </div>
                  {isLive && (
                    <span className="text-[9.5px] text-red-400 font-semibold tabular-nums">
                      {match.status.elapsed ? `${match.status.elapsed}'` : "●"}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-zinc-600 font-bold text-xs uppercase tracking-widest px-2">VS</span>
              )}
            </div>

            {/* Away */}
            <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
              <div
                className={cn(
                  "w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0",
                  "bg-white/[0.04] border border-white/[0.08]",
                  match.awayTeam.winner === true && "ring-2 ring-primary/50 ring-offset-1 ring-offset-[#09090b]"
                )}
              >
                {match.awayTeam.logo ? (
                  <img src={match.awayTeam.logo} alt={match.awayTeam.name} loading="lazy" className="w-8 h-8 object-contain" />
                ) : (
                  <Trophy className="w-4 h-4 text-zinc-500" />
                )}
              </div>
              <span className={cn("text-[10.5px] font-semibold text-center leading-tight line-clamp-2 w-full", match.awayTeam.winner === true ? "text-white" : "text-zinc-300")}>
                {match.awayTeam.name}
              </span>
            </div>
          </div>

          {/* Odds & AI (expandable) */}
          <MatchInsights
            fixtureId={match.id}
            homeTeamId={match.homeTeam.id}
            awayTeamId={match.awayTeam.id}
            leagueId={match.league.id}
            homeTeamName={match.homeTeam.name}
            awayTeamName={match.awayTeam.name}
          />

          <div className="px-3.5 pb-2.5 pt-1 flex justify-center">
            <span className="text-[9px] text-zinc-700 group-hover:text-zinc-500 font-medium transition-colors flex items-center gap-1">
              Full analysis <ChevronRight className="w-2.5 h-2.5" />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function LeagueSection({ group, startIdx }: { group: LeagueGroup; startIdx: number }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="mb-3">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-zinc-900/70 hover:bg-zinc-900 rounded-xl border border-white/[0.07] transition-colors group"
      >
        {group.league.logo ? (
          <img src={group.league.logo} alt="" loading="lazy" className="w-5 h-5 object-contain opacity-90 flex-shrink-0" />
        ) : (
          <Globe className="w-4 h-4 text-zinc-500 flex-shrink-0" />
        )}
        <span className="text-[11.5px] font-bold text-zinc-200 uppercase tracking-wide flex-1 text-left">
          {group.league.name}
        </span>
        {group.league.flag ? (
          <img src={group.league.flag} alt={group.league.country} loading="lazy" className="w-4 h-3 object-cover rounded-[2px] opacity-70 hidden sm:block flex-shrink-0" />
        ) : group.league.country ? (
          <span className="text-[10px] text-zinc-600 font-medium hidden sm:block">{group.league.country}</span>
        ) : null}
        <span className="text-[11px] font-bold text-zinc-500 tabular-nums ml-1">
          ({group.matches.length})
        </span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-zinc-600 transition-transform flex-shrink-0", collapsed && "rotate-180")} />
      </button>

      <motion.div
        initial={false}
        animate={collapsed ? { height: 0, opacity: 0 } : { height: "auto", opacity: 1 }}
        transition={{ duration: 0.22 }}
        className="overflow-hidden"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2.5 pb-1">
          {group.matches.map((match, i) => (
            <MatchCard key={match.id} match={match} idx={startIdx + i} />
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function SectionDivider({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="flex items-center gap-3 my-6">
      <div className="flex-1 h-px bg-white/[0.07]" />
      <span className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">
        {icon}
        {label}
        <span className="text-zinc-700 font-semibold">({count})</span>
      </span>
      <div className="flex-1 h-px bg-white/[0.07]" />
    </div>
  );
}

function CountrySection({ cg, startIdx }: { cg: CountryGroup; startIdx: number }) {
  const [open, setOpen] = useState(true);
  const total = cg.leagues.reduce((s, g) => s + g.matches.length, 0);
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/[0.03] transition-colors group"
      >
        {cg.flag ? (
          <img src={cg.flag} alt={cg.country} loading="lazy" className="w-5 h-3.5 object-cover rounded-[2px] flex-shrink-0 opacity-80" />
        ) : (
          <MapPin className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
        )}
        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex-1 text-left">{cg.country}</span>
        <span className="text-[10px] text-zinc-700 tabular-nums">({total})</span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-zinc-700 transition-transform flex-shrink-0", open && "rotate-180")} />
      </button>
      {open && (
        <div className="pl-1">
          {cg.leagues.map((group, i) => (
            <LeagueSection key={group.league.id} group={group} startIdx={startIdx + i * 3} />
          ))}
        </div>
      )}
    </div>
  );
}

const ALL_LEAGUES = "all";
const ALL_DATES   = "all";

/** Returns YYYY-MM-DD for a match */
function matchDay(m: LiveMatch) {
  return m.date.slice(0, 10);
}

/** Readable label for a date string (YYYY-MM-DD) relative to today */
function dateLabel(d: string): string {
  const todayStr = new Date().toISOString().slice(0, 10);
  const diff = Math.round((new Date(d).getTime() - new Date(todayStr).getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return format(new Date(d + "T12:00:00"), "EEE d MMM");
}

export default function Home() {
  const todayFormatted = format(new Date(), "yyyy-MM-dd");
  const { data: dbMatches, isLoading: dbLoading, error: dbError } = useGetMatches({ date: todayFormatted });
  const {
    data: liveData,
    isLoading: liveLoading,
    isFetching: liveFetching,
    isError: liveIsError,
    refetch: refetchLive,
  } = useTodayMatches();

  const { data: preliveData } = usePreliveMatches();

  // Merge pre-live top-league fixtures into the main match pool.
  // Dedup by fixture ID so a match already in the main feed isn't duplicated.
  const allMatches = useMemo(() => {
    const main = liveData?.matches ?? [];
    const prelive = preliveData?.matches ?? [];
    if (prelive.length === 0) return main;
    const seen = new Set(main.map(m => m.id));
    const extra = prelive.filter(m => !seen.has(m.id));
    return [...main, ...extra];
  }, [liveData?.matches, preliveData?.matches]);

  const isStale     = liveData?.stale      === true;
  const isUpcoming  = liveData?.isUpcoming === true;
  const apiStatus   = liveData?.apiStatus  ?? "";

  // ── Filter state ────────────────────────────────────────────────────────
  const [selectedLeague, setSelectedLeague] = useState<number | typeof ALL_LEAGUES>(ALL_LEAGUES);
  const [selectedDate, setSelectedDate]     = useState<string | typeof ALL_DATES>(ALL_DATES);
  const [liveOnly, setLiveOnly]             = useState(false);
  const [searchQuery, setSearchQuery]       = useState("");

  // Unique dates present in the data
  const availableDates = useMemo(() => {
    const seen = new Set<string>();
    allMatches.forEach(m => seen.add(matchDay(m)));
    return Array.from(seen).sort();
  }, [allMatches]);

  // Unique leagues after date filter
  const leagues = useMemo(() => {
    const base = selectedDate === ALL_DATES ? allMatches : allMatches.filter(m => matchDay(m) === selectedDate);
    const seen = new Map<number, LiveMatch["league"]>();
    sortMatchesByLeague(base).forEach(m => {
      if (!seen.has(m.league.id)) seen.set(m.league.id, m.league);
    });
    return Array.from(seen.values());
  }, [allMatches, selectedDate]);

  // Reset league filter if it disappears from new data
  useMemo(() => {
    if (selectedLeague !== ALL_LEAGUES && !leagues.some(l => l.id === selectedLeague)) {
      setSelectedLeague(ALL_LEAGUES);
    }
  }, [leagues, selectedLeague]);

  // Reset date if it disappears
  useMemo(() => {
    if (selectedDate !== ALL_DATES && !availableDates.includes(selectedDate)) {
      setSelectedDate(ALL_DATES);
    }
  }, [availableDates, selectedDate]);

  // Apply all three filters
  const filtered = useMemo(() => {
    let m = allMatches;
    if (selectedDate !== ALL_DATES) m = m.filter(x => matchDay(x) === selectedDate);
    if (selectedLeague !== ALL_LEAGUES) m = m.filter(x => x.league.id === selectedLeague);
    if (liveOnly) m = m.filter(x => isLiveStatus(x.status.short));
    return m;
  }, [allMatches, selectedDate, selectedLeague, liveOnly]);

  // Apply search query on top of all other filters
  const filteredBySearch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter(m =>
      m.homeTeam.name.toLowerCase().includes(q) ||
      m.awayTeam.name.toLowerCase().includes(q) ||
      m.league.name.toLowerCase().includes(q) ||
      m.league.country.toLowerCase().includes(q)
    );
  }, [filtered, searchQuery]);

  const liveMatches = useMemo(() => sortMatchesByLeague(filteredBySearch.filter(m => isLiveStatus(m.status.short))), [filteredBySearch]);
  const upcomingMatches = useMemo(() => sortMatchesByLeague(filteredBySearch.filter(m => !isLiveStatus(m.status.short) && !isFinishedStatus(m.status.short))), [filteredBySearch]);
  const finishedMatches = useMemo(() => sortMatchesByLeague(filteredBySearch.filter(m => isFinishedStatus(m.status.short))), [filteredBySearch]);

  const liveGroups = useMemo(() => groupByLeague(liveMatches), [liveMatches]);
  const upcomingGroups = useMemo(() => groupByLeague(upcomingMatches), [upcomingMatches]);
  const finishedGroups = useMemo(() => groupByLeague(finishedMatches), [finishedMatches]);

  const totalFiltered = filteredBySearch.length;

  return (
    <div className="pb-24">
      {/* Hero */}
      <div className="relative h-[360px] md:h-[440px] w-full flex items-center justify-center overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-background">
          <img
            src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
            alt=""
            className="w-full h-full object-cover opacity-40 mix-blend-screen"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
        </div>

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto mt-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary text-sm font-medium border border-primary/30 mb-5">
              <Activity className="w-4 h-4 animate-pulse" />
              Live Analytics & AI Predictions
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-extrabold text-white mb-5 leading-tight">
              Professional Football{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-300">
                Analytics Platform
              </span>
            </h1>
            <p className="text-base md:text-lg text-muted-foreground mb-7 max-w-2xl mx-auto">
              AI-powered probabilities, live odds, value bets and per-90 player metrics — all in one place.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link href="/" className="px-6 py-2.5 rounded-full bg-primary hover:bg-primary/90 text-white font-semibold transition-all shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 text-sm">
                Live Matches
              </Link>
              <Link href="/value-bets" className="px-6 py-2.5 rounded-full bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 font-semibold transition-all border border-orange-500/30 text-sm flex items-center gap-1.5">
                <Flame className="w-4 h-4" /> Value Bets
              </Link>
              <Link href="/ai" className="px-6 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white font-semibold transition-all border border-white/10 backdrop-blur-md text-sm">
                AI Predictions
              </Link>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Featured sections: Top Bets + Hot Matches */}
      <div className="container mx-auto px-4 md:px-6 mt-10 relative z-20">
        <TopBetsSection />
        <HotMatchesSection />
      </div>

      {/* Matches section */}
      <div className="container mx-auto px-4 md:px-6 mt-4 relative z-20">

        {/* Header row */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <h2 className="text-2xl font-display font-bold flex items-center gap-2 mr-auto">
            <Globe className="w-6 h-6 text-primary" />
            {isUpcoming ? "Upcoming Matches" : "Today's Matches"}
            {liveData && (
              <span className="text-sm font-normal text-muted-foreground">
                ({totalFiltered}{selectedLeague !== ALL_LEAGUES ? ` of ${liveData.total}` : ""})
              </span>
            )}
          </h2>

          {/* Stale DB data banner */}
          {isStale && !liveFetching && (
            <span className="flex items-center gap-1.5 text-xs text-amber-400/80 bg-amber-400/8 px-2.5 py-1 rounded-full border border-amber-400/15">
              <Clock className="w-3 h-3" />
              Live updates paused. Showing latest available data.
            </span>
          )}
          {/* Fetching indicator (only shown when we already have matches) */}
          {!isStale && liveFetching && allMatches.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-zinc-500 bg-white/[0.04] px-2.5 py-1 rounded-full border border-white/[0.07]">
              <Loader2 className="w-3 h-3 animate-spin" />
              Updating...
            </span>
          )}

          {liveMatches.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-medium">
              <Radio className="w-3 h-3 animate-pulse" />
              {liveMatches.length} LIVE
            </span>
          )}

          <button
            onClick={() => refetchLive()}
            disabled={liveFetching}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.09] text-zinc-400 hover:text-white border border-white/[0.08] transition-colors disabled:opacity-40"
          >
            <RefreshCw className={cn("w-3 h-3", liveFetching && "animate-spin")} />
            Refresh
          </button>
        </div>

        {/* ── Search bar ── */}
        {allMatches.length > 0 && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar time, liga ou país..."
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-9 pr-9 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-primary/40 focus:bg-white/[0.06] transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* ── Date tabs ── */}
        {availableDates.length > 1 && (
          <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedDate(ALL_DATES)}
              className={cn(
                "flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap",
                selectedDate === ALL_DATES
                  ? "bg-primary/20 text-primary border-primary/40"
                  : "bg-white/[0.04] text-zinc-500 border-white/[0.08] hover:text-zinc-300"
              )}
            >
              All Days ({allMatches.length})
            </button>
            {availableDates.map(d => {
              const count = allMatches.filter(m => matchDay(m) === d).length;
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDate(d)}
                  className={cn(
                    "flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap",
                    selectedDate === d
                      ? "bg-primary/20 text-primary border-primary/40"
                      : "bg-white/[0.04] text-zinc-500 border-white/[0.08] hover:text-zinc-300"
                  )}
                >
                  {dateLabel(d)} <span className="opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── League filter + live toggle ── */}
        {(leagues.length > 1 || allMatches.some(m => isLiveStatus(m.status.short))) && (
          <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1 scrollbar-none">
            <Filter className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />

            {/* Live-only toggle */}
            {allMatches.some(m => isLiveStatus(m.status.short)) && (
              <button
                onClick={() => setLiveOnly(v => !v)}
                className={cn(
                  "flex-shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border transition-colors whitespace-nowrap",
                  liveOnly
                    ? "bg-red-500/20 text-red-400 border-red-500/40"
                    : "bg-white/[0.04] text-zinc-500 border-white/[0.08] hover:text-red-400 hover:border-red-500/30"
                )}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full bg-red-500", liveOnly && "animate-pulse")} />
                Live Only
              </button>
            )}

            {leagues.length > 1 && !liveOnly && (
              <>
                <button
                  onClick={() => setSelectedLeague(ALL_LEAGUES)}
                  className={cn(
                    "flex-shrink-0 text-xs font-semibold px-3 py-1 rounded-full border transition-colors whitespace-nowrap",
                    selectedLeague === ALL_LEAGUES
                      ? "bg-primary/20 text-primary border-primary/40"
                      : "bg-white/[0.04] text-zinc-500 border-white/[0.08] hover:text-zinc-300 hover:border-white/[0.16]"
                  )}
                >
                  All Leagues
                </button>
                {leagues.map(league => {
                  const base = selectedDate === ALL_DATES ? allMatches : allMatches.filter(m => matchDay(m) === selectedDate);
                  const count = base.filter(m => m.league.id === league.id).length;
                  return (
                    <button
                      key={league.id}
                      onClick={() => setSelectedLeague(league.id)}
                      className={cn(
                        "flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border transition-colors whitespace-nowrap",
                        selectedLeague === league.id
                          ? "bg-primary/20 text-primary border-primary/40"
                          : "bg-white/[0.04] text-zinc-500 border-white/[0.08] hover:text-zinc-300 hover:border-white/[0.16]"
                      )}
                    >
                      {league.logo && <img src={league.logo} alt="" loading="lazy" className="w-3.5 h-3.5 object-contain" />}
                      {league.name}
                      <span className="text-[10px] opacity-60">({count})</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* Content */}
        {liveLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="bg-[#09090b] rounded-xl h-48 animate-pulse border border-white/[0.06]" />
            ))}
          </div>
        ) : liveIsError && allMatches.length === 0 ? (
          <div className="p-10 text-center bg-[#09090b] rounded-xl border border-white/[0.07] flex flex-col items-center gap-3">
            <Loader2 className="w-9 h-9 text-primary animate-spin" />
            <h3 className="text-lg font-semibold text-white">Conectando ao servidor...</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              O servidor está iniciando. A página será atualizada automaticamente em alguns segundos.
            </p>
          </div>
        ) : totalFiltered === 0 ? (
          <div className="p-12 text-center bg-[#09090b] rounded-xl border border-white/[0.06] flex flex-col items-center">
            {allMatches.length === 0 ? (
              <>
                <Loader2 className="w-10 h-10 text-primary mb-4 animate-spin" />
                <h3 className="text-xl font-medium text-white mb-2">
                  Nenhum jogo disponível – tentando novamente...
                </h3>
                <p className="text-muted-foreground text-sm">
                  Conectando aos dados. Atualiza automaticamente a cada 10 segundos.
                </p>
              </>
            ) : searchQuery.trim() ? (
              <>
                <Search className="w-12 h-12 text-zinc-700 mb-4" />
                <h3 className="text-xl font-medium text-white mb-2">Nenhum resultado encontrado</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Nenhum jogo corresponde a "{searchQuery}".
                </p>
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-sm text-primary border border-primary/30 px-4 py-1.5 rounded-full hover:bg-primary/10 transition-colors"
                >
                  Limpar busca
                </button>
              </>
            ) : (
              <>
                <Target className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-xl font-medium text-white mb-2">Nenhum jogo neste filtro</h3>
                <p className="text-muted-foreground text-sm">Selecione uma liga diferente ou veja todos.</p>
              </>
            )}
          </div>
        ) : (
          <div>
            {/* ── LIVE ── */}
            {liveGroups.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                    Live Now ({liveMatches.length})
                  </span>
                </div>
                {groupByCountry(liveGroups).map((cg, ci) => (
                  <CountrySection key={cg.country} cg={cg} startIdx={ci * 6} />
                ))}
              </div>
            )}

            {/* ── UPCOMING ── */}
            {upcomingGroups.length > 0 && (
              <div>
                {liveGroups.length > 0 && (
                  <SectionDivider icon={<Clock className="w-3 h-3" />} label="Upcoming" count={upcomingMatches.length} />
                )}
                {liveGroups.length === 0 && (
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                      Upcoming ({upcomingMatches.length})
                    </span>
                  </div>
                )}
                {groupByCountry(upcomingGroups).map((cg, ci) => (
                  <CountrySection key={cg.country} cg={cg} startIdx={liveMatches.length + ci * 6} />
                ))}
              </div>
            )}

            {/* ── FINISHED ── */}
            {finishedGroups.length > 0 && (
              <div>
                <SectionDivider icon={<CheckCircle2 className="w-3 h-3" />} label="Finished" count={finishedMatches.length} />
                {groupByCountry(finishedGroups).map((cg, ci) => (
                  <CountrySection key={cg.country} cg={cg} startIdx={liveMatches.length + upcomingMatches.length + ci * 6} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Featured Predictions from DB */}
        {(dbMatches?.length ?? 0) > 0 && (
          <div className="mt-14">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-2xl font-display font-bold flex items-center gap-2">
                <Trophy className="w-6 h-6 text-primary" />
                Featured Predictions
              </h2>
              <Link href="/matches" className="text-sm font-medium text-primary hover:text-primary/80 flex items-center gap-1 group">
                View All <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            {dbLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-card rounded-2xl h-64 animate-pulse border border-white/5" />
                ))}
              </div>
            ) : dbError ? (
              <div className="p-8 text-center bg-card rounded-2xl border border-destructive/20 text-destructive">
                Failed to load matches. Please try again later.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {dbMatches?.map((match, idx) => (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: idx * 0.1 }}
                    key={match.id}
                  >
                    <Link
                      href={`/matches/${match.id}`}
                      className="block bg-card hover:bg-card/80 rounded-2xl p-5 border border-white/5 hover:border-primary/50 transition-all duration-300 group shadow-lg shadow-black/20"
                    >
                      <div className="flex justify-between items-center mb-4 text-sm">
                        <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                          {match.league?.logoUrl && (
                            <img src={match.league.logoUrl} className="w-4 h-4 rounded-full" alt="" loading="lazy" />
                          )}
                          {match.league?.name}
                        </span>
                        <span className={cn("flex items-center gap-1.5 font-semibold px-2.5 py-0.5 rounded-full text-xs", match.status === "live" ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-white/5 text-muted-foreground")}>
                          {match.status === "live" && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                          {match.status === "live" ? "LIVE" : format(new Date(match.kickoffTime), "HH:mm")}
                        </span>
                      </div>

                      <div className="space-y-4 mb-5">
                        {[{ team: match.homeTeam, score: match.homeScore }, { team: match.awayTeam, score: match.awayScore }].map(({ team, score }, i) => (
                          <div key={i} className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center border border-white/10">
                                {team.logoUrl ? (
                                  <img src={team.logoUrl} className="w-5 h-5" alt="" loading="lazy" />
                                ) : (
                                  <Trophy className="w-4 h-4 text-muted-foreground" />
                                )}
                              </div>
                              <span className="font-semibold text-lg">{team.name}</span>
                            </div>
                            <span className="font-display font-bold text-xl">{score ?? "-"}</span>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between text-xs text-muted-foreground font-medium px-1">
                          <span>Home {formatProbability(match.homeWinProbability)}</span>
                          <span>Draw {formatProbability(match.drawProbability)}</span>
                          <span>Away {formatProbability(match.awayWinProbability)}</span>
                        </div>
                        <div className="h-2 w-full flex rounded-full overflow-hidden bg-secondary">
                          <div className="bg-primary transition-all" style={{ width: `${(match.homeWinProbability || 0) * 100}%` }} />
                          <div className="bg-muted-foreground/40 transition-all" style={{ width: `${(match.drawProbability || 0) * 100}%` }} />
                          <div className="bg-blue-500 transition-all" style={{ width: `${(match.awayWinProbability || 0) * 100}%` }} />
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
