import { useGetOdds } from "@workspace/api-client-react";
import { format } from "date-fns";
import { useState } from "react";
import { CalendarIcon, TrendingUp } from "lucide-react";
import { cn, formatOdds } from "@/lib/utils";

export default function Odds() {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const { data: oddsData, isLoading } = useGetOdds({ date });

  // Helper to find highest odds across bookmakers for a specific field
  const getBestOdd = (matchOdds: any[], field: keyof typeof matchOdds[0]) => {
    if (!matchOdds || matchOdds.length === 0) return null;
    return Math.max(...matchOdds.map(o => Number(o[field]) || 0));
  };

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl md:text-4xl font-display font-bold mb-2 flex items-center gap-3">
            <TrendingUp className="text-primary w-8 h-8" />
            Odds Comparison
          </h1>
          <p className="text-muted-foreground">Find the highest value bets across major bookmakers.</p>
        </div>
        
        <div className="flex items-center gap-4 bg-card border border-white/10 rounded-xl p-1.5 shadow-lg w-fit">
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
        <div className="space-y-6">
          {[1,2,3].map(i => (
            <div key={i} className="h-64 bg-card animate-pulse rounded-2xl border border-white/5" />
          ))}
        </div>
      ) : oddsData?.length === 0 ? (
        <div className="p-16 text-center bg-card rounded-3xl border border-white/5">
          <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-medium text-white mb-2">No odds available</h3>
          <p className="text-muted-foreground">Try selecting a different date.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {oddsData?.map((matchOdd) => (
            <div key={matchOdd.matchId} className="bg-card rounded-2xl border border-white/5 overflow-hidden shadow-xl">
              
              {/* Match Header */}
              <div className="bg-background/50 px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-xs px-2.5 py-1 rounded bg-secondary text-muted-foreground font-medium">
                    {matchOdd.match.league.name}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">
                    {format(new Date(matchOdd.match.kickoffTime), 'HH:mm')}
                  </span>
                </div>
                <div className="font-display font-bold text-lg hidden md:block">
                  {matchOdd.match.homeTeam.name} <span className="text-muted-foreground mx-2">vs</span> {matchOdd.match.awayTeam.name}
                </div>
              </div>

              {/* Mobile Match Title (visible only on small screens) */}
              <div className="px-6 pt-4 font-display font-bold text-lg md:hidden text-center">
                {matchOdd.match.homeTeam.name} <br/><span className="text-muted-foreground text-sm">vs</span><br/> {matchOdd.match.awayTeam.name}
              </div>

              {/* Odds Table */}
              <div className="p-0 overflow-x-auto">
                <table className="w-full min-w-[800px] text-sm text-left">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-6 py-4 font-medium text-muted-foreground w-40">Bookmaker</th>
                      <th colSpan={3} className="px-6 py-4 font-medium text-center border-l border-white/5">Match Winner</th>
                      <th colSpan={2} className="px-6 py-4 font-medium text-center border-l border-white/5">Goals 2.5</th>
                      <th colSpan={2} className="px-6 py-4 font-medium text-center border-l border-white/5">BTTS</th>
                    </tr>
                    <tr className="bg-background/20 border-b border-white/5 text-muted-foreground text-xs uppercase tracking-wider">
                      <th className="px-6 py-3 font-medium"></th>
                      <th className="px-6 py-3 font-medium text-center border-l border-white/5">1</th>
                      <th className="px-6 py-3 font-medium text-center">X</th>
                      <th className="px-6 py-3 font-medium text-center">2</th>
                      <th className="px-6 py-3 font-medium text-center border-l border-white/5">Over</th>
                      <th className="px-6 py-3 font-medium text-center">Under</th>
                      <th className="px-6 py-3 font-medium text-center border-l border-white/5">Yes</th>
                      <th className="px-6 py-3 font-medium text-center">No</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {matchOdd.odds.map((odd, idx) => {
                      // Determine if these are the best odds
                      const isBestHome = Number(odd.homeWin) === getBestOdd(matchOdd.odds, 'homeWin');
                      const isBestDraw = Number(odd.draw) === getBestOdd(matchOdd.odds, 'draw');
                      const isBestAway = Number(odd.awayWin) === getBestOdd(matchOdd.odds, 'awayWin');
                      const isBestOver = Number(odd.over25) === getBestOdd(matchOdd.odds, 'over25');
                      const isBestUnder = Number(odd.under25) === getBestOdd(matchOdd.odds, 'under25');
                      const isBestBttsY = Number(odd.bttsYes) === getBestOdd(matchOdd.odds, 'bttsYes');
                      const isBestBttsN = Number(odd.bttsNo) === getBestOdd(matchOdd.odds, 'bttsNo');

                      return (
                        <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-6 py-4 font-bold text-white flex items-center gap-2">
                            {odd.bookmaker}
                          </td>
                          <td className={cn("px-6 py-4 text-center border-l border-white/5", isBestHome && "text-primary font-bold bg-primary/5")}>
                            {formatOdds(odd.homeWin)}
                          </td>
                          <td className={cn("px-6 py-4 text-center", isBestDraw && "text-primary font-bold bg-primary/5")}>
                            {formatOdds(odd.draw)}
                          </td>
                          <td className={cn("px-6 py-4 text-center", isBestAway && "text-primary font-bold bg-primary/5")}>
                            {formatOdds(odd.awayWin)}
                          </td>
                          <td className={cn("px-6 py-4 text-center border-l border-white/5", isBestOver && "text-primary font-bold bg-primary/5")}>
                            {formatOdds(odd.over25)}
                          </td>
                          <td className={cn("px-6 py-4 text-center", isBestUnder && "text-primary font-bold bg-primary/5")}>
                            {formatOdds(odd.under25)}
                          </td>
                          <td className={cn("px-6 py-4 text-center border-l border-white/5", isBestBttsY && "text-primary font-bold bg-primary/5")}>
                            {formatOdds(odd.bttsYes)}
                          </td>
                          <td className={cn("px-6 py-4 text-center", isBestBttsN && "text-primary font-bold bg-primary/5")}>
                            {formatOdds(odd.bttsNo)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
