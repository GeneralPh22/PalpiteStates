import { useState, useMemo } from "react";
import {
  Calculator,
  TrendingUp,
  DollarSign,
  RefreshCw,
  ChevronRight,
  Info,
  Percent,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface SimResult {
  stake: number;
  odds: number;
  grossReturn: number;
  profit: number;
  impliedProb: number;
}

function calcResult(stake: number, odds: number): SimResult | null {
  if (!stake || !odds || stake <= 0 || odds < 1.01) return null;
  const grossReturn = stake * odds;
  const profit = grossReturn - stake;
  const impliedProb = (1 / odds) * 100;
  return { stake, odds, grossReturn, profit, impliedProb };
}

const QUICK_STAKES = [10, 25, 50, 100, 200, 500];
const QUICK_ODDS   = [1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0, 10.0];

function NumberInput({
  label, value, onChange, prefix, min, max, step,
}: {
  label: string; value: string; onChange: (v: string) => void;
  prefix?: string; min?: number; max?: number; step?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{label}</label>
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3.5 text-sm font-bold text-zinc-500 pointer-events-none select-none">{prefix}</span>
        )}
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          min={min}
          max={max}
          step={step ?? 0.01}
          className={cn(
            "w-full bg-white/[0.04] border border-white/[0.09] rounded-xl py-3 text-white text-lg font-black placeholder-zinc-700",
            "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-colors",
            prefix ? "pl-9 pr-4" : "px-4"
          )}
          placeholder="0.00"
        />
      </div>
    </div>
  );
}

