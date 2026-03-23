import { useState, useCallback } from "react";
import {
  Brain,
  CheckCircle2,
  XCircle,
  TrendingUp,
  BarChart2,
  Trash2,
  Plus,
  ChevronRight,
  Clock,
  Trophy,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Prediction {
  id: string;
  match: string;
  market: string;
  probability: number;
  odds: number | null;
  date: string;
  outcome: "green" | "red" | "pending";
  createdAt: string;
}

const STORAGE_KEY = "ps_ai_predictions";

function loadPredictions(): Prediction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePredictions(preds: Prediction[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preds));
  } catch {}
}

function usePredictions() {
  const [predictions, setPredictions] = useState<Prediction[]>(loadPredictions);

  const addPrediction = useCallback((pred: Omit<Prediction, "id" | "createdAt" | "outcome">) => {
    const newPred: Prediction = {
      ...pred,
      id: Date.now().toString(),
      outcome: "pending",
      createdAt: new Date().toISOString(),
    };
    setPredictions(prev => {
      const next = [newPred, ...prev];
      savePredictions(next);
      return next;
    });
  }, []);

  const setOutcome = useCallback((id: string, outcome: "green" | "red") => {
    setPredictions(prev => {
      const next = prev.map(p => p.id === id ? { ...p, outcome } : p);
      savePredictions(next);
      return next;
    });
  }, []);

  const deletePrediction = useCallback((id: string) => {
    setPredictions(prev => {
      const next = prev.filter(p => p.id !== id);
      savePredictions(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setPredictions([]);
    savePredictions([]);
  }, []);

  return { predictions, addPrediction, setOutcome, deletePrediction, clearAll };
}

interface Stats {
  total: number;
  greens: number;
  reds: number;
  pending: number;
  winRate: number;
  avgProb: number;
  avgOdds: number;
}

function calcStats(preds: Prediction[]): Stats {
  const settled = preds.filter(p => p.outcome !== "pending");
  const greens = preds.filter(p => p.outcome === "green").length;
  const reds = preds.filter(p => p.outcome === "red").length;
  const withProb = preds.filter(p => p.probability > 0);
  const withOdds = preds.filter(p => p.odds && p.odds > 0);
  return {
    total: preds.length,
    greens,
    reds,
    pending: preds.filter(p => p.outcome === "pending").length,
    winRate: settled.length > 0 ? (greens / settled.length) * 100 : 0,
    avgProb: withProb.length > 0 ? withProb.reduce((s, p) => s + p.probability, 0) / withProb.length : 0,
    avgOdds: withOdds.length > 0 ? withOdds.reduce((s, p) => s + (p.odds ?? 0), 0) / withOdds.length : 0,
  };
}

function AddPredictionForm({ onAdd }: { onAdd: (p: Omit<Prediction, "id" | "createdAt" | "outcome">) => void }) {
  const [match, setMatch]   = useState("");
  const [market, setMarket] = useState("Over 2.5 Goals");
  const [prob, setProb]     = useState("60");
  const [odds, setOdds]     = useState("");
  const [date, setDate]     = useState(new Date().toISOString().slice(0, 10));
  const [open, setOpen]     = useState(false);

  const handleSubmit = () => {
    if (!match.trim()) return;
    onAdd({
      match: match.trim(),
      market,
      probability: parseFloat(prob) || 0,
      odds: odds ? parseFloat(odds) : null,
      date,
    });
    setMatch(""); setMarket("Over 2.5 Goals"); setProb("60"); setOdds(""); setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-white/[0.10] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.16] transition-colors text-zinc-500 hover:text-zinc-300 text-sm font-semibold"
      >
        <Plus className="w-4 h-4" />
        Adicionar Previsão
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-4">
      <h3 className="text-sm font-bold text-white">Nova Previsão</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">Jogo</label>
          <input
            value={match}
            onChange={e => setMatch(e.target.value)}
            placeholder="Ex: Portugal vs Dinamarca"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-700 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">Mercado</label>
          <select
            value={market}
            onChange={e => setMarket(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors appearance-none"
          >
            <option value="Over 2.5 Goals">Over 2.5 Goals</option>
            <option value="BTTS Yes">BTTS Yes</option>
            <option value="Home Win">Home Win</option>
            <option value="Away Win">Away Win</option>
            <option value="Draw">Draw</option>
            <option value="Over 1.5 Goals">Over 1.5 Goals</option>
            <option value="Over 3.5 Goals">Over 3.5 Goals</option>
            <option value="Corners Over 8.5">Corners Over 8.5</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">Probabilidade AI (%)</label>
          <input
            type="number" min="1" max="99" value={prob}
            onChange={e => setProb(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">Odd Bookmaker (opcional)</label>
          <input
            type="number" min="1.01" step="0.05" value={odds}
            onChange={e => setOdds(e.target.value)}
            placeholder="Ex: 1.90"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-700 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">Data</label>
          <input
            type="date" value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button onClick={() => setOpen(false)} className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-300 transition-colors">
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={!match.trim()}
          className="px-5 py-2 text-xs font-bold bg-primary text-black rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Salvar Previsão
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white/[0.025] border border-white/[0.07] rounded-xl p-4 text-center">
      <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-1.5">{label}</div>
      <div className={cn("text-2xl font-black tabular-nums", color ?? "text-white")}>{value}</div>
      {sub && <div className="text-[10px] text-zinc-700 mt-1">{sub}</div>}
    </div>
  );
}

function PredRow({ pred, onGreen, onRed, onDelete }: {
  pred: Prediction;
  onGreen: () => void;
  onRed: () => void;
  onDelete: () => void;
}) {
  const isValue = pred.odds && pred.odds > (100 / pred.probability);
  return (
    <div className={cn(
      "rounded-xl border px-4 py-3 transition-colors",
      pred.outcome === "green" ? "border-primary/20 bg-primary/[0.04]" :
      pred.outcome === "red" ? "border-red-500/15 bg-red-500/[0.03]" :
      "border-white/[0.07] bg-white/[0.02]"
    )}>
      <div className="flex items-start gap-3">
        {/* Outcome icon */}
        <div className="flex-shrink-0 mt-0.5">
          {pred.outcome === "green" ? <CheckCircle2 className="w-4 h-4 text-primary" /> :
           pred.outcome === "red"   ? <XCircle className="w-4 h-4 text-red-400" /> :
           <Clock className="w-4 h-4 text-zinc-600" />}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-1.5 mb-0.5">
            <span className="text-sm font-bold text-white truncate">{pred.match}</span>
            {isValue && (
              <span className="text-[9px] font-black text-amber-300 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-full">
                ⚡ VALUE
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap text-[10px] text-zinc-600">
            <span>{pred.market}</span>
            <span>·</span>
            <span className="text-primary font-semibold">{pred.probability}% prob</span>
            {pred.odds && <span>· Odd {pred.odds.toFixed(2)}</span>}
            <span>· {pred.date}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {pred.outcome === "pending" && (
            <>
              <button onClick={onGreen} title="Green (acertei)" className="p-1.5 rounded-lg hover:bg-primary/10 text-zinc-600 hover:text-primary transition-colors">
                <CheckCircle2 className="w-4 h-4" />
              </button>
              <button onClick={onRed} title="Red (errei)" className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-600 hover:text-red-400 transition-colors">
                <XCircle className="w-4 h-4" />
              </button>
            </>
          )}
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-700 hover:text-red-400 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AiPerformance() {
  const { predictions, addPrediction, setOutcome, deletePrediction, clearAll } = usePredictions();
  const stats = calcStats(predictions);
  const [filter, setFilter] = useState<"all" | "pending" | "green" | "red">("all");

  const filtered = filter === "all" ? predictions : predictions.filter(p => p.outcome === filter);

  const winRateColor =
    stats.winRate >= 60 ? "text-primary" :
    stats.winRate >= 50 ? "text-amber-400" :
    "text-red-400";

  return (
    <div className="container mx-auto px-4 md:px-6 py-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-black text-white">Performance AI</h1>
        </div>
        <p className="text-sm text-zinc-500 ml-11">
          Acompanhe o histórico e taxa de acerto das previsões AI
        </p>
      </div>

      {/* Stats grid */}
      {predictions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total" value={String(stats.total)} />
          <StatCard label="Greens" value={String(stats.greens)} color="text-primary" />
          <StatCard label="Reds" value={String(stats.reds)} color="text-red-400" />
          <StatCard label="Taxa de Acerto" value={stats.total > 0 ? `${stats.winRate.toFixed(0)}%` : "—"} color={winRateColor} sub={stats.pending > 0 ? `${stats.pending} pendente${stats.pending > 1 ? "s" : ""}` : undefined} />
        </div>
      )}

      {/* Win rate progress bar */}
      {stats.greens + stats.reds > 0 && (
        <div className="mb-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-bold text-white">
                Últimas {stats.greens + stats.reds} previsões encerradas
              </span>
            </div>
            <span className={cn("text-lg font-black tabular-nums", winRateColor)}>
              {stats.winRate.toFixed(0)}%
            </span>
          </div>

          <div className="h-4 bg-white/[0.06] rounded-full overflow-hidden flex">
            <div
              className="h-full bg-primary transition-all duration-700"
              style={{ width: `${stats.winRate}%` }}
            />
            <div
              className="h-full bg-red-500/70"
              style={{ width: `${100 - stats.winRate}%` }}
            />
          </div>

          <div className="flex items-center justify-between mt-2 text-[10px]">
            <span className="text-primary font-semibold">{stats.greens} Green{stats.greens !== 1 ? "s" : ""}</span>
            <span className="text-red-400 font-semibold">{stats.reds} Red{stats.reds !== 1 ? "s" : ""}</span>
          </div>

          {stats.avgOdds > 0 && (
            <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center gap-4 text-[11px] text-zinc-600">
              <span>Prob média: <strong className="text-zinc-400">{stats.avgProb.toFixed(0)}%</strong></span>
              <span>Odd média: <strong className="text-zinc-400">{stats.avgOdds.toFixed(2)}</strong></span>
            </div>
          )}
        </div>
      )}

      {/* Filter tabs */}
      {predictions.length > 0 && (
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          {(["all", "pending", "green", "red"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                filter === f
                  ? f === "green" ? "bg-primary/15 border-primary/30 text-primary"
                    : f === "red" ? "bg-red-500/15 border-red-500/25 text-red-400"
                    : f === "pending" ? "bg-amber-500/15 border-amber-500/25 text-amber-400"
                    : "bg-white/[0.07] border-white/[0.12] text-white"
                  : "bg-white/[0.02] border-white/[0.06] text-zinc-600 hover:text-zinc-400"
              )}
            >
              {f === "all" ? `Todas (${stats.total})` :
               f === "pending" ? `Pendentes (${stats.pending})` :
               f === "green" ? `Greens (${stats.greens})` :
               `Reds (${stats.reds})`}
            </button>
          ))}
          {predictions.length > 0 && (
            <button
              onClick={clearAll}
              className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-zinc-700 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Limpar
            </button>
          )}
        </div>
      )}

      {/* Predictions list */}
      <div className="space-y-2 mb-4">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Brain className="w-12 h-12 text-zinc-800 mx-auto mb-4" />
            {predictions.length === 0 ? (
              <>
                <p className="text-zinc-500 font-medium mb-1">Nenhuma previsão registrada</p>
                <p className="text-zinc-700 text-xs max-w-xs mx-auto leading-relaxed">
                  Adicione suas previsões das análises AI e acompanhe sua taxa de acerto ao longo do tempo.
                </p>
              </>
            ) : (
              <p className="text-zinc-600 text-sm">Nenhuma previsão {filter === "green" ? "acertada" : filter === "red" ? "errada" : "pendente"}</p>
            )}
          </div>
        ) : (
          filtered.map(pred => (
            <PredRow
              key={pred.id}
              pred={pred}
              onGreen={() => setOutcome(pred.id, "green")}
              onRed={() => setOutcome(pred.id, "red")}
              onDelete={() => deletePrediction(pred.id)}
            />
          ))
        )}
      </div>

      <AddPredictionForm onAdd={addPrediction} />

      {/* Info footer */}
      <div className="mt-6 rounded-xl border border-white/[0.05] bg-white/[0.01] p-4 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-zinc-700 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-zinc-600 leading-relaxed">
          As previsões são salvas localmente no seu dispositivo. Marque cada resultado como Green (acertei) ou Red (errei) para calcular sua taxa de acerto. As previsões AI são baseadas em modelos estatísticos — nenhum resultado é garantido.
        </p>
      </div>
    </div>
  );
}
