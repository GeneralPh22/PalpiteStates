import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Flame, TrendingUp, RefreshCw, Target, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ValueBet {
  fixtureId: number;
  match: string;
  league: string;
  leagueLogo?: string;
  date: string;
  market: string;
  selection: string;
  bookmakerOdds: number;
  fairOdds: number;
  aiProbability: number;
  expectedValue: number;
  confidence: "High" | "Medium" | "Low";
  bookmakers: string[];
}

const today = new Date().toISOString().split("T")[0];

function useValueBets() {
  return useQuery<{ bets: ValueBet[] }>({
    queryKey: ["value-bets", today],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/matches-today`);
      if (!res.ok) throw new Error("Failed to fetch matches");
      const data = await res.json();
      const matches = data.matches ?? [];

      const bets: ValueBet[] = [];

      // Fetch analysis + odds for all matches in parallel
      const results = await Promise.all(
        matches.map(async (m) => {
          try {
            const [analysisRes, oddsRes] = await Promise.all([
              fetch(`${BASE}/api/fixture/${m.id}/analysis`),
              fetch(`${BASE}/api/fixture/${m.id}/odds`),
            ]);
            if (!analysisRes.ok || !oddsRes.ok) return null;
            const [analysis, odds] = await Promise.all([analysisRes.json(), oddsRes.json()]);
            if (!odds.available || !analysis.probabilities) return null;
            return { m, analysis, odds };
          } catch {
            return null;
          }
        })
      );

      for (const result of results) {
        if (!result) continue;
        const { m, analysis, odds } = result;

        const markets = [
          { market: "Match Winner", selection: `${m.homeTeam.name} Win`, prob: analysis.probabilities.homeWin, odd: odds.odds.home },
          { market: "Match Winner", selection: `${m.awayTeam.name} Win`, prob: analysis.probabilities.awayWin, odd: odds.odds.away },
          { market: "Match Winner", selection: "Draw", prob: analysis.probabilities.draw, odd: odds.odds.draw },
          { market: "Goals Over/Under", selection: "Over 2.5 Goals", prob: analysis.probabilities.over25, odd: odds.odds.over25 },
          { market: "Both Teams Score", selection: "BTTS Yes", prob: analysis.probabilities.btts, odd: odds.odds.bttsYes },
        ];

        for (const { market, selection, prob, odd } of markets) {
          if (!odd || !prob || prob < 0.01) continue;
          const fair = 1 / prob;
          const ev = (prob * odd) - 1;
          if (odd > fair && ev > 0.02) {
            bets.push({
              fixtureId: m.id,
              match: `${m.homeTeam.name} vs ${m.awayTeam.name}`,
              league: m.league.name,
              leagueLogo: m.league.logo,
              date: m.date,
              market,
              selection,
              bookmakerOdds: odd,
              fairOdds: parseFloat(fair.toFixed(2)),
              aiProbability: prob,
              expectedValue: parseFloat((ev * 100).toFixed(1)),
              confidence: prob >= 0.65 ? "High" : prob >= 0.5 ? "Medium" : "Low",
              bookmakers: odds.bookmakers ?? ["Bet365", "Betano"],
            });
          }
        }
      }

      bets.sort((a, b) => b.expectedValue - a.expectedValue);
      return { bets };
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

const confStyle: Record<string, string> = {
  High: "bg-primary/10 text-primary border-primary/20",
  Medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Low: "bg-zinc-700/20 text-zinc-500 border-zinc-700/20",
};

export default function ValueBets() {
  const { data, isLoading, isFetching, refetch } = useValueBets();
  const bets = data?.bets ?? [];

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
            <Flame className="w-8 h-8 text-orange-400" />
            Value Bets
          </h1>
          <p className="text-zinc-500 mt-1 text-sm">
            AI-identified value bets where bookmaker odds exceed our calculated fair odds.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] text-zinc-400 hover:text-white border border-white/[0.08] transition-colors disabled:opacity-40"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Explainer */}
      <div className="bg-[#09090b] border border-white/[0.07] rounded-2xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
          <div className="text-xs text-zinc-400 space-y-1">
            <p><strong className="text-white">How we find value bets:</strong> We calculate the true probability of each market outcome using Poisson modelling and team statistics. When bookmaker odds imply a lower probability than our model, a value bet exists.</p>
            <p className="text-zinc-600">Expected Value = (AI Probability × Bookmaker Odds) − 1. Positive EV = value bet.</p>
          </div>
        </div>
      </div>

      {/* Bets list */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-[#09090b] border border-white/[0.06] animate-pulse" />
          ))}
        </div>
      ) : bets.length === 0 ? (
        <div className="p-16 text-center bg-[#09090b] border border-white/[0.06] rounded-2xl">
          <Target className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No Value Bets Found</h3>
          <p className="text-zinc-600 text-sm">No clear value bets identified for today's matches. Check back later.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bets.map((bet, idx) => (
            <motion.div
              key={`${bet.fixtureId}-${bet.selection}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Link href={`/fixture/${bet.fixtureId}`}>
                <div className="bg-[#09090b] border border-amber-500/20 hover:border-amber-500/35 rounded-2xl p-5 transition-all cursor-pointer group relative overflow-hidden">
                  {/* VALUE BET badge */}
                  <div className="absolute top-0 right-0">
                    <div className="bg-amber-400/90 text-black text-[9px] font-black px-3 py-1 rounded-bl-xl uppercase tracking-widest flex items-center gap-1">
                      ⚡ Value Bet
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-4 mb-4 pr-20">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {bet.leagueLogo && (
                          <img src={bet.leagueLogo} alt="" className="w-4 h-4 object-contain opacity-70" loading="lazy" />
                        )}
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold truncate">
                          {bet.league}
                        </span>
                        <span className="text-[10px] text-zinc-700">·</span>
                        <span className="text-[10px] text-zinc-600">{format(new Date(bet.date), "HH:mm")}</span>
                      </div>
                      <div className="text-sm font-bold text-white">{bet.match}</div>
                      <div className="text-xs text-amber-300 font-semibold mt-0.5">
                        {bet.selection}
                        <span className="text-zinc-600 font-normal ml-1">· {bet.market}</span>
                      </div>
                    </div>
                  </div>

                  {/* Main stats grid */}
                  <div className="grid grid-cols-3 gap-3 text-center mb-3">
                    <div className="bg-amber-500/[0.07] rounded-xl py-2.5 border border-amber-500/20">
                      <div className="text-[9px] text-amber-600 uppercase font-bold mb-1">Odd Bookmaker</div>
                      <div className="text-2xl font-display font-black text-amber-300">{bet.bookmakerOdds.toFixed(2)}</div>
                    </div>
                    <div className="bg-white/[0.03] rounded-xl py-2.5 border border-white/[0.05]">
                      <div className="text-[9px] text-zinc-600 uppercase font-semibold mb-1">Odd Justa (AI)</div>
                      <div className="text-2xl font-display font-black text-zinc-300">{bet.fairOdds}</div>
                    </div>
                    <div className="bg-primary/[0.07] rounded-xl py-2.5 border border-primary/20">
                      <div className="text-[9px] text-primary/70 uppercase font-bold mb-1">Prob AI</div>
                      <div className="text-2xl font-display font-black text-primary">{Math.round(bet.aiProbability * 100)}%</div>
                    </div>
                  </div>

                  {/* EV bar */}
                  <div className="rounded-xl bg-emerald-500/[0.07] border border-emerald-500/20 px-3 py-2.5 flex items-center justify-between">
                    <div>
                      <div className="text-[9px] text-zinc-600 uppercase tracking-wider font-semibold">Valor Esperado (EV)</div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">Prob real superior à implícita nos odds</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xl font-black text-emerald-400">+{bet.expectedValue}%</div>
                      <div className="text-[9px] text-emerald-600 font-semibold">POSITIVO</div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className={cn("text-[10px] font-bold px-2.5 py-0.5 rounded-full border", confStyle[bet.confidence])}>
                      {bet.confidence === "High" ? "Alta confiança" : bet.confidence === "Medium" ? "Confiança média" : "Baixa confiança"}
                    </span>
                    <span className="text-[9px] text-zinc-700 group-hover:text-zinc-500 transition-colors flex items-center gap-1">
                      Ver análise completa <ExternalLink className="w-2.5 h-2.5" />
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-zinc-700 text-center mt-6">
        Value bets are not guaranteed wins. Bet responsibly. 18+ only.
      </p>
    </div>
  );
}
