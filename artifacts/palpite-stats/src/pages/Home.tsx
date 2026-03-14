import { useGetMatches } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Activity, ChevronRight, Clock, Trophy, Target, Globe } from "lucide-react";
import { cn, formatProbability, formatOdds } from "@/lib/utils";

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

function useTodayMatches() {
  const today = new Date().toISOString().split("T")[0];
  return useQuery<{ total: number; matches: LiveMatch[] }>({
    queryKey: ["matches-today", today],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/matches-today`);
      if (!res.ok) throw new Error("Failed to fetch matches");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

function LiveMatchCard({ match, idx }: { match: LiveMatch; idx: number }) {
  const isLive =
    match.status.short === "1H" ||
    match.status.short === "2H" ||
    match.status.short === "ET" ||
    match.status.short === "HT";
  const isFinished =
    match.status.short === "FT" ||
    match.status.short === "AET" ||
    match.status.short === "PEN";
  const hasScore = match.score.home !== null && match.score.away !== null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: idx * 0.04 }}
      className="h-full"
    >
      <div
        className={cn(
          "relative flex flex-col h-full rounded-2xl overflow-hidden border transition-all duration-300",
          "bg-[#0d0d0f] shadow-xl shadow-black/60",
          isLive
            ? "border-red-500/25 hover:border-red-500/50 shadow-red-950/20"
            : "border-white/[0.06] hover:border-white/[0.14]"
        )}
      >
        {isLive && (
          <div className="absolute inset-0 bg-gradient-to-b from-red-950/10 to-transparent pointer-events-none" />
        )}

        {/* League header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 min-w-0">
            {match.league.logo ? (
              <img src={match.league.logo} alt="" className="w-5 h-5 object-contain flex-shrink-0 opacity-90" />
            ) : (
              <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            )}
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide truncate">
              {match.league.name}
            </span>
          </div>
          <div className="flex-shrink-0 ml-2">
            {isLive ? (
              <span className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                {match.status.elapsed ? `${match.status.elapsed}'` : "LIVE"}
              </span>
            ) : isFinished ? (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
                FT
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/[0.07] text-zinc-400">
                <Clock className="w-3 h-3" />
                {format(new Date(match.date), "HH:mm")}
              </span>
            )}
          </div>
        </div>

        {/* Teams & Score */}
        <div className="flex items-center justify-between gap-3 px-4 py-5 flex-1">
          {/* Home team */}
          <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
            <div
              className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 border",
                "bg-white/[0.04] border-white/[0.08]",
                match.homeTeam.winner === true && "ring-2 ring-primary/50"
              )}
            >
              {match.homeTeam.logo ? (
                <img src={match.homeTeam.logo} alt="" className="w-9 h-9 object-contain drop-shadow-sm" />
              ) : (
                <Trophy className="w-5 h-5 text-zinc-500" />
              )}
            </div>
            <span
              className={cn(
                "text-xs font-semibold text-center leading-tight line-clamp-2",
                match.homeTeam.winner === true ? "text-white" : "text-zinc-300"
              )}
            >
              {match.homeTeam.name}
            </span>
          </div>

          {/* Score / VS */}
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            {hasScore ? (
              <div className="flex items-center gap-1">
                <span
                  className={cn(
                    "font-display font-black text-3xl leading-none tabular-nums",
                    match.homeTeam.winner === true ? "text-white" : "text-zinc-200"
                  )}
                >
                  {match.score.home}
                </span>
                <span className="text-zinc-600 font-bold text-xl mx-0.5">:</span>
                <span
                  className={cn(
                    "font-display font-black text-3xl leading-none tabular-nums",
                    match.awayTeam.winner === true ? "text-white" : "text-zinc-200"
                  )}
                >
                  {match.score.away}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <span className="text-zinc-600 font-bold text-sm uppercase tracking-widest">VS</span>
              </div>
            )}
            {isLive && (
              <span className="text-[10px] text-red-400 font-semibold tabular-nums">
                {match.status.elapsed ? `${match.status.elapsed}'` : "●"}
              </span>
            )}
          </div>

          {/* Away team */}
          <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
            <div
              className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 border",
                "bg-white/[0.04] border-white/[0.08]",
                match.awayTeam.winner === true && "ring-2 ring-primary/50"
              )}
            >
              {match.awayTeam.logo ? (
                <img src={match.awayTeam.logo} alt="" className="w-9 h-9 object-contain drop-shadow-sm" />
              ) : (
                <Trophy className="w-5 h-5 text-zinc-500" />
              )}
            </div>
            <span
              className={cn(
                "text-xs font-semibold text-center leading-tight line-clamp-2",
                match.awayTeam.winner === true ? "text-white" : "text-zinc-300"
              )}
            >
              {match.awayTeam.name}
            </span>
          </div>
        </div>

        {/* Footer */}
        {match.league.round && (
          <div className="px-4 pb-3 pt-0">
            <div className="border-t border-white/[0.05] pt-2.5">
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">
                {match.league.round}
              </span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function Home() {
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: dbMatches, isLoading: dbLoading, error: dbError } = useGetMatches({ date: today });
  const { data: liveData, isLoading: liveLoading, error: liveError } = useTodayMatches();

  return (
    <div className="pb-24">
      {/* Hero Section */}
      <div className="relative h-[400px] md:h-[500px] w-full flex items-center justify-center overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-background">
          <img
            src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
            alt="Hero abstract background"
            className="w-full h-full object-cover opacity-40 mix-blend-screen"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
        </div>

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto mt-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary text-sm font-medium border border-primary/30 mb-6">
              <Activity className="w-4 h-4 animate-pulse" />
              Live Analytics & Predictions
            </span>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-extrabold text-white mb-6 leading-tight">
              Dominate the Game with <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-300">
                Data-Driven Insights
              </span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Advanced algorithms, real-time odds, and per-90 player metrics tailored for smart betting strategies.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link
                href="/matches"
                className="px-8 py-3 rounded-full bg-primary hover:bg-primary/90 text-white font-semibold transition-all shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5"
              >
                Analyze Matches
              </Link>
              <Link
                href="/ai"
                className="px-8 py-3 rounded-full bg-white/5 hover:bg-white/10 text-white font-semibold transition-all border border-white/10 backdrop-blur-md"
              >
                Ask AI Assistant
              </Link>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Live Matches from API-Football */}
      <div className="container mx-auto px-4 md:px-6 mt-12 relative z-20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-display font-bold flex items-center gap-2">
            <Globe className="w-6 h-6 text-primary" />
            Today's Matches
            {liveData && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({Math.min(30, liveData.matches.length)} of {liveData.total})
              </span>
            )}
          </h2>
          {liveData && liveData.total > 0 && (
            <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
              <Activity className="w-3 h-3 animate-pulse" />
              Live Data
            </span>
          )}
        </div>

        {liveLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="bg-[#0d0d0f] rounded-2xl h-44 animate-pulse border border-white/[0.06]" />
            ))}
          </div>
        ) : liveError ? (
          <div className="p-8 text-center bg-[#0d0d0f] rounded-2xl border border-destructive/20 text-destructive">
            Failed to load live match data. Please check the API key or try again later.
          </div>
        ) : liveData && liveData.total === 0 ? (
          <div className="p-12 text-center bg-[#0d0d0f] rounded-2xl border border-white/[0.06] flex flex-col items-center">
            <Target className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">No matches scheduled today</h3>
            <p className="text-muted-foreground">Check back later or browse other dates.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {liveData?.matches.slice(0, 30).map((match, idx) => (
              <LiveMatchCard key={match.id} match={match} idx={idx} />
            ))}
          </div>
        )}
      </div>

      {/* Internal DB Matches Section */}
      <div className="container mx-auto px-4 md:px-6 mt-16 -mt-0 relative z-20">
        <div className="flex items-center justify-between mb-6 mt-12">
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
        ) : dbMatches?.length === 0 ? (
          <div className="p-12 text-center bg-card rounded-2xl border border-white/5 flex flex-col items-center">
            <Target className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">No predictions available today</h3>
            <p className="text-muted-foreground">Check back later or browse other dates.</p>
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
                      {match.league?.logoUrl && <img src={match.league.logoUrl} className="w-4 h-4 rounded-full" alt="" />}
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
                      {match.status === "live" ? "LIVE" : format(new Date(match.kickoffTime), "HH:mm")}
                    </span>
                  </div>

                  <div className="space-y-4 mb-6">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center border border-white/10">
                          {match.homeTeam.logoUrl ? (
                            <img src={match.homeTeam.logoUrl} className="w-5 h-5" alt="" />
                          ) : (
                            <Trophy className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <span className="font-semibold text-lg">{match.homeTeam.name}</span>
                      </div>
                      <span className="font-display font-bold text-xl">{match.homeScore ?? "-"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center border border-white/10">
                          {match.awayTeam.logoUrl ? (
                            <img src={match.awayTeam.logoUrl} className="w-5 h-5" alt="" />
                          ) : (
                            <Trophy className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <span className="font-semibold text-lg">{match.awayTeam.name}</span>
                      </div>
                      <span className="font-display font-bold text-xl">{match.awayScore ?? "-"}</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between text-xs text-muted-foreground font-medium px-1">
                      <span>Win {formatProbability(match.homeWinProbability)}</span>
                      <span>Draw {formatProbability(match.drawProbability)}</span>
                      <span>Win {formatProbability(match.awayWinProbability)}</span>
                    </div>
                    <div className="h-2 w-full flex rounded-full overflow-hidden bg-secondary">
                      <div className="bg-primary transition-all" style={{ width: `${(match.homeWinProbability || 0) * 100}%` }} />
                      <div className="bg-muted-foreground/40 transition-all" style={{ width: `${(match.drawProbability || 0) * 100}%` }} />
                      <div className="bg-blue-500 transition-all" style={{ width: `${(match.awayWinProbability || 0) * 100}%` }} />
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/5 text-center">
                      <div className="bg-secondary/50 rounded-lg py-2 group-hover:bg-secondary transition-colors">
                        <div className="text-xs text-muted-foreground mb-1">1</div>
                        <div className="font-bold text-primary">{formatOdds(match.homeOdds)}</div>
                      </div>
                      <div className="bg-secondary/50 rounded-lg py-2 group-hover:bg-secondary transition-colors">
                        <div className="text-xs text-muted-foreground mb-1">X</div>
                        <div className="font-bold text-white">{formatOdds(match.drawOdds)}</div>
                      </div>
                      <div className="bg-secondary/50 rounded-lg py-2 group-hover:bg-secondary transition-colors">
                        <div className="text-xs text-muted-foreground mb-1">2</div>
                        <div className="font-bold text-blue-400">{formatOdds(match.awayOdds)}</div>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