function ResultCard({ result }: { result: SimResult }) {
  const isHighOdds = result.odds >= 3.0;
  const profitColor = result.profit > 0 ? "text-primary" : "text-red-400";

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
      <div className="bg-gradient-to-r from-primary/10 via-transparent to-transparent border-b border-white/[0.07] px-5 py-4">
        <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Resultado</h3>
      </div>

      <div className="px-5 py-5 grid grid-cols-2 gap-4">
        {/* Retorno Bruto */}
        <div className="col-span-2 rounded-xl bg-primary/[0.07] border border-primary/20 p-4 text-center">
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Retorno Total</div>
          <div className="text-4xl font-black text-white tabular-nums">
            R$ {result.grossReturn.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        {/* Stake */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3.5 text-center">
          <div className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider mb-1">Aposta</div>
          <div className="text-xl font-black text-zinc-300 tabular-nums">
            R$ {result.stake.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        {/* Lucro */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3.5 text-center">
          <div className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider mb-1">Lucro</div>
          <div className={cn("text-xl font-black tabular-nums", profitColor)}>
            + R$ {result.profit.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        {/* Odds */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3.5 text-center">
          <div className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider mb-1">Odd</div>
          <div className={cn("text-xl font-black tabular-nums", isHighOdds ? "text-amber-400" : "text-zinc-300")}>
            {result.odds.toFixed(2)}
          </div>
        </div>

        {/* Prob implícita */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3.5 text-center">
          <div className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider mb-1">Prob. Implícita</div>
          <div className="text-xl font-black text-blue-400 tabular-nums">
            {result.impliedProb.toFixed(1)}%
          </div>
        </div>

        {/* ROI info bar */}
        <div className="col-span-2 rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3 flex items-center gap-3">
          <Info className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
          <p className="text-[11px] text-zinc-600 leading-relaxed">
            Para esta aposta ser lucrativa a longo prazo, a probabilidade real precisa ser superior a{" "}
            <span className="text-zinc-400 font-semibold">{result.impliedProb.toFixed(1)}%</span>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function BetSimulator() {
  const [stakeInput, setStakeInput] = useState("100");
  const [oddsInput, setOddsInput]   = useState("2.00");

  const stake = parseFloat(stakeInput) || 0;
  const odds  = parseFloat(oddsInput)  || 0;

  const result = useMemo(() => calcResult(stake, odds), [stake, odds]);

  const reset = () => { setStakeInput("100"); setOddsInput("2.00"); };

  return (
    <div className="container mx-auto px-4 md:px-6 py-8 max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
            <Calculator className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-black text-white">Simulador de Apostas</h1>
        </div>
        <p className="text-sm text-zinc-500 ml-11">Calcule retorno e lucro antes de apostar</p>
      </div>

      <div className="space-y-6">
        {/* Inputs */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <NumberInput
              label="Valor da Aposta (R$)"
              value={stakeInput}
              onChange={setStakeInput}
              prefix="R$"
              min={0.01}
              step={1}
            />
            <NumberInput
              label="Odds (Decimal)"
              value={oddsInput}
              onChange={setOddsInput}
              min={1.01}
              step={0.05}
            />
          </div>

          {/* Quick stake buttons */}
          <div>
            <div className="text-[9px] font-bold text-zinc-700 uppercase tracking-wider mb-2">Valor rápido</div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_STAKES.map(s => (
                <button
                  key={s}
                  onClick={() => setStakeInput(String(s))}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors",
                    stake === s
                      ? "bg-primary/15 border-primary/30 text-primary"
                      : "bg-white/[0.03] border-white/[0.07] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.14]"
                  )}
                >
                  R${s}
                </button>
              ))}
            </div>
          </div>

          {/* Quick odds buttons */}
          <div>
            <div className="text-[9px] font-bold text-zinc-700 uppercase tracking-wider mb-2">Odd rápida</div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ODDS.map(o => (
                <button
                  key={o}
                  onClick={() => setOddsInput(String(o.toFixed(2)))}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors",
                    odds === o
                      ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                      : "bg-white/[0.03] border-white/[0.07] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.14]"
                  )}
                >
                  {o.toFixed(2)}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Resetar
          </button>
        </div>

        {/* Result */}
        {result ? (
          <ResultCard result={result} />
        ) : (
          <div className="rounded-2xl border border-dashed border-white/[0.06] p-10 text-center">
            <Calculator className="w-10 h-10 text-zinc-800 mx-auto mb-3" />
            <p className="text-sm text-zinc-700">Preencha o valor e a odd para calcular</p>
          </div>
        )}

        {/* Multiple bets calculator */}
        {result && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              Escala de Apostas
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[9px] text-zinc-700 uppercase tracking-wider">
                    <th className="text-left pb-2 font-semibold">Aposta</th>
                    <th className="text-right pb-2 font-semibold">Retorno</th>
                    <th className="text-right pb-2 font-semibold">Lucro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {[0.5, 1, 2, 3, 5].map(mult => {
                    const s = result.stake * mult;
                    const r = s * result.odds;
                    return (
                      <tr key={mult} className={cn("text-zinc-400", mult === 1 && "text-white font-bold")}>
                        <td className="py-1.5 tabular-nums">R$ {s.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                        <td className="py-1.5 text-right tabular-nums text-primary">R$ {r.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                        <td className="py-1.5 text-right tabular-nums text-green-400">+ R$ {(r - s).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CTA Affiliate */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <p className="text-[11px] text-zinc-600 text-center">Pronto para apostar? Escolha sua casa</p>
          <div className="grid grid-cols-2 gap-2">
            <a
              href="https://referme.to/pedroa-6161"
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#e63946]/15 border border-[#e63946]/25 hover:bg-[#e63946]/25 transition-colors"
            >
              <span className="text-xs font-bold text-[#e63946]">Ver Odds — Betano</span>
              <ChevronRight className="w-3 h-3 text-[#e63946]" />
            </a>
            <a
              href="https://promos.betfair.bet.br/choose-your-refer-and-earn-offer?referrerCode=PAXVX77DL"
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#f9a825]/10 border border-[#f9a825]/20 hover:bg-[#f9a825]/20 transition-colors"
            >
              <span className="text-xs font-bold text-[#f9a825]">Ver Odds — Betfair</span>
              <ChevronRight className="w-3 h-3 text-[#f9a825]" />
            </a>
          </div>
          <p className="text-[9px] text-zinc-700 text-center">+18 · Aposte com responsabilidade · T&C aplicam-se</p>
        </div>
      </div>
    </div>
  );
}
