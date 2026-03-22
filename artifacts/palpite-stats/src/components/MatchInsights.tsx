import { useQuery } from "@tanstack/react-query";
import { TrendingUp, ChevronDown, ChevronUp, Loader2, AlertCircle, Lock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface OddsData {
  available: boolean;
  fixtureId: string;
  odds: {
    home: number | null;
    draw: number | null;
    away: number | null;
    over25: number | null;
    under25: number | null;
    bttsYes: number | null;
    bttsNo: number | null;
  } | null;
  bookmakers: string[];
}

interface BestBet {
  market: string;
  probability: number;
  confidence: "High" | "Medium" | "Low";
}

interface TeamStats {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  avgGoalsFor: number | null;
  avgGoalsAgainst: number | null;
  over25Pct: number | null;
  bttsPct: number | null;
  form: string | null;
}

interface AnalysisData {
  probabilities: {
    homeWin: number;
    draw: number;
    awayWin: number;
    over25: number;
    under25: number;
    btts: number;
  };
  expectedGoals: number;
  homeStats: TeamStats | null;
  awayStats: TeamStats | null;
  bestBet: BestBet | null;
  reasons: string[];
  formInsight: string;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function OddPill({ label, value, highlight }: { label: string; value: number | null | undefined; highlight?: boolean }) {
  return (
    <div className={cn(
      "flex flex-col items-center rounded-xl px-3 py-2 border",
      highlight ? "bg-primary/15 border-primary/30 text-primary" : "bg-white/[0.04] border-white/[0.07] text-zinc-300"
    )}>
      <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-semibold mb-0.5">{label}</span>
      <span className="text-sm font-bold tabular-nums">{value != null ? value.toFixed(2) : "—"}</span>
    </div>
  );
}

function ProbBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-[11px]">
        <span className="text-zinc-400 font-medium">{label}</span>
        <span className="text-white font-bold tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FormDots({ form }: { form: string | null | undefined }) {
  if (!form) return null;
  return (
    <div className="flex gap-1">
      {form.slice(-5).split("").map((c, i) => (
        <span key={i} className={cn(
          "w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center",
          c === "W" && "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
          c === "D" && "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30",
          c === "L" && "bg-red-500/20 text-red-400 border border-red-500/30",
        )}>{c}</span>
      ))}
    </div>
  );
}

function StatChip({ label, value, highlight }: { label: string; value: string | number | null; highlight?: boolean }) {
  return (
    <div className={cn(
      "flex flex-col items-center rounded-lg px-2 py-1.5 border text-center",
      highlight ? "bg-amber-500/10 border-amber-500/20" : "bg-white/[0.03] border-white/[0.06]"
    )}>
      <span className="text-[8.5px] text-zinc-600 uppercase tracking-wider font-semibold mb-0.5">{label}</span>
      <span className={cn("text-[13px] font-black tabular-nums", highlight ? "text-amber-400" : "text-zinc-300")}>
        {value ?? "—"}
      </span>
    </div>
  );
}

function ConfidenceBadge({ level }: { level: "High" | "Medium" | "Low" }) {
  return (
    <span className={cn(
      "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
      level === "High"   && "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
      level === "Medium" && "bg-amber-500/15 text-amber-400 border-amber-500/25",
      level === "Low"    && "bg-zinc-500/15 text-zinc-500 border-zinc-500/25",
    )}>{level} Confidence</span>
  );
}

function UpgradeBanner() {
  return (
    <div className="flex flex-col items-center gap-2 py-4 px-3 bg-white/[0.02] rounded-xl border border-white/[0.06]">
      <Lock className="w-4 h-4 text-zinc-600" />
      <p className="text-[10px] text-zinc-600 text-center leading-relaxed">
        Análise completa disponível em planos premium
      </p>
      <Link href="/pricing" className="text-[10px] text-primary font-semibold hover:underline">
        Ver planos →
      </Link>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

interface Props {
  fixtureId: number;
  homeTeamId: number;
  awayTeamId: number;
  leagueId: number;
  homeTeamName: string;
  awayTeamName: string;
}

export function MatchInsights({ fixtureId, homeTeamId, awayTeamId, leagueId, homeTeamName, awayTeamName }: Props) {
  const [open, setOpen] = useState(false);
  const { accessLevel } = useAuth();
  const isLimited = accessLevel === "limited";
  const today = new Date().toISOString().split("T")[0];

  const oddsQuery = useQuery<OddsData>({
    queryKey: ["live-odds", fixtureId, today],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/live-odds?fixture=${fixtureId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const analysisQuery = useQuery<AnalysisData>({
    queryKey: ["fixture-analysis", homeTeamId, awayTeamId, leagueId, today],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/fixture-analysis?homeTeam=${homeTeamId}&awayTeam=${awayTeamId}&league=${leagueId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: open,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const isLoading = oddsQuery.isLoading || analysisQuery.isLoading;
  const analysis  = analysisQuery.data;
  const odds      = oddsQuery.data?.odds;

  return (
    <div className="border-t border-white/[0.05]">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-semibold text-zinc-500 hover:text-zinc-300 transition-colors group"
      >
        <span className="flex items-center gap-1.5">
          <TrendingUp className="w-3 h-3 text-primary/70 group-hover:text-primary transition-colors" />
          Odds & AI Analysis
          {isLimited && <Lock className="w-2.5 h-2.5 text-zinc-600" />}
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">

          {isLoading ? (
            <div className="flex items-center justify-center py-6 gap-2 text-zinc-600 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading analysis...
            </div>
          ) : (oddsQuery.isError && analysisQuery.isError) ? (
            <div className="flex items-center gap-2 text-red-400/70 text-xs py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Data unavailable for this match.
            </div>
          ) : (
            <>

              {/* ── 1. ODDS ── */}
              {odds && (
                <div className="space-y-2">
                  <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold">
                    Live Odds{oddsQuery.data?.bookmakers?.length ? ` · ${oddsQuery.data.bookmakers.slice(0, 2).join(", ")}` : ""}
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    <OddPill label="Home" value={odds.home} highlight />
                    <OddPill label="Draw" value={odds.draw} />
                    <OddPill label="Away" value={odds.away} />
                  </div>
                  {!isLimited && (odds.over25 || odds.bttsYes) && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <OddPill label="Over 2.5" value={odds.over25} />
                      <OddPill label="BTTS Yes" value={odds.bttsYes} />
                    </div>
                  )}
                  {isLimited && (
                    <div className="grid grid-cols-2 gap-1.5 opacity-30 blur-[2px] pointer-events-none select-none">
                      <OddPill label="Over 2.5" value={null} />
                      <OddPill label="BTTS Yes" value={null} />
                    </div>
                  )}
                </div>
              )}

              {!oddsQuery.data?.available && !oddsQuery.isLoading && (
                <p className="text-[10px] text-zinc-700 italic">Odds not yet available for this match.</p>
              )}

              {analysis && !isLimited && (
                <>
                  {/* ── 2. QUICK FORM ── */}
                  {(analysis.homeStats || analysis.awayStats) && (
                    <div className="space-y-2 pt-1 border-t border-white/[0.04]">
                      <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold">Quick Form</span>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { name: homeTeamName, stats: analysis.homeStats },
                          { name: awayTeamName, stats: analysis.awayStats },
                        ].map(({ name, stats }) => stats && (
                          <div key={name} className="space-y-1">
                            <span className="text-[10px] text-zinc-400 font-medium truncate block">{name}</span>
                            <FormDots form={stats.form} />
                            <span className="text-[9px] text-zinc-700">
                              {stats.wins}W {stats.draws}D {stats.losses}L
                            </span>
                          </div>
                        ))}
                      </div>
                      {analysis.formInsight && (
                        <p className="text-[10px] text-zinc-500 italic">{analysis.formInsight}</p>
                      )}
                    </div>
                  )}

                  {/* ── 3. KEY STATS ── */}
                  {(analysis.homeStats || analysis.awayStats) && (
                    <div className="space-y-2 pt-1 border-t border-white/[0.04]">
                      <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold">Key Stats</span>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { name: homeTeamName, stats: analysis.homeStats },
                          { name: awayTeamName, stats: analysis.awayStats },
                        ].map(({ name, stats }) => stats && (
                          <div key={name} className="space-y-1.5">
                            <span className="text-[9px] text-zinc-600 font-semibold truncate block">{name}</span>
                            <div className="grid grid-cols-2 gap-1">
                              <StatChip label="Avg Goals" value={stats.avgGoalsFor != null ? stats.avgGoalsFor.toFixed(1) : null} />
                              <StatChip label="BTTS %" value={stats.bttsPct != null ? `${stats.bttsPct}%` : null} />
                              <StatChip label="O 2.5 %" value={stats.over25Pct != null ? `${stats.over25Pct}%` : null} highlight={(stats.over25Pct ?? 0) >= 55} />
                              <StatChip label="Avg Conc" value={stats.avgGoalsAgainst != null ? stats.avgGoalsAgainst.toFixed(1) : null} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── 4. PROBABILITIES ── */}
                  <div className="space-y-2 pt-1 border-t border-white/[0.04]">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold">Probability</span>
                      <span className="text-[9px] text-zinc-700">xG {analysis.expectedGoals}</span>
                    </div>
                    <div className="space-y-1.5">
                      <ProbBar label={`${homeTeamName} Win`} value={analysis.probabilities.homeWin} color="bg-primary" />
                      <ProbBar label="Draw"                  value={analysis.probabilities.draw}    color="bg-zinc-500" />
                      <ProbBar label={`${awayTeamName} Win`} value={analysis.probabilities.awayWin} color="bg-blue-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      <div className={cn(
                        "rounded-lg p-2 border text-center",
                        analysis.probabilities.over25 >= 0.5 ? "bg-amber-500/10 border-amber-500/20" : "bg-white/[0.03] border-white/[0.06]"
                      )}>
                        <div className="text-[8.5px] text-zinc-600 uppercase tracking-wider font-semibold mb-0.5">Over 2.5</div>
                        <div className={cn("text-sm font-black tabular-nums", analysis.probabilities.over25 >= 0.5 ? "text-amber-400" : "text-zinc-300")}>
                          {Math.round(analysis.probabilities.over25 * 100)}%
                        </div>
                      </div>
                      <div className={cn(
                        "rounded-lg p-2 border text-center",
                        analysis.probabilities.btts >= 0.5 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-white/[0.03] border-white/[0.06]"
                      )}>
                        <div className="text-[8.5px] text-zinc-600 uppercase tracking-wider font-semibold mb-0.5">BTTS</div>
                        <div className={cn("text-sm font-black tabular-nums", analysis.probabilities.btts >= 0.5 ? "text-emerald-400" : "text-zinc-300")}>
                          {Math.round(analysis.probabilities.btts * 100)}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── 5. BEST BET ── */}
                  {analysis.bestBet && (
                    <div className="pt-1 border-t border-white/[0.04] space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Zap className="w-3 h-3 text-amber-400" />
                        <span className="text-[9px] text-amber-400 uppercase tracking-widest font-bold">Best Bet</span>
                      </div>
                      <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-bold text-white leading-tight">{analysis.bestBet.market}</span>
                          <ConfidenceBadge level={analysis.bestBet.confidence} />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-zinc-500 font-medium">Probability:</span>
                          <span className="text-[10px] font-bold text-amber-400">{analysis.bestBet.probability}%</span>
                        </div>
                        {/* ── Quick Reasons ── */}
                        {analysis.reasons.length > 0 && (
                          <ul className="space-y-0.5 pt-1 border-t border-white/[0.05]">
                            {analysis.reasons.map((r, i) => (
                              <li key={i} className="text-[10px] text-zinc-500 flex items-start gap-1.5">
                                <span className="text-amber-500/60 flex-shrink-0 mt-px">•</span>
                                {r}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      {/* ── Affiliate buttons ── */}
                      <div className="grid grid-cols-2 gap-2 pt-0.5">
                        <a
                          href="https://referme.to/pedroa-6161"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center rounded-lg bg-[#e63946]/12 border border-[#e63946]/28 hover:bg-[#e63946]/22 px-2 py-1.5 transition-colors"
                        >
                          <span className="text-[10px] font-semibold text-[#e63946]">Apostar na Betano</span>
                        </a>
                        <a
                          href="https://promos.betfair.bet.br/choose-your-refer-and-earn-offer?referrerCode=PAXVX77DL"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center rounded-lg bg-[#f9a825]/8 border border-[#f9a825]/22 hover:bg-[#f9a825]/18 px-2 py-1.5 transition-colors"
                        >
                          <span className="text-[10px] font-semibold text-[#f9a825]">Ver odds Betfair</span>
                        </a>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Limited users — teaser + upgrade */}
              {analysis && isLimited && (
                <div className="space-y-2 pt-1 border-t border-white/[0.04]">
                  <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold">AI Probabilities</span>
                  <div className="space-y-1.5 opacity-35 blur-[3px] pointer-events-none select-none">
                    <ProbBar label={`${homeTeamName} Win`} value={analysis.probabilities.homeWin} color="bg-primary" />
                    <ProbBar label="Draw"                  value={analysis.probabilities.draw}    color="bg-zinc-500" />
                  </div>
                  <UpgradeBanner />
                </div>
              )}

            </>
          )}
        </div>
      )}
    </div>
  );
}
