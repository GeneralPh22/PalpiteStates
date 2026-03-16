import { useState } from "react";
import { motion } from "framer-motion";
import { Users, Trophy, Star, TrendingUp, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

const DEMO_PLAYERS = [
  { rank: 1, name: "Vinicius Jr.", team: "Real Madrid", league: "LaLiga", pos: "FW", goals: 0.78, assists: 0.45, shots: 3.2, shotsOT: 1.8, rating: 8.1, logo: "https://media.api-sports.io/football/teams/541.png" },
  { rank: 2, name: "Erling Haaland", team: "Man City", league: "Premier League", pos: "FW", goals: 0.95, assists: 0.18, shots: 3.8, shotsOT: 2.1, rating: 8.4, logo: "https://media.api-sports.io/football/teams/50.png" },
  { rank: 3, name: "Harry Kane", team: "Bayern Munich", league: "Bundesliga", pos: "FW", goals: 0.85, assists: 0.32, shots: 3.4, shotsOT: 1.9, rating: 8.2, logo: "https://media.api-sports.io/football/teams/157.png" },
  { rank: 4, name: "Mohamed Salah", team: "Liverpool", league: "Premier League", pos: "FW", goals: 0.72, assists: 0.51, shots: 2.9, shotsOT: 1.6, rating: 8.0, logo: "https://media.api-sports.io/football/teams/40.png" },
  { rank: 5, name: "Kylian Mbappé", team: "Real Madrid", league: "LaLiga", pos: "FW", goals: 0.88, assists: 0.39, shots: 3.5, shotsOT: 1.8, rating: 8.3, logo: "https://media.api-sports.io/football/teams/541.png" },
  { rank: 6, name: "Lautaro Martínez", team: "Inter Milan", league: "Serie A", pos: "FW", goals: 0.74, assists: 0.22, shots: 3.1, shotsOT: 1.5, rating: 7.9, logo: "https://media.api-sports.io/football/teams/505.png" },
  { rank: 7, name: "Pedri", team: "Barcelona", league: "LaLiga", pos: "MF", goals: 0.28, assists: 0.58, shots: 1.9, shotsOT: 0.8, rating: 7.8, logo: "https://media.api-sports.io/football/teams/529.png" },
  { rank: 8, name: "Rodri", team: "Man City", league: "Premier League", pos: "MF", goals: 0.21, assists: 0.41, shots: 1.4, shotsOT: 0.6, rating: 7.9, logo: "https://media.api-sports.io/football/teams/50.png" },
  { rank: 9, name: "Khvicha Kvaratskhelia", team: "PSG", league: "Ligue 1", pos: "FW", goals: 0.65, assists: 0.48, shots: 2.8, shotsOT: 1.4, rating: 7.7, logo: "https://media.api-sports.io/football/teams/85.png" },
  { rank: 10, name: "Phil Foden", team: "Man City", league: "Premier League", pos: "MF", goals: 0.41, assists: 0.52, shots: 2.3, shotsOT: 1.1, rating: 7.8, logo: "https://media.api-sports.io/football/teams/50.png" },
  { rank: 11, name: "Raphinha", team: "Barcelona", league: "LaLiga", pos: "FW", goals: 0.59, assists: 0.44, shots: 2.6, shotsOT: 1.3, rating: 7.6, logo: "https://media.api-sports.io/football/teams/529.png" },
  { rank: 12, name: "Florian Wirtz", team: "Bayer Leverkusen", league: "Bundesliga", pos: "MF", goals: 0.38, assists: 0.67, shots: 2.1, shotsOT: 0.9, rating: 7.9, logo: "https://media.api-sports.io/football/teams/168.png" },
];

type Metric = "goals" | "assists" | "shots" | "shotsOT" | "rating";

const METRICS: { key: Metric; label: string; color: string }[] = [
  { key: "goals", label: "Goals/90", color: "text-primary" },
  { key: "assists", label: "Assists/90", color: "text-blue-400" },
  { key: "shots", label: "Shots/90", color: "text-amber-400" },
  { key: "shotsOT", label: "On Target/90", color: "text-emerald-400" },
  { key: "rating", label: "Rating", color: "text-purple-400" },
];

const POSITIONS = ["All", "FW", "MF", "DF", "GK"];
const LEAGUES = ["All", "Premier League", "LaLiga", "Bundesliga", "Serie A", "Ligue 1"];

export default function TopPlayers() {
  const [metric, setMetric] = useState<Metric>("goals");
  const [position, setPosition] = useState("All");
  const [league, setLeague] = useState("All");

  const metaInfo = METRICS.find(m => m.key === metric)!;

  const filtered = DEMO_PLAYERS
    .filter(p => position === "All" || p.pos === position)
    .filter(p => league === "All" || p.league === league)
    .sort((a, b) => b[metric] - a[metric])
    .map((p, i) => ({ ...p, rank: i + 1 }));

  const maxVal = Math.max(...filtered.map(p => p[metric]), 0.01);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3 mb-2">
          <Star className="w-8 h-8 text-amber-400" />
          Top Players
        </h1>
        <p className="text-zinc-500 text-sm">Per-90 minute performance metrics for the current season.</p>
      </div>

      {/* Filters */}
      <div className="space-y-3 mb-6">
        {/* Metric selector */}
        <div className="flex flex-wrap gap-2">
          {METRICS.map(m => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                metric === m.key
                  ? "bg-white/10 text-white border border-white/20"
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent hover:border-white/10"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {POSITIONS.map(p => (
            <button key={p} onClick={() => setPosition(p)} className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
              position === p ? "bg-primary/10 text-primary border-primary/20" : "text-zinc-500 border-transparent hover:border-white/10"
            )}>
              {p}
            </button>
          ))}
          {LEAGUES.map(l => (
            <button key={l} onClick={() => setLeague(l)} className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
              league === l ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "text-zinc-500 border-transparent hover:border-white/10"
            )}>
              {l === "All" ? "All Leagues" : l}
            </button>
          ))}
        </div>
      </div>

      {/* Players list */}
      <div className="space-y-2">
        {filtered.map((player, idx) => (
          <motion.div
            key={player.name}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.04 }}
            className="bg-[#09090b] border border-white/[0.07] rounded-xl p-4 hover:border-white/[0.14] transition-all group"
          >
            <div className="flex items-center gap-4">
              {/* Rank */}
              <div className={cn(
                "text-lg font-display font-black w-7 text-center flex-shrink-0",
                player.rank === 1 ? "text-amber-400" : player.rank === 2 ? "text-zinc-300" : player.rank === 3 ? "text-amber-600" : "text-zinc-700"
              )}>
                {player.rank}
              </div>

              {/* Team logo */}
              <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.07] flex items-center justify-center flex-shrink-0">
                {player.logo ? (
                  <img src={player.logo} alt={player.team} className="w-5 h-5 object-contain" loading="lazy" />
                ) : <Trophy className="w-4 h-4 text-zinc-600" />}
              </div>

              {/* Name & info */}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white text-sm truncate">{player.name}</div>
                <div className="text-[10px] text-zinc-500 flex items-center gap-1.5">
                  <span>{player.team}</span>
                  <span>·</span>
                  <span>{player.league}</span>
                  <span className="text-zinc-700">·</span>
                  <span className="font-medium text-zinc-600">{player.pos}</span>
                </div>
              </div>

              {/* Bar & metric value */}
              <div className="flex-1 min-w-0 hidden sm:block">
                <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(player[metric] / maxVal) * 100}%` }}
                    transition={{ duration: 0.7, delay: idx * 0.04 }}
                    className={cn("h-full rounded-full", "bg-gradient-to-r from-primary to-blue-500")}
                  />
                </div>
              </div>

              {/* Value */}
              <div className={cn("text-xl font-display font-black tabular-nums flex-shrink-0 w-14 text-right", metaInfo.color)}>
                {typeof player[metric] === "number" && metric === "rating"
                  ? player[metric].toFixed(1)
                  : (player[metric] as number).toFixed(2)}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <p className="text-[10px] text-zinc-700 text-center mt-6">
        Per-90 stats shown are demo data. Full player data available when live API is active.
      </p>
    </div>
  );
}
