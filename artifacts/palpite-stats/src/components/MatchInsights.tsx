import { useQuery } from "@tanstack/react-query";
import { TrendingUp, ChevronDown, ChevronUp, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

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

interface AnalysisData {
  probabilities: {
    homeWin: number;
    draw: number;
    awayWin: number;
    over25: number;
    under25: number;
    btts: number;
    playerGoal: number;
    cornerOver9: number;
  };
  expectedGoals: number;
  homeStats: {
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    form: string | null;
  } | null;
  awayStats: {
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    form: string | null;
  } | null;
}

function OddPill({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | null | undefined;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl px-3 py-2 border transition-colors",
        highlight
          ? "bg-primary/15 border-primary/30 text-primary"
          : "bg-white/[0.04] border-white/[0.07] text-zinc-300"
      )}
    >
      <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-semibold mb-0.5">
        {label}
      </span>
      <span className="text-sm font-bold tabular-nums">
        {value != null ? value.toFixed(2) : "—"}
      </span>
    </div>
  );
}

function ProbBar({
  label,
  value,
  color,
  sublabel,
}: {
  label: string;
  value: number;
  color: string;
  sublabel?: string;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-[11px]">
        <span className="text-zinc-400 font-medium">{label}</span>
        <div className="flex items-center gap-1">
          {sublabel && <span className="text-zinc-600 text-[10px]">{sublabel}</span>}
          <span className="text-white font-bold tabular-nums">{pct}%</span>
        </div>
      </div>
      <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function FormDots({ form }: { form: string | null | undefined }) {
  if (!form) return null;
  const chars = form.slice(-5).split("");
  return (
    <div className="flex gap-1">
      {chars.map((c, i) => (
        <span
          key={i}
          className={cn(
            "w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center",
            c === "W" && "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
            c === "D" && "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30",
            c === "L" && "bg-red-500/20 text-red-400 border border-red-500/30"
          )}
        >
          {c}
        </span>
      ))}
    </div>
  );
}

interface Props {
  fixtureId: number;
  homeTeamId: number;
  awayTeamId: number;
  leagueId: number;
  homeTeamName: string;
  awayTeamName: string;
}

export function MatchInsights({
  fixtureId,
  homeTeamId,
  awayTeamId,
  leagueId,
  homeTeamName,
  awayTeamName,
}: Props) {
  const [open, setOpen] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  const oddsQuery = useQuery<OddsData>({
    queryKey: ["live-odds", fixtureId, today],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/live-odds?fixture=${fixtureId}`);
      if (!res.ok) throw new Error("Failed to fetch odds");
      return res.json();
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const analysisQuery = useQuery<AnalysisData>({
    queryKey: ["fixture-analysis", homeTeamId, awayTeamId, leagueId, today],
    queryFn: async () => {
      const res = await fetch(
        `${BASE}/api/fixture-analysis?homeTeam=${homeTeamId}&awayTeam=${awayTeamId}&league=${leagueId}`
      );
      if (!res.ok) throw new Error("Failed to fetch analysis");
      return res.json();
    },
    enabled: open,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const isLoading = oddsQuery.isLoading || analysisQuery.isLoading;
  const analysis = analysisQuery.data;
  const oddsData = oddsQuery.data;
  const odds = oddsData?.odds;

  return (
    <div className="border-t border-white/[0.05]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-semibold text-zinc-500 hover:text-zinc-300 transition-colors group"
      >
        <span className="flex items-center gap-1.5">
          <TrendingUp className="w-3 h-3 text-primary/70 group-hover:text-primary transition-colors" />
          Odds & AI Analysis
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-6 gap-2 text-zinc-600 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading analysis...
            </div>
          ) : (oddsQuery.isError && analysisQuery.isError) ? (
            <div className="flex items-center gap-2 text-red-400/70 text-xs py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Could not load data for this fixture.
            </div>
          ) : (
            <>
              {odds && (
                <div className="space-y-2">
                  <span className="text-[9.5px] text-zinc-600 uppercase tracking-widest font-semibold">
                    Live Odds
                    {oddsData?.bookmakers?.length
                      ? ` · ${oddsData.bookmakers.slice(0, 2).join(", ")}`
                      : ""}
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    <OddPill label="1 Home" value={odds.home} highlight />
                    <OddPill label="X Draw" value={odds.draw} />
                    <OddPill label="2 Away" value={odds.away} highlight={false} />
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <OddPill label="O 2.5" value={odds.over25} />
                    <OddPill label="U 2.5" value={odds.under25} />
                    <OddPill label="BTTS" value={odds.bttsYes} />
                  </div>
                </div>
              )}

              {!oddsData?.available && !oddsQuery.isLoading && (
                <p className="text-[10px] text-zinc-700 italic">
                  Odds not yet available for this fixture.
                </p>
              )}

              {analysis && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9.5px] text-zinc-600 uppercase tracking-widest font-semibold">
                      AI Probability Analysis
                    </span>
                    <span className="text-[9.5px] text-zinc-700 font-medium">
                      xG {analysis.expectedGoals}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <ProbBar
                      label={`${homeTeamName} Win`}
                      value={analysis.probabilities.homeWin}
                      color="bg-primary"
                    />
                    <ProbBar
                      label="Draw"
                      value={analysis.probabilities.draw}
                      color="bg-zinc-500"
                    />
                    <ProbBar
                      label={`${awayTeamName} Win`}
                      value={analysis.probabilities.awayWin}
                      color="bg-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/[0.04]">
                    <div
                      className={cn(
                        "rounded-lg p-2.5 border text-center",
                        analysis.probabilities.over25 >= 0.5
                          ? "bg-amber-500/10 border-amber-500/20"
                          : "bg-white/[0.03] border-white/[0.06]"
                      )}
                    >
                      <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">
                        Over 2.5 Goals
                      </div>
                      <div
                        className={cn(
                          "text-base font-black tabular-nums",
                          analysis.probabilities.over25 >= 0.5
                            ? "text-amber-400"
                            : "text-zinc-300"
                        )}
                      >
                        {Math.round(analysis.probabilities.over25 * 100)}%
                      </div>
                    </div>
                    <div
                      className={cn(
                        "rounded-lg p-2.5 border text-center",
                        analysis.probabilities.btts >= 0.5
                          ? "bg-emerald-500/10 border-emerald-500/20"
                          : "bg-white/[0.03] border-white/[0.06]"
                      )}
                    >
                      <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">
                        Ambas Marcam
                      </div>
                      <div
                        className={cn(
                          "text-base font-black tabular-nums",
                          analysis.probabilities.btts >= 0.5
                            ? "text-emerald-400"
                            : "text-zinc-300"
                        )}
                      >
                        {Math.round(analysis.probabilities.btts * 100)}%
                      </div>
                    </div>
                    <div className="rounded-lg p-2.5 border bg-white/[0.03] border-white/[0.06] text-center">
                      <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">
                        Gol Jogador
                      </div>
                      <div className="text-base font-black tabular-nums text-zinc-300">
                        {Math.round(analysis.probabilities.playerGoal * 100)}%
                      </div>
                    </div>
                    <div className="rounded-lg p-2.5 border bg-white/[0.03] border-white/[0.06] text-center">
                      <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">
                        Escanteios +9
                      </div>
                      <div className="text-base font-black tabular-nums text-zinc-300">
                        {Math.round(analysis.probabilities.cornerOver9 * 100)}%
                      </div>
                    </div>
                  </div>

                  {(analysis.homeStats || analysis.awayStats) && (
                    <div className="pt-1 border-t border-white/[0.04] space-y-2">
                      <span className="text-[9.5px] text-zinc-600 uppercase tracking-widest font-semibold">
                        Season Form
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {analysis.homeStats && (
                          <div className="space-y-1">
                            <div className="text-[10px] text-zinc-500 font-medium truncate">
                              {homeTeamName}
                            </div>
                            <FormDots form={analysis.homeStats.form} />
                            <div className="text-[9px] text-zinc-700">
                              {analysis.homeStats.wins}W {analysis.homeStats.draws}D{" "}
                              {analysis.homeStats.losses}L · {analysis.homeStats.goalsFor} gf
                            </div>
                          </div>
                        )}
                        {analysis.awayStats && (
                          <div className="space-y-1">
                            <div className="text-[10px] text-zinc-500 font-medium truncate">
                              {awayTeamName}
                            </div>
                            <FormDots form={analysis.awayStats.form} />
                            <div className="text-[9px] text-zinc-700">
                              {analysis.awayStats.wins}W {analysis.awayStats.draws}D{" "}
                              {analysis.awayStats.losses}L · {analysis.awayStats.goalsFor} gf
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
