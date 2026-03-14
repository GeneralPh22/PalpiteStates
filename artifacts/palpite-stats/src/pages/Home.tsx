import { useGetMatches } from "@workspace/api-client-react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Activity, ChevronRight, Clock, Trophy, Target } from "lucide-react";
import { cn, formatProbability, formatOdds } from "@/lib/utils";

export default function Home() {
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: matches, isLoading, error } = useGetMatches({ date: today });

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
              Dominate the Game with <br/>
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

      {/* Today's Matches Section */}
      <div className="container mx-auto px-4 md:px-6 -mt-16 relative z-20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-display font-bold flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" />
            Today's Matches
          </h2>
          <Link href="/matches" className="text-sm font-medium text-primary hover:text-primary/80 flex items-center gap-1 group">
            View All <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-card rounded-2xl h-64 animate-pulse border border-white/5" />
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center bg-card rounded-2xl border border-destructive/20 text-destructive">
            Failed to load matches. Please try again later.
          </div>
        ) : matches?.length === 0 ? (
          <div className="p-12 text-center bg-card rounded-2xl border border-white/5 flex flex-col items-center">
            <Target className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">No matches scheduled today</h3>
            <p className="text-muted-foreground">Check back later or browse other dates.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {matches?.map((match, idx) => (
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
                    <span className={cn(
                      "flex items-center gap-1.5 font-semibold px-2.5 py-0.5 rounded-full text-xs",
                      match.status === 'live' ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-white/5 text-muted-foreground"
                    )}>
                      {match.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                      {match.status === 'live' ? 'LIVE' : format(new Date(match.kickoffTime), 'HH:mm')}
                    </span>
                  </div>

                  <div className="space-y-4 mb-6">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center border border-white/10">
                          {match.homeTeam.logoUrl ? <img src={match.homeTeam.logoUrl} className="w-5 h-5" alt="" /> : <Trophy className="w-4 h-4 text-muted-foreground" />}
                        </div>
                        <span className="font-semibold text-lg">{match.homeTeam.name}</span>
                      </div>
                      <span className="font-display font-bold text-xl">{match.homeScore ?? '-'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center border border-white/10">
                          {match.awayTeam.logoUrl ? <img src={match.awayTeam.logoUrl} className="w-5 h-5" alt="" /> : <Trophy className="w-4 h-4 text-muted-foreground" />}
                        </div>
                        <span className="font-semibold text-lg">{match.awayTeam.name}</span>
                      </div>
                      <span className="font-display font-bold text-xl">{match.awayScore ?? '-'}</span>
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
