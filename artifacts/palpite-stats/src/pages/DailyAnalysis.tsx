import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { format } from "date-fns";
import { BarChart2, Target, Clock, AlertTriangle, Trophy, Flame, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const today = new Date().toISOString().split("T")[0];

interface MatchWithAnalysis {
  id: number;
  match: string;
  league: string;
  leagueLogo?: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeProb: number;
  drawProb: number;
  awayProb: number;
  over25: number;
  btts: number;
  xg: number;
  status: string;
  homeOdds?: number;
  awayOdds?: number;
  drawOdds?: number;
  hasValue?: boolean;
}

function useAnalysis() {
  return useQuery<{ matches: MatchWithAnalysis[]; demo: boolean }>({
    queryKey: ["daily-analysis", today],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/matches-today`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      const matches: MatchWithAnalysis[] = [];

      const todayMatches = (data.matches ?? []).slice(0, 8);
      const results = await Promise.all(
        todayMatches.map(async (m) => {
          try {
            const [aRes, oRes] = await Promise.all([
              fetch(`${BASE}/api/fixture/${m.id}/analysis`),
              fetch(`${BASE}/api/fixture/${m.id}/odds`),
            ]);
            const analysis = aRes.ok ? await aRes.json() : null;
            const odds = oRes.ok ? await oRes.json() : null;
            return { m, analysis, odds };
          } catch {
            return null;
          }
        })
      );

      for (const result of results) {
        if (!result) continue;
        const { m, analysis, odds } = result;
        if (!analysis?.probabilities) continue;
        const p = analysis.probabilities;
        const o = odds?.odds;
        const hasValue = o && (
          (o.home && o.home > 1 / p.homeWin) ||
          (o.away && o.away > 1 / p.awayWin) ||
          (o.over25 && o.over25 > 1 / p.over25)
        );
        matches.push({
          id: m.id,
          match: `${m.homeTeam.name} vs ${m.awayTeam.name}`,
          league: m.league.name,
          leagueLogo: m.league.logo,
          date: m.date,
          homeTeam: m.homeTeam.name,
          awayTeam: m.awayTeam.name,
          homeProb: p.homeWin,
          drawProb: p.draw,
          awayProb: p.awayWin,
          over25: p.over25,
          btts: p.btts,
          xg: analysis.expectedGoals,
          status: m.status.short,
          homeOdds: o?.home,
          drawOdds: o?.draw,
          awayOdds: o?.away,
          hasValue: !!hasValue,
        });
      }

      return { matches, demo: data.demo ?? false };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export default function DailyAnalysis() {
  const { data, isLoading } = useAnalysis();
  const matches = data?.matches ?? [];

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3 mb-2">
          <BarChart2 className="w-8 h-8 text-primary" />
          Daily Analysis
        </h1>
        <p className="text-zinc-500 text-sm">
          AI probability analysis for {format(new Date(), "EEEE, dd MMMM yyyy")}
        </p>
      </div>

      {data?.demo && (
        <div className="mb-5 flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="text-xs text-amber-300/80">Demo mode — probabilities calculated from sample fixture data.</p>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-36 rounded-2xl bg-[#09090b] border border-white/[0.06] animate-pulse" />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <div className="p-16 text-center bg-[#09090b] border border-white/[0.06] rounded-2xl">
          <Target className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-600">No matches to analyze today.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map((m, idx) => {
            const topBet =
              m.homeProb > m.awayProb && m.homeProb > m.drawProb
                ? { label: `${m.homeTeam} Win`, prob: m.homeProb }
                : m.awayProb > m.homeProb && m.awayProb > m.drawProb
                ? { label: `${m.awayTeam} Win`, prob: m.awayProb }
                : { label: "Draw", prob: m.drawProb };

            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.07 }}
              >
                <Link href={`/fixture/${m.id}`}>
                  <div className="bg-[#09090b] border border-white/[0.07] hover:border-primary/20 rounded-2xl p-5 transition-all cursor-pointer group">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {m.leagueLogo && <img src={m.leagueLogo} alt="" className="w-4 h-4 object-contain opacity-70" loading="lazy" />}
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">{m.league}</span>
                          <span className="text-[10px] text-zinc-700">·</span>
                          <span className="flex items-center gap-1 text-[10px] text-zinc-600">
                            <Clock className="w-2.5 h-2.5" />
                            {format(new Date(m.date), "HH:mm")}
                          </span>
                          {m.status === "1H" || m.status === "2H" ? (
                            <span className="text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full">LIVE</span>
                          ) : null}
                          {m.hasValue && (
                            <span className="text-[9px] font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                              <Flame className="w-2.5 h-2.5" /> Value
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-bold text-white">{m.match}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="text-[10px] text-zinc-500">Top pick</span>
                        <span className="text-xs font-bold text-primary">{topBet.label}</span>
                        <span className="text-sm font-display font-black text-white">{Math.round(topBet.prob * 100)}%</span>
                      </div>
                    </div>

                    {/* Probability bars */}
                    <div className="space-y-2 mb-4">
                      <div className="flex gap-1 h-2 rounded-full overflow-hidden">
                        <div className="bg-primary rounded-l-full" style={{ width: `${m.homeProb * 100}%` }} />
                        <div className="bg-zinc-600" style={{ width: `${m.drawProb * 100}%` }} />
                        <div className="bg-blue-500 rounded-r-full" style={{ width: `${m.awayProb * 100}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-zinc-500">
                        <span>{m.homeTeam.split(" ").slice(-1)[0]} {Math.round(m.homeProb * 100)}%</span>
                        <span>Draw {Math.round(m.drawProb * 100)}%</span>
                        <span>{m.awayTeam.split(" ").slice(-1)[0]} {Math.round(m.awayProb * 100)}%</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: "xG", value: m.xg.toFixed(1), color: "text-white" },
                        { label: "O2.5", value: `${Math.round(m.over25 * 100)}%`, color: "text-amber-400" },
                        { label: "BTTS", value: `${Math.round(m.btts * 100)}%`, color: "text-emerald-400" },
                        {
                          label: "Best",
                          value: m.homeOdds ? Math.min(m.homeOdds!, m.awayOdds!, m.drawOdds!).toFixed(2) : "—",
                          color: "text-orange-400",
                        },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="text-center bg-white/[0.02] rounded-lg py-2 border border-white/[0.04]">
                          <div className="text-[9px] text-zinc-600 uppercase font-semibold mb-0.5">{label}</div>
                          <div className={cn("text-sm font-bold", color)}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
