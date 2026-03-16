import { useGetMatches } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  Activity,
  ChevronRight,
  Clock,
  Trophy,
  Target,
  Globe,
  RefreshCw,
  AlertTriangle,
  Flame,
  CheckCircle2,
  Radio,
} from "lucide-react";
import { cn, formatProbability, formatOdds } from "@/lib/utils";
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
  demo?: boolean;
  apiStatus?: string;
}

const today = new Date().toISOString().split("T")[0];

function useTodayMatches() {
  return useQuery<TodayMatchesResponse>({
    queryKey: ["matches-today", today],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/matches-today`);
      if (!res.ok) throw new Error("Failed to fetch matches");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

function isLiveStatus(short: string) {
  return ["1H", "2H", "ET", "HT", "P"].includes(short);
}
function isFinishedStatus(short: string) {
  return ["FT", "AET", "PEN"].includes(short);
}

function LiveMatchCard({ match, idx }: { match: LiveMatch; idx: number }) {
  const isLive = isLiveStatus(match.status.short);
  const isFinished = isFinishedStatus(match.status.short);
  const hasScore = match.score.home !== null && match.score.away !== null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(idx * 0.04, 0.6) }}
      className="h-full"
    >
      <Link href={`/fixture/${match.id}`} className="h-full block group">
        <div
          className={cn(
            "relative flex flex-col h-full rounded-2xl overflow-hidden border transition-all duration-300 cursor-pointer",
            "bg-[#09090b] shadow-2xl shadow-black/70",
            isLive
              ? "border-red-500/30 group-hover:border-red-500/60 shadow-red-950/30"
              : isFinished
              ? "border-white/[0.07] group-hover:border-white/[0.18]"
              : "border-white/[0.06] group-hover:border-primary/25"
          )}
        >
          {isLive && (
            <div className="absolute inset-0 bg-gradient-to-br from-red-950/15 via-transparent to-transparent pointer-events-none" />
          )}

          {/* League header */}
          <div className="flex items-center justify-between px-4 pt-3.5 pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2 min-w-0">
              {match.league.logo ? (
                <img
                  src={match.league.logo}
                  alt=""
                  loading="lazy"
                  className="w-5 h-5 object-contain flex-shrink-0 opacity-85"
                />
              ) : (
                <Globe className="w-4 h-4 text-zinc-500 flex-shrink-0" />
              )}
              <span className="text-[10.5px] font-semibold text-zinc-400 uppercase tracking-wider truncate">
                {match.league.name}
              </span>
              {match.league.country && (
                <span className="text-[9px] text-zinc-600 font-medium truncate hidden sm:block">
                  · {match.league.country}
                </span>
              )}
            </div>

            <div className="flex-shrink-0 ml-2">
              {isLive ? (
                <span className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-500 text-white shadow-lg shadow-red-500/40 ring-1 ring-red-400/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  {match.status.elapsed ? `${match.status.elapsed}'` : "LIVE"}
                </span>
              ) : isFinished ? (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-zinc-700 text-zinc-300 border border-zinc-600/30">
                  FT
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/[0.07] text-zinc-400 border border-white/[0.08]">
                  <Clock className="w-3 h-3" />
                  {format(new Date(match.date), "HH:mm")}
                </span>
              )}
            </div>
          </div>

          {/* Teams & Score */}
          <div className="flex items-center justify-between gap-2 px-4 py-5 flex-1">
            {/* Home team */}
            <div className="flex flex-col items-center gap-2.5 flex-1 min-w-0">
              <div
                className={cn(
                  "w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0",
                  "bg-white/[0.05] border border-white/[0.09]",
                  match.homeTeam.winner === true &&
                    "ring-2 ring-primary/60 ring-offset-1 ring-offset-[#09090b]"
                )}
              >
                {match.homeTeam.logo ? (
                  <img
                    src={match.homeTeam.logo}
                    alt={match.homeTeam.name}
                    loading="lazy"
                    className="w-9 h-9 object-contain drop-shadow"
                  />
                ) : (
                  <Trophy className="w-5 h-5 text-zinc-500" />
                )}
              </div>
              <span
                className={cn(
                  "text-[11px] font-semibold text-center leading-tight line-clamp-2 w-full px-1",
                  match.homeTeam.winner === true ? "text-white" : "text-zinc-300"
                )}
              >
                {match.homeTeam.name}
              </span>
            </div>

            {/* Score / VS */}
            <div className="flex flex-col items-center gap-1 flex-shrink-0 px-1">
              {hasScore ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "font-display font-black text-[2rem] leading-none tabular-nums",
                        match.homeTeam.winner === true ? "text-white" : "text-zinc-100"
                      )}
                    >
                      {match.score.home}
                    </span>
                    <span className="text-zinc-700 font-bold text-lg">–</span>
                    <span
                      className={cn(
                        "font-display font-black text-[2rem] leading-none tabular-nums",
                        match.awayTeam.winner === true ? "text-white" : "text-zinc-100"
                      )}
                    >
                      {match.score.away}
                    </span>
                  </div>
                  {isLive && (
                    <span className="text-[10px] text-red-400 font-semibold tabular-nums">
                      {match.status.elapsed ? `${match.status.elapsed}'` : "●"}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-zinc-600 font-bold text-sm uppercase tracking-widest px-2">
                  VS
                </span>
              )}
            </div>

            {/* Away team */}
            <div className="flex flex-col items-center gap-2.5 flex-1 min-w-0">
              <div
                className={cn(
                  "w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0",
                  "bg-white/[0.05] border border-white/[0.09]",
                  match.awayTeam.winner === true &&
                    "ring-2 ring-primary/60 ring-offset-1 ring-offset-[#09090b]"
                )}
              >
                {match.awayTeam.logo ? (
                  <img
                    src={match.awayTeam.logo}
                    alt={match.awayTeam.name}
                    loading="lazy"
                    className="w-9 h-9 object-contain drop-shadow"
                  />
                ) : (
                  <Trophy className="w-5 h-5 text-zinc-500" />
                )}
              </div>
              <span
                className={cn(
                  "text-[11px] font-semibold text-center leading-tight line-clamp-2 w-full px-1",
                  match.awayTeam.winner === true ? "text-white" : "text-zinc-300"
                )}
              >
                {match.awayTeam.name}
              </span>
            </div>
          </div>

          {/* Round */}
          {match.league.round && (
            <div className="px-4">
              <div className="border-t border-white/[0.05] pt-2 pb-2">
                <span className="text-[9.5px] text-zinc-600 uppercase tracking-wider font-medium">
                  {match.league.round}
                </span>
              </div>
            </div>
          )}

          {/* Odds & AI Analysis (expandable) */}
          <MatchInsights
            fixtureId={match.id}
            homeTeamId={match.homeTeam.id}
            awayTeamId={match.awayTeam.id}
            leagueId={match.league.id}
            homeTeamName={match.homeTeam.name}
            awayTeamName={match.awayTeam.name}
          />

          {/* Detail link indicator */}
          <div className="px-4 pb-3 pt-1 flex justify-center">
            <span className="text-[9px] text-zinc-700 group-hover:text-zinc-500 font-medium transition-colors flex items-center gap-1">
              Tap for full analysis
              <ChevronRight className="w-2.5 h-2.5" />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export default function Home() {
  const todayFormatted = format(new Date(), "yyyy-MM-dd");
  const {
    data: dbMatches,
    isLoading: dbLoading,
    error: dbError,
  } = useGetMatches({ date: todayFormatted });
  const {
    data: liveData,
    isLoading: liveLoading,
    error: liveError,
    isFetching: liveFetching,
    refetch: refetchLive,
  } = useTodayMatches();

  const liveMatches = (liveData?.matches ?? []).filter(m => isLiveStatus(m.status.short));
  const upcomingMatches = (liveData?.matches ?? []).filter(m => !isLiveStatus(m.status.short) && !isFinishedStatus(m.status.short));
  const finishedMatches = (liveData?.matches ?? []).filter(m => isFinishedStatus(m.status.short));

  const sortedMatches = [
    ...sortMatchesByLeague(liveMatches),
    ...sortMatchesByLeague(upcomingMatches),
    ...sortMatchesByLeague(finishedMatches),
  ];

  return (
    <div className="pb-24">
      {/* Hero Section */}
      <div className="relative h-[380px] md:h-[460px] w-full flex items-center justify-center overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-background">
          <img
            src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
            alt=""
            className="w-full h-full object-cover opacity-40 mix-blend-screen"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
        </div>

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto mt-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
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
              <Link
                href="/fixture/99001"
                className="px-6 py-2.5 rounded-full bg-primary hover:bg-primary/90 text-white font-semibold transition-all shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 text-sm"
              >
                Live Matches
              </Link>
              <Link
                href="/value-bets"
                className="px-6 py-2.5 rounded-full bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 font-semibold transition-all border border-orange-500/30 text-sm flex items-center gap-1.5"
              >
                <Flame className="w-4 h-4" />
                Value Bets
              </Link>
              <Link
                href="/ai"
                className="px-6 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white font-semibold transition-all border border-white/10 backdrop-blur-md text-sm"
              >
                AI Predictions
              </Link>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Today's Matches */}
      <div className="container mx-auto px-4 md:px-6 mt-10 relative z-20">

        {/* Demo data notice */}
        {liveData?.demo && (
          <div className="mb-5 flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <p className="text-xs text-amber-300/80">
              <strong className="text-amber-400">Demo mode active</strong> — Live football data feed is temporarily unavailable. Showing sample fixtures to demonstrate all platform features.
            </p>
          </div>
        )}

        {/* Section header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-display font-bold flex items-center gap-2">
            <Globe className="w-6 h-6 text-primary" />
            Today's Matches
            {liveData && (
              <span className="text-sm font-normal text-muted-foreground">
                ({liveData.total})
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
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
              title="Refresh matches"
            >
              <RefreshCw className={cn("w-3 h-3", liveFetching && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>

        {/* Live section indicator */}
        {liveMatches.length > 0 && (
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Live Now</span>
          </div>
        )}

        {liveLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(9)].map((_, i) => (
              <div
                key={i}
                className="bg-[#09090b] rounded-2xl h-52 animate-pulse border border-white/[0.06]"
              />
            ))}
          </div>
        ) : liveError ? (
          <div className="p-8 text-center bg-[#09090b] rounded-2xl border border-destructive/20 text-destructive">
            Failed to load match data. Please try again.
          </div>
        ) : sortedMatches.length === 0 ? (
          <div className="p-12 text-center bg-[#09090b] rounded-2xl border border-white/[0.06] flex flex-col items-center">
            <Target className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">No matches scheduled today</h3>
            <p className="text-muted-foreground">Check back later or browse other dates.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedMatches.map((match, idx) => (
              <LiveMatchCard key={match.id} match={match} idx={idx} />
            ))}
          </div>
        )}

        {/* Upcoming & Finished section separators */}
        {!liveLoading && upcomingMatches.length > 0 && liveMatches.length > 0 && (
          <div className="flex items-center gap-3 mt-8 mb-4">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> Upcoming
            </span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>
        )}

        {!liveLoading && finishedMatches.length > 0 && (
          <div className="flex items-center gap-3 mt-8 mb-4">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3" /> Finished
            </span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>
        )}
      </div>

      {/* Featured Predictions from DB */}
      {(dbMatches?.length ?? 0) > 0 && (
        <div className="container mx-auto px-4 md:px-6 mt-14 relative z-20">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-2xl font-display font-bold flex items-center gap-2">
              <Trophy className="w-6 h-6 text-primary" />
              Featured Predictions
            </h2>
            <Link
              href="/matches"
              className="text-sm font-medium text-primary hover:text-primary/80 flex items-center gap-1 group"
            >
              View All{" "}
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
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
                      <span
                        className={cn(
                          "flex items-center gap-1.5 font-semibold px-2.5 py-0.5 rounded-full text-xs",
                          match.status === "live"
                            ? "bg-red-500/20 text-red-400 border border-red-500/30"
                            : "bg-white/5 text-muted-foreground"
                        )}
                      >
                        {match.status === "live" && (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        )}
                        {match.status === "live"
                          ? "LIVE"
                          : format(new Date(match.kickoffTime), "HH:mm")}
                      </span>
                    </div>

                    <div className="space-y-4 mb-5">
                      {[
                        { team: match.homeTeam, score: match.homeScore },
                        { team: match.awayTeam, score: match.awayScore },
                      ].map(({ team, score }, i) => (
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
                      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/5 text-center">
                        <div className="bg-secondary/50 rounded-lg py-2 group-hover:bg-secondary transition-colors">
                          <div className="text-xs text-muted-foreground mb-1">1</div>
                          <div className="font-bold text-primary text-sm">{formatOdds(match.homeOdds)}</div>
                        </div>
                        <div className="bg-secondary/50 rounded-lg py-2 group-hover:bg-secondary transition-colors">
                          <div className="text-xs text-muted-foreground mb-1">X</div>
                          <div className="font-bold text-white text-sm">{formatOdds(match.drawOdds)}</div>
                        </div>
                        <div className="bg-secondary/50 rounded-lg py-2 group-hover:bg-secondary transition-colors">
                          <div className="text-xs text-muted-foreground mb-1">2</div>
                          <div className="font-bold text-blue-400 text-sm">{formatOdds(match.awayOdds)}</div>
                        </div>
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
  );
}
