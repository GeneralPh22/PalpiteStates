import { useGetMatches } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { Calendar as CalendarIcon, Search, Trophy } from "lucide-react";
import { useState } from "react";
import { formatProbability } from "@/lib/utils";

export default function Matches() {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const { data: matches, isLoading } = useGetMatches({ date });

  return (
    <div className="container mx-auto px-4 py-8 md:py-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-display font-bold mb-2">Match Center</h1>
          <p className="text-muted-foreground">Deep analysis and statistical insights for upcoming fixtures.</p>
        </div>
        
        <div className="flex items-center gap-4 bg-card border border-white/10 rounded-xl p-1.5 shadow-lg shadow-black/20 w-fit">
          <div className="relative">
            <CalendarIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input 
              type="date" 
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-sm font-medium border-none outline-none pl-9 pr-4 py-2 text-white cursor-pointer color-scheme-dark"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-24 bg-card animate-pulse rounded-xl border border-white/5" />
          ))}
        </div>
      ) : matches?.length === 0 ? (
        <div className="p-12 text-center bg-card rounded-2xl border border-white/5">
          <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-medium text-white mb-2">No matches found</h3>
          <p className="text-muted-foreground">Try selecting a different date.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {matches?.map((match) => (
            <Link 
              key={match.id}
              href={`/matches/${match.id}`}
              className="block bg-card hover:bg-card/80 rounded-xl p-4 md:p-6 border border-white/5 hover:border-primary/30 transition-all duration-200 group flex flex-col md:flex-row md:items-center justify-between gap-6"
            >
              <div className="flex items-center gap-4 w-full md:w-1/4">
                <div className="text-sm font-medium text-muted-foreground">
                  {format(new Date(match.kickoffTime), 'HH:mm')}
                </div>
                <div className="text-xs px-2.5 py-1 rounded-md bg-secondary text-muted-foreground border border-white/5 truncate">
                  {match.league.name}
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center gap-4 md:gap-8">
                <div className="flex-1 flex justify-end items-center gap-3">
                  <span className="font-semibold text-right">{match.homeTeam.name}</span>
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center border border-white/10 shrink-0">
                    {match.homeTeam.logoUrl && <img src={match.homeTeam.logoUrl} className="w-5 h-5" alt="" />}
                  </div>
                </div>

                <div className="px-4 py-2 rounded-lg bg-background border border-white/10 font-display font-bold text-lg min-w-[5rem] text-center shrink-0">
                  {match.status === 'scheduled' ? 'VS' : `${match.homeScore} - ${match.awayScore}`}
                </div>

                <div className="flex-1 flex justify-start items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center border border-white/10 shrink-0">
                    {match.awayTeam.logoUrl && <img src={match.awayTeam.logoUrl} className="w-5 h-5" alt="" />}
                  </div>
                  <span className="font-semibold text-left">{match.awayTeam.name}</span>
                </div>
              </div>

              <div className="hidden lg:flex w-1/4 justify-end gap-2">
                <div className="text-center px-4 py-1.5 rounded bg-background border border-white/5">
                  <div className="text-[10px] text-muted-foreground uppercase mb-0.5">Home</div>
                  <div className="font-bold text-primary text-sm">{formatProbability(match.homeWinProbability)}</div>
                </div>
                <div className="text-center px-4 py-1.5 rounded bg-background border border-white/5">
                  <div className="text-[10px] text-muted-foreground uppercase mb-0.5">Away</div>
                  <div className="font-bold text-blue-400 text-sm">{formatProbability(match.awayWinProbability)}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
