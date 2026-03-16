import { Link, useLocation } from "wouter";
import {
  Activity,
  LayoutDashboard,
  Users,
  TrendingUp,
  Cpu,
  Menu,
  X,
  Crown,
  LogIn,
  LogOut,
  UserPlus,
  Shield,
  Flame,
  BarChart2,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/matches", label: "Today's Matches", icon: Calendar },
  { href: "/analysis", label: "Daily Analysis", icon: BarChart2 },
  { href: "/ai", label: "AI Predictions", icon: Cpu },
  { href: "/top-players", label: "Top Players", icon: Users },
  { href: "/value-bets", label: "Value Bets", icon: Flame },
  { href: "/pricing", label: "Pricing", icon: Crown },
];

function AccessBadge() {
  const { accessLevel, subscription } = useAuth();

  if (accessLevel === "full") {
    return (
      <span className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold uppercase tracking-wider">
        <Crown className="w-2.5 h-2.5" />
        Premium
      </span>
    );
  }

  if (accessLevel === "trial" && subscription?.trialEndAt) {
    const days = Math.max(
      0,
      Math.ceil(
        (new Date(subscription.trialEndAt).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24)
      )
    );
    return (
      <span className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider">
        Trial · {days}d left
      </span>
    );
  }

  return null;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, logout, loading } = useAuth();

  async function handleLogout() {
    await logout();
    setIsMobileMenuOpen(false);
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 glass-panel border-b border-white/10 h-16 md:h-18 flex items-center">
        <div className="container mx-auto px-4 md:px-6 flex items-center justify-between gap-3">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group flex-shrink-0">
            <img
              src={`${BASE}/logo.png`}
              alt="PalpiteStats"
              className="w-8 h-8 md:w-9 md:h-9 object-contain rounded-lg flex-shrink-0"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
              }}
            />
            <span className="font-display text-lg md:text-xl font-bold tracking-tight text-white">
              Palpite<span className="text-primary">Stats</span>
            </span>
            <AccessBadge />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                location === item.href ||
                (item.href !== "/" && location.startsWith(item.href));
              const isValueBets = item.href === "/value-bets";

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-2.5 py-1.5 rounded-full font-medium text-xs transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap",
                    isActive
                      ? isValueBets
                        ? "bg-orange-500/15 text-orange-400"
                        : "bg-primary/10 text-primary"
                      : isValueBets
                      ? "text-orange-400/60 hover:bg-orange-500/10 hover:text-orange-400"
                      : "text-muted-foreground hover:bg-white/5 hover:text-white"
                  )}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Auth buttons desktop */}
          <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
            {!loading &&
              (user ? (
                <>
                  <span className="text-xs text-zinc-500 max-w-[120px] truncate">
                    {user.email}
                  </span>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/5 border border-white/[0.06] transition-all"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/5 border border-white/[0.06] transition-all"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    Login
                  </Link>
                  <Link
                    href="/register"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-primary hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Register
                  </Link>
                </>
              ))}
          </div>

          {/* Mobile: compact auth + burger */}
          <div className="lg:hidden flex items-center gap-2">
            {!loading && !user && (
              <Link
                href="/register"
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-primary hover:bg-primary/90 transition-all"
              >
                Free Trial
              </Link>
            )}
            <button
              className="p-2 text-muted-foreground hover:text-white transition-colors"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 top-16 z-40 bg-background/98 backdrop-blur-xl overflow-y-auto">
          <nav className="flex flex-col p-4 gap-1.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                location === item.href ||
                (item.href !== "/" && location.startsWith(item.href));
              const isValueBets = item.href === "/value-bets";

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "p-3.5 rounded-xl font-medium text-sm transition-all flex items-center gap-3",
                    isActive
                      ? isValueBets
                        ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                        : "bg-primary/10 text-primary border border-primary/20"
                      : isValueBets
                      ? "text-orange-400/70 bg-card hover:bg-orange-500/5"
                      : "text-muted-foreground bg-card hover:bg-white/5 hover:text-white"
                  )}
                >
                  <Icon className="w-4.5 h-4.5" />
                  {item.label}
                </Link>
              );
            })}

            <div className="border-t border-white/[0.06] mt-2 pt-2 space-y-1.5">
              <Link
                href="/privacy"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-3.5 rounded-xl font-medium text-sm text-muted-foreground bg-card hover:bg-white/5 hover:text-white flex items-center gap-3 transition-all"
              >
                <Shield className="w-4.5 h-4.5" />
                Privacy
              </Link>
              {user ? (
                <>
                  <div className="px-4 py-2 text-xs text-zinc-500 truncate">
                    {user.email}
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full p-3.5 rounded-xl font-medium text-sm text-red-400 bg-card hover:bg-red-500/5 flex items-center gap-3 transition-all"
                  >
                    <LogOut className="w-4.5 h-4.5" />
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-3.5 rounded-xl font-medium text-sm text-muted-foreground bg-card hover:bg-white/5 hover:text-white flex items-center gap-3 transition-all"
                  >
                    <LogIn className="w-4.5 h-4.5" />
                    Login
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-3.5 rounded-xl font-medium text-sm text-white bg-primary/10 border border-primary/20 hover:bg-primary/20 flex items-center gap-3 transition-all"
                  >
                    <UserPlus className="w-4.5 h-4.5 text-primary" />
                    Create Free Account
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 w-full relative">{children}</main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 md:py-10 mt-auto bg-card">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <img
                src={`${BASE}/logo.png`}
                alt="PalpiteStats"
                className="w-8 h-8 object-contain rounded-lg"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = "none";
                }}
              />
              <div>
                <span className="font-display font-bold text-white text-lg">
                  PalpiteStats
                </span>
                <p className="text-xs text-zinc-600 mt-0.5">
                  Premium Football Analytics · www.palpitestats.com.br
                </p>
              </div>
            </div>

            <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-zinc-500">
              <Link href="/" className="hover:text-zinc-300 transition-colors">
                Home
              </Link>
              <Link
                href="/matches"
                className="hover:text-zinc-300 transition-colors"
              >
                Today's Matches
              </Link>
              <Link
                href="/ai"
                className="hover:text-zinc-300 transition-colors"
              >
                AI Predictions
              </Link>
              <Link
                href="/value-bets"
                className="hover:text-orange-400 transition-colors text-orange-500/60"
              >
                Value Bets
              </Link>
              <Link
                href="/pricing"
                className="hover:text-zinc-300 transition-colors"
              >
                Pricing
              </Link>
              <Link
                href="/privacy"
                className="hover:text-zinc-300 transition-colors flex items-center gap-1"
              >
                <Shield className="w-3 h-3" />
                Privacy & LGPD
              </Link>
              {!user && (
                <Link
                  href="/register"
                  className="text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  Free Trial
                </Link>
              )}
            </nav>
          </div>

          <div className="mt-6 pt-5 border-t border-white/[0.05] space-y-3">
            <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl px-5 py-3.5 text-center">
              <p className="text-xs text-amber-400/80 font-medium leading-relaxed">
                ⚠️ <strong className="text-amber-400">Jogue com responsabilidade.</strong>{" "}
                Todas as previsões são baseadas em modelos estatísticos e probabilidades. Nenhum resultado é garantido.
                Se o jogo estiver prejudicando sua vida, ligue para{" "}
                <strong className="text-amber-300">CVV 188</strong> (gratuito, 24h).
              </p>
              <p className="text-[10px] text-amber-500/50 mt-1.5 font-medium">
                Bet responsibly · All predictions are based on statistical models and probabilities · No outcome is guaranteed.
              </p>
            </div>
            <p className="text-center text-xs text-zinc-700">
              &copy; {new Date().getFullYear()} PalpiteStats. All rights reserved. · Information for analytical purposes only.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
