import { useGetPlayer } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";
import { ArrowLeft, User, Activity, Flame, ShieldAlert, Target } from "lucide-react";

function StatCard({ title, value, subtitle, icon: Icon, isPositive = true }: any) {
  return (
    <div className="bg-card rounded-2xl p-5 border border-white/5 relative overflow-hidden group hover:border-white/20 transition-all">
      <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
      <div className="flex justify-between items-start mb-2 relative z-10">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <Icon className={`w-5 h-5 ${isPositive ? 'text-primary' : 'text-blue-400'}`} />
      </div>
      <div className="relative z-10">
        <span className="text-3xl font-display font-bold text-white block">{value}</span>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
    </div>
  );
}

export default function PlayerDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: player, isLoading, error } = useGetPlayer(Number(id));

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 animate-pulse">
        <div className="h-8 w-32 bg-card rounded mb-8" />
        <div className="h-48 bg-card rounded-3xl mb-8" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-card rounded-2xl" />)}
        </div>
        <div className="h-96 bg-card rounded-2xl" />
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <h2 className="text-2xl font-bold text-destructive mb-4">Player Not Found</h2>
        <Link href="/players" className="text-primary hover:underline">Return to Players</Link>
      </div>
    );
  }

  // Transform recent matches for chart
  const chartData = [...player.recentMatches].reverse().map(match => ({
    name: match.opponent.substring(0, 3).toUpperCase(),
    date: match.date,
    Goals: match.goals,
    Assists: match.assists,
    Shots: match.shotsOnTarget
  }));

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <Link href="/players" className="inline-flex items-center gap-2 text-muted-foreground hover:text-white transition-colors mb-8 bg-card px-4 py-2 rounded-full border border-white/5 hover:border-white/10 w-fit">
        <ArrowLeft className="w-4 h-4" />
        Back to Directory
      </Link>

      {/* Header */}
      <div className="bg-card rounded-3xl p-6 md:p-10 border border-white/5 shadow-2xl flex flex-col md:flex-row items-center gap-8 mb-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
        
        <div className="w-32 h-32 md:w-40 md:h-40 rounded-2xl bg-background border-2 border-white/10 overflow-hidden shrink-0 shadow-xl relative z-10">
          {player.photoUrl ? (
            <img src={player.photoUrl} className="w-full h-full object-cover" alt={player.name} />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-secondary">
              <User className="w-16 h-16 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="flex-1 text-center md:text-left relative z-10">
          <div className="flex items-center justify-center md:justify-start gap-3 mb-3">
            <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-bold uppercase tracking-wider border border-primary/30">
              {player.position || 'Unknown Pos'}
            </span>
            <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 bg-background px-3 py-1 rounded-full border border-white/5">
              <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                {player.team.logoUrl && <img src={player.team.logoUrl} alt="" className="w-3 h-3" />}
              </div>
              {player.team.name}
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-black text-white mb-2">{player.name}</h1>
          <div className="text-muted-foreground text-sm flex items-center justify-center md:justify-start gap-4">
            <span>{player.nationality}</span>
            {player.age && <span>• {player.age} years old</span>}
            <span>• {player.stats.matchesPlayed} Matches (L10)</span>
          </div>
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard 
          title="Goals per 90" 
          value={player.stats.goalsPer90.toFixed(2)} 
          subtitle={`${player.stats.goals} total goals`}
          icon={Target}
        />
        <StatCard 
          title="Assists per 90" 
          value={player.stats.assistsPer90.toFixed(2)} 
          subtitle={`${player.stats.assists} total assists`}
          icon={Flame}
        />
        <StatCard 
          title="Shots on Target" 
          value={player.stats.shotsOnTargetPer90.toFixed(2)} 
          subtitle="per 90 mins"
          icon={Activity}
          isPositive={false}
        />
        <StatCard 
          title="Tackles" 
          value={player.stats.tacklesPer90.toFixed(2)} 
          subtitle="per 90 mins"
          icon={ShieldAlert}
          isPositive={false}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        {/* Chart */}
        <div className="lg:col-span-2 bg-card rounded-3xl p-6 border border-white/5 shadow-xl">
          <h3 className="text-xl font-display font-bold mb-6">Recent Performance (Last 10 Matches)</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="name" stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#1c1c1c', border: '1px solid #333', borderRadius: '12px', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                  cursor={{ fill: '#ffffff05' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                <Bar dataKey="Goals" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="Assists" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Discipline / Deep Stats */}
        <div className="bg-card rounded-3xl p-6 border border-white/5 shadow-xl flex flex-col">
          <h3 className="text-xl font-display font-bold mb-6">Discipline & Metrics</h3>
          
          <div className="space-y-5 flex-1">
            <div className="flex justify-between items-center pb-3 border-b border-white/5">
              <span className="text-muted-foreground">Fouls Committed</span>
              <span className="font-bold text-white">{player.stats.foulsCommitted}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-white/5">
              <span className="text-muted-foreground">Fouls Suffered</span>
              <span className="font-bold text-white">{player.stats.foulsSuffered}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-white/5">
              <span className="text-muted-foreground flex items-center gap-2">
                <div className="w-3 h-4 bg-yellow-500 rounded-sm" /> Yellow Cards
              </span>
              <span className="font-bold text-white">{player.stats.yellowCards}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-white/5">
              <span className="text-muted-foreground flex items-center gap-2">
                <div className="w-3 h-4 bg-red-500 rounded-sm" /> Red Cards
              </span>
              <span className="font-bold text-white">{player.stats.redCards}</span>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="text-muted-foreground">Total Shots</span>
              <span className="font-bold text-white">{player.stats.totalShots}</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
