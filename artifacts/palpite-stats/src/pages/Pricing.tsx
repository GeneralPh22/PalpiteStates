import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle, Loader2, Star, Zap, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const PLANS = [
  {
    id: "monthly",
    label: "Mensal",
    price: "R$20",
    period: "/mês",
    icon: Zap,
    popular: false,
    savings: null,
    features: ["Acesso completo a todos os jogos", "Odds em tempo real", "IA de probabilidades", "Estatísticas per 90 min"],
  },
  {
    id: "quarterly",
    label: "Trimestral",
    price: "R$50",
    period: "/3 meses",
    icon: Star,
    popular: true,
    savings: "Economia de R$10",
    features: ["Tudo do plano mensal", "Histórico estendido de jogadores", "Alertas de odds", "Suporte prioritário"],
  },
  {
    id: "semiannual",
    label: "Semestral",
    price: "R$95",
    period: "/6 meses",
    icon: Star,
    popular: false,
    savings: "Economia de R$25",
    features: ["Tudo do trimestral", "Exportação de dados", "Modelos preditivos avançados"],
  },
  {
    id: "annual",
    label: "Anual",
    price: "R$180",
    period: "/ano",
    icon: Crown,
    popular: false,
    savings: "Economia de R$60",
    features: ["Tudo incluído", "Acesso vitalício a novos recursos", "Badge de membro premium"],
  },
];

export default function Pricing() {
  const { user, accessLevel, subscription } = useAuth();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleCheckout(planId: string) {
    setError("");
    setLoadingPlan(planId);
    try {
      const token = localStorage.getItem("ps_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${BASE}/api/auth/stripe/checkout`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar checkout");
      if (data.url) window.location.href = data.url;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingPlan(null);
    }
  }

  const trialEnd = subscription?.trialEndAt ? new Date(subscription.trialEndAt) : null;
  const trialDaysLeft = trialEnd
    ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="pb-24 pt-8">
      <div className="container mx-auto px-4 md:px-6 max-w-5xl">
        <div className="text-center mb-12">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-semibold border border-primary/30 mb-4">
              <Crown className="w-3.5 h-3.5" />
              Planos Premium
            </span>
            <h1 className="text-3xl md:text-5xl font-display font-extrabold text-white mb-4">
              Escolha seu plano
            </h1>
            <p className="text-zinc-500 max-w-xl mx-auto">
              Acesso completo a análises de IA, odds em tempo real, estatísticas per 90 min e muito mais.
            </p>
          </motion.div>
        </div>

        {accessLevel === "trial" && trialDaysLeft > 0 && (
          <div className="bg-primary/5 border border-primary/15 rounded-2xl px-6 py-4 mb-8 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-sm text-white font-medium">
                Teste gratuito: <span className="text-primary">{trialDaysLeft} dias restantes</span>
              </span>
            </div>
            <span className="text-xs text-zinc-500">Após o período, você terá acesso limitado</span>
          </div>
        )}

        {accessLevel === "limited" && !user && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl px-6 py-4 mb-8 text-center">
            <p className="text-amber-400 text-sm font-medium mb-2">Crie uma conta gratuita e ganhe 5 dias de acesso completo</p>
            <Link href="/register" className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-all">
              Começar grátis
            </Link>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3 mb-6 text-center">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((plan, idx) => {
            const Icon = plan.icon;
            const isActive = subscription?.plan === plan.id && subscription?.status === "active" && accessLevel === "full";

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.08 }}
                className={cn(
                  "relative flex flex-col rounded-2xl border p-6 transition-all",
                  plan.popular
                    ? "border-primary/40 bg-gradient-to-b from-primary/10 to-[#09090b] shadow-xl shadow-primary/10"
                    : "border-white/[0.08] bg-[#09090b]",
                  isActive && "ring-2 ring-emerald-500/40"
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                      Mais popular
                    </span>
                  </div>
                )}

                {isActive && (
                  <div className="absolute -top-3 right-4">
                    <span className="bg-emerald-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                      Ativo
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 mb-4">
                  <Icon className={cn("w-4 h-4", plan.popular ? "text-primary" : "text-zinc-500")} />
                  <span className="text-sm font-semibold text-zinc-300">{plan.label}</span>
                </div>

                <div className="mb-1">
                  <span className="text-3xl font-display font-extrabold text-white">{plan.price}</span>
                  <span className="text-zinc-500 text-xs ml-1">{plan.period}</span>
                </div>

                {plan.savings && (
                  <span className="text-[10px] text-emerald-400 font-semibold mb-4">{plan.savings}</span>
                )}

                <ul className="space-y-2.5 mb-6 mt-4 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-zinc-400">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                {user ? (
                  isActive ? (
                    <div className="py-2.5 rounded-xl text-center text-sm font-semibold text-emerald-400 border border-emerald-500/20 bg-emerald-500/5">
                      Plano atual
                    </div>
                  ) : (
                    <button
                      onClick={() => handleCheckout(plan.id)}
                      disabled={!!loadingPlan}
                      className={cn(
                        "py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2",
                        plan.popular
                          ? "bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                          : "bg-white/[0.07] hover:bg-white/[0.12] text-white border border-white/[0.09]",
                        loadingPlan && "opacity-60 cursor-not-allowed"
                      )}
                    >
                      {loadingPlan === plan.id ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Aguarde...</>
                      ) : (
                        "Assinar agora"
                      )}
                    </button>
                  )
                ) : (
                  <Link
                    href="/register"
                    className={cn(
                      "py-2.5 rounded-xl text-sm font-semibold transition-all text-center block",
                      plan.popular
                        ? "bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                        : "bg-white/[0.07] hover:bg-white/[0.12] text-white border border-white/[0.09]"
                    )}
                  >
                    Começar grátis
                  </Link>
                )}
              </motion.div>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <p className="text-zinc-600 text-xs">
            Pagamento seguro via Stripe · Garantia de reembolso em 7 dias · LGPD compliant
          </p>
          <p className="text-zinc-700 text-xs mt-1">
            Os preços são exibidos em Reais (BRL). Ao assinar, você concorda com nossos{" "}
            <Link href="/privacy" className="text-zinc-500 hover:text-zinc-300 underline">
              Termos e Política de Privacidade
            </Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
