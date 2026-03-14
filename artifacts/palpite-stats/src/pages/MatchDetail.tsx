import { useGetMatch } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, Shield, Swords, TrendingUp, Target, Activity } from "lucide-react";
import { cn, formatProbability } from "@/lib/utils";

function FormBadge({ form }: { form: string }) {
  return (
    <div className="flex gap-1">
      {form.split('').map((char, i) => {
        const isWin = char === 'W';
        const isLoss = char === 'L';
        const isDraw = char === 'D';
        return (
          <span 
            key={i} 
            className={cn(
              "w-6 h-6 flex items-center justify-center rounded text-xs font-bold",
              isWin && "bg-primary/20 text-primary border border-primary/30",
              isLoss && "bg-red-500/20 text-red-500 border border-red-500/30",
              isDraw && "bg-secondary text-muted-foreground border border-white/10"
            )}
          >
            {char}
          </span>
        );
      })}
    </div>
  );
}

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: match, isLoading, error } = useGetMatch(Number(id));

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl animate-pulse">
        <div className="h-10 bg-card rounded-lg w-32 mb-8" />
        <div className="h-64 bg-card rounded-2xl mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-80 bg-card rounded-2xl" />
          <div className="h-80 bg-card rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <h2 className="text-2xl font-bold text-destructive mb-4">Match Not Found</h2>
        <Link href="/matches" className="text-primary hover:underline">Return to Matches</Link>
      </div>
    );
  }

  const { analysis } = match;

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <Link href="/matches" className="inline-flex items-center gap-2 text-muted-foreground hover:text-white transition-colors mb-8 bg-card px-4 py-2 rounded-full border border-white/5 hover:border-white/10">
        <ArrowLeft className="w-4 h-4" />
        Back to Matches
      </Link>

      {/* Match Header */}
      <div className="bg-card rounded-3xl p-8 md:p-12 border border-white/5 shadow-2xl relative overflow-hidden mb-8">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary via-blue-500 to-primary opacity-50" />
        
        <div className="text-center mb-8">
          <span className="inline-block px-3 py-1 rounded-full bg-secondary border border-white/10 text-sm text-muted-foreground font-medium">
            {match.league.name} • {format(new Date(match.kickoffTime), 'PPP p')}
          </span>
        </div>

        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <div className="flex flex-col items-center gap-4 flex-1">
            <div className="w-20 h-20 md:w-24 md:h-24 bg-background rounded-2xl flex items-center justify-center border border-white/10 shadow-lg">
              {match.homeTeam.logoUrl && <img src={match.homeTeam.logoUrl} className="w-12 h-12 md:w-16 md:h-16 object-contain" alt="" />}
            </div>
            <h2 className="text-xl md:text-3xl font-display font-bold text-center">{match.homeTeam.name}</h2>
            <FormBadge form={analysis.homeRecentForm} />
          </div>

          <div className="flex flex-col items-center justify-center px-4 md:px-12">
            <div className="text-5xl md:text-7xl font-display font-black bg-clip-text text-transparent bg-gradient-to-br from-white to-white/50 mb-2 drop-shadow-lg">
              {match.status === 'scheduled' ? 'VS' : `${match.homeScore} - ${match.awayScore}`}
            </div>
            <div className={cn(
              "text-sm font-bold tracking-widest uppercase px-3 py-1 rounded-full",
              match.status === 'live' ? "bg-red-500/20 text-red-400" : "text-muted-foreground bg-secondary"
            )}>
              {match.status}
            </div>
          </div>

          <div className="flex flex-col items-center gap-4 flex-1">
            <div className="w-20 h-20 md:w-24 md:h-24 bg-background rounded-2xl flex items-center justify-center border border-white/10 shadow-lg">
              {match.awayTeam.logoUrl && <img src={match.awayTeam.logoUrl} className="w-12 h-12 md:w-16 md:h-16 object-contain" alt="" />}
            </div>
            <h2 className="text-xl md:text-3xl font-display font-bold text-center">{match.awayTeam.name}</h2>
            <FormBadge form={analysis.awayRecentForm} />
          </div>
        </div>
      </div>

      {/* Analysis Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        
        {/* Offensive vs Defensive */}
        <div className="bg-card rounded-2xl p-6 border border-white/5 shadow-xl">
          <h3 className="text-xl font-display font-bold mb-6 flex items-center gap-2">
            <Swords className="w-5 h-5 text-primary" /> Team Strength
          </h3>
          
          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-sm text-muted-foreground mb-2">
                <span>{match.homeTeam.name} Offense</span>
                <span className="font-bold text-white">{analysis.homeOffensiveAvg} avg goals</span>
              </div>
              <div className="h-2.5 bg-background rounded-full overflow-hidden border border-white/5">
                <div className="h-full bg-primary" style={{ width: `${Math.min(analysis.homeOffensiveAvg / 3 * 100, 100)}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm text-muted-foreground mb-2">
                <span>{match.awayTeam.name} Defense</span>
                <span className="font-bold text-white">{analysis.awayDefensiveAvg} avg goals against</span>
              </div>
              <div className="h-2.5 bg-background rounded-full overflow-hidden border border-white/5">
                <div className="h-full bg-blue-500" style={{ width: `${Math.min(analysis.awayDefensiveAvg / 3 * 100, 100)}%` }} />
              </div>
            </div>

            <div className="h-px w-full bg-white/5 my-4" />

            <div>
              <div className="flex justify-between text-sm text-muted-foreground mb-2">
                <span>{match.awayTeam.name} Offense</span>
                <span className="font-bold text-white">{analysis.awayOffensiveAvg} avg goals</span>
              </div>
              <div className="h-2.5 bg-background rounded-full overflow-hidden border border-white/5">
                <div className="h-full bg-blue-500" style={{ width: `${Math.min(analysis.awayOffensiveAvg / 3 * 100, 100)}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm text-muted-foreground mb-2">
                <span>{match.homeTeam.name} Defense</span>
                <span className="font-bold text-white">{analysis.homeDefensiveAvg} avg goals against</span>
              </div>
              <div className="h-2.5 bg-background rounded-full overflow-hidden border border-white/5">
                <div className="h-full bg-primary" style={{ width: `${Math.min(analysis.homeDefensiveAvg / 3 * 100, 100)}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Predictive Metrics */}
        <div className="bg-card rounded-2xl p-6 border border-white/5 shadow-xl">
          <h3 className="text-xl font-display font-bold mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" /> AI Match Predictions
          </h3>

          <div className="grid grid-cols-2 gap-4 h-full pb-8">
            <div className="bg-background rounded-xl p-4 border border-white/5 flex flex-col justify-center">
              <span className="text-sm text-muted-foreground font-medium mb-1">Over 2.5 Goals</span>
              <span className="text-3xl font-display font-bold text-white">{formatProbability(analysis.over25Probability)}</span>
              <div className="mt-3 h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-emerald-400" style={{ width: `${analysis.over25Probability * 100}%` }} />
              </div>
            </div>

            <div className="bg-background rounded-xl p-4 border border-white/5 flex flex-col justify-center">
              <span className="text-sm text-muted-foreground font-medium mb-1">BTTS (Yes)</span>
              <span className="text-3xl font-display font-bold text-white">{formatProbability(analysis.bttsProbalility)}</span>
              <div className="mt-3 h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-emerald-400" style={{ width: `${analysis.bttsProbalility * 100}%` }} />
              </div>
            </div>

            <div className="col-span-2 bg-gradient-to-br from-primary/10 to-transparent rounded-xl p-5 border border-primary/20 flex items-center justify-between">
              <div>
                <span className="flex items-center gap-2 text-primary font-semibold mb-1">
                  <Target className="w-4 h-4" /> Expected Goals (xG) Total
                </span>
                <span className="text-sm text-muted-foreground">Combined predicted goals for both teams</span>
              </div>
              <span className="text-4xl font-display font-black text-white">{analysis.expectedGoals.toFixed(2)}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
