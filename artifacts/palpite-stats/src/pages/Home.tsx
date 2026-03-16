import { useGetMatches } from "@workspace/api-client-react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
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
} from "lucide-react";
import { cn, formatProbability } from "@/lib/utils";
import { MatchInsights } from "@/components/MatchInsights";
import { sortMatchesByLeague } from "@/lib/leaguePriority";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface LiveMatch {
  id: number;
  date: string;
  status: { short: string; long: string; elapsed: number | null };
  league: { id: number; name: string; country: string; logo: string; round: string };
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

const today = new Date().toISOString().split("T")[0];

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
    staleTime: 5 * 60 * 1000,          // 5 minutes – matches backend FIXTURE_LIST_TTL
    gcTime: 15 * 60 * 1000,
    refetchInterval: (query) => {
      if (query.state.status === "error") return 15 * 1000;
      // Retry every 10 seconds when no matches are available (quota reset / API recovering)
      if ((query.state.data as any)?.total === 0) return 10 * 1000;
      return 5 * 60 * 1000; // 5 minutes once we have match data
    },
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    retry: 3,
    retryDelay: 10 * 1000,
    placeholderData: keepPreviousData,
  });
}

function isLiveStatus(short: string) {
  return ["1H", "2H", "ET", "HT", "P"].includes(short);
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
        {group.league.country && (
          <span className="text-[10px] text-zinc-600 font-medium hidden sm:block">{group.league.country}</span>
        )}
        <span className="text-[11px] font-bold text-zinc-500 tabular-nums ml-1">
          ({group.matches.length})
        </span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-zinc-600 transition-transform flex-shrink-0", collapsed && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2.5 pb-1">
              {group.matches.map((match, i) => (
                <MatchCard key={match.id} match={match} idx={startIdx + i} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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

const ALL_LEAGUES = "all";

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

  const allMatches  = liveData?.matches    ?? [];
  const isStale     = liveData?.stale      === true;
  const isUpcoming  = liveData?.isUpcoming === true;

  // Build unique league list for the filter (preserve priority order)
  const leagues = useMemo(() => {
    const seen = new Map<number, LiveMatch["league"]>();
    sortMatchesByLeague(allMatches).forEach(m => {
      if (!seen.has(m.league.id)) seen.set(m.league.id, m.league);
    });
    return Array.from(seen.values());
  }, [allMatches]);

  const [selectedLeague, setSelectedLeague] = useState<number | typeof ALL_LEAGUES>(ALL_LEAGUES);

  // Reset filter if selected league no longer in the list
  useMemo(() => {
    if (selectedLeague !== ALL_LEAGUES && !leagues.some(l => l.id === selectedLeague)) {
      setSelectedLeague(ALL_LEAGUES);
    }
  }, [leagues, selectedLeague]);

  const filtered = useMemo(
    () => (selectedLeague === ALL_LEAGUES ? allMatches : allMatches.filter(m => m.league.id === selectedLeague)),
    [allMatches, selectedLeague]
  );

  const liveMatches = useMemo(() => sortMatchesByLeague(filtered.filter(m => isLiveStatus(m.status.short))), [filtered]);
  const upcomingMatches = useMemo(() => sortMatchesByLeague(filtered.filter(m => !isLiveStatus(m.status.short) && !isFinishedStatus(m.status.short))), [filtered]);
  const finishedMatches = useMemo(() => sortMatchesByLeague(filtered.filter(m => isFinishedStatus(m.status.short))), [filtered]);

  const liveGroups = useMemo(() => groupByLeague(liveMatches), [liveMatches]);
  const upcomingGroups = useMemo(() => groupByLeague(upcomingMatches), [upcomingMatches]);
  const finishedGroups = useMemo(() => groupByLeague(finishedMatches), [finishedMatches]);

  const totalFiltered = filtered.length;

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

      {/* Matches section */}
      <div className="container mx-auto px-4 md:px-6 mt-10 relative z-20">

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

          {/* Stale / updating indicator */}
          {(isStale || (liveFetching && allMatches.length > 0)) && (
            <span className="flex items-center gap-1.5 text-xs text-amber-400/80 bg-amber-400/8 px-2.5 py-1 rounded-full border border-amber-400/15">
              <Loader2 className="w-3 h-3 animate-spin" />
              Updating match data...
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

        {/* League filter */}
        {leagues.length > 1 && (
          <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1 scrollbar-none">
            <Filter className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
            <button
              onClick={() => setSelectedLeague(ALL_LEAGUES)}
              className={cn(
                "flex-shrink-0 text-xs font-semibold px-3 py-1 rounded-full border transition-colors whitespace-nowrap",
                selectedLeague === ALL_LEAGUES
                  ? "bg-primary/20 text-primary border-primary/40"
                  : "bg-white/[0.04] text-zinc-500 border-white/[0.08] hover:text-zinc-300 hover:border-white/[0.16]"
              )}
            >
              All Leagues ({liveData?.total ?? 0})
            </button>
            {leagues.map(league => {
              const count = allMatches.filter(m => m.league.id === league.id).length;
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
          <div className="p-8 text-center bg-[#09090b] rounded-xl border border-destructive/20 text-destructive">
            Failed to load match data. Please try again.
          </div>
        ) : totalFiltered === 0 ? (
          <div className="p-12 text-center bg-[#09090b] rounded-xl border border-white/[0.06] flex flex-col items-center">
            {allMatches.length === 0 ? (
              <>
                <Loader2 className="w-10 h-10 text-primary mb-4 animate-spin" />
                <h3 className="text-xl font-medium text-white mb-2">
                  No matches available – retrying...
                </h3>
                <p className="text-muted-foreground text-sm">
                  Connecting to match data. This refreshes automatically every 10 seconds.
                </p>
              </>
            ) : (
              <>
                <Target className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-xl font-medium text-white mb-2">No matches for this league</h3>
                <p className="text-muted-foreground text-sm">Select a different league or view all.</p>
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
                {liveGroups.map((group, gi) => (
                  <LeagueSection
                    key={group.league.id}
                    group={group}
                    startIdx={gi * 3}
                  />
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
                {upcomingGroups.map((group, gi) => (
                  <LeagueSection
                    key={group.league.id}
                    group={group}
                    startIdx={liveMatches.length + gi * 3}
                  />
                ))}
              </div>
            )}

            {/* ── FINISHED ── */}
            {finishedGroups.length > 0 && (
              <div>
                <SectionDivider icon={<CheckCircle2 className="w-3 h-3" />} label="Finished" count={finishedMatches.length} />
                {finishedGroups.map((group, gi) => (
                  <LeagueSection
                    key={group.league.id}
                    group={group}
                    startIdx={liveMatches.length + upcomingMatches.length + gi * 3}
                  />
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
