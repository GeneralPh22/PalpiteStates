import { useEffect } from "react";
import { Link, useSearch } from "wouter";
import { CheckCircle, Crown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function SubscriptionSuccess() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const plan = params.get("plan") || "premium";
  const { refresh } = useAuth();

  useEffect(() => {
    refresh();
  }, [refresh]);

  const labelMap: Record<string, string> = {
    monthly: "Mensal",
    quarterly: "Trimestral",
    semiannual: "Semestral",
    annual: "Anual",
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="bg-[#09090b] border border-emerald-500/20 rounded-2xl p-10 shadow-2xl text-center max-w-md w-full">
        <div className="flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-emerald-400" />
        </div>
        <div className="flex items-center justify-center gap-2 mb-2">
          <Crown className="w-5 h-5 text-amber-400" />
          <span className="text-amber-400 text-sm font-semibold uppercase tracking-wider">Membro Premium</span>
        </div>
        <h2 className="text-2xl font-display font-bold text-white mb-3">
          Assinatura ativada!
        </h2>
        <p className="text-zinc-400 text-sm mb-6">
          Seu plano <strong className="text-white">{labelMap[plan] || plan}</strong> está ativo.
          Aproveite acesso completo a todas as funcionalidades do PalpiteStats.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold transition-all shadow-lg shadow-primary/20"
        >
          Ver jogos de hoje
        </Link>
      </div>
    </div>
  );
}
