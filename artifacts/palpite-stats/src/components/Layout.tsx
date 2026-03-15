import { Link, useLocation } from "wouter";
import { Activity, LayoutDashboard, Users, TrendingUp, Cpu, Menu, X, Crown, LogIn, LogOut, UserPlus, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const NAV_ITEMS = [
  { href: "/", label: "Início", icon: LayoutDashboard },
  { href: "/matches", label: "Jogos", icon: Activity },
  { href: "/players", label: "Jogadores", icon: Users },
  { href: "/odds", label: "Odds", icon: TrendingUp },
  { href: "/ai", label: "IA", icon: Cpu },
  { href: "/pricing", label: "Planos", icon: Crown },
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
    const days = Math.max(0, Math.ceil((new Date(subscription.trialEndAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    return (
      <span className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider">
        Trial · {days}d
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
      <header className="sticky top-0 z-50 glass-panel border-b border-white/10 h-16 md:h-20 flex items-center">
        <div className="container mx-auto px-4 md:px-6 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group flex-shrink-0">
            <img
              src={`${BASE}/logo.png`}
              alt="PalpiteStats"
              className="w-8 h-8 md:w-10 md:h-10 object-contain rounded-lg flex-shrink-0"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
              }}
            />
            <span className="font-display text-xl md:text-2xl font-bold tracking-tight text-white">
              Palpite<span className="text-primary">Stats</span>
            </span>
            <AccessBadge />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-0.5 lg:gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-3 py-2 rounded-full font-medium text-sm transition-all duration-200 flex items-center gap-1.5",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-white/5 hover:text-white"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Auth buttons desktop */}
          <div className="hidden md:flex items-center gap-2 flex-shrink-0">
            {!loading && (
              user ? (
                <>
                  <span className="text-xs text-zinc-500 max-w-[140px] truncate">{user.email}</span>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/5 border border-white/[0.06] transition-all"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sair
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/5 border border-white/[0.06] transition-all">
                    <LogIn className="w-3.5 h-3.5" />
                    Entrar
                  </Link>
                  <Link href="/register" className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-white bg-primary hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">
                    <UserPlus className="w-3.5 h-3.5" />
                    Cadastrar
                  </Link>
                </>
              )
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden p-2 text-muted-foreground hover:text-white transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-16 z-40 bg-background/97 backdrop-blur-xl border-b border-white/5 overflow-y-auto">
          <nav className="flex flex-col p-4 gap-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "p-4 rounded-xl font-medium text-base transition-all flex items-center gap-3",
                    isActive
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground bg-card hover:bg-white/5 hover:text-white"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}

            <div className="border-t border-white/[0.06] mt-2 pt-2">
              {user ? (
                <>
                  <div className="px-4 py-2 text-xs text-zinc-500 truncate">{user.email}</div>
                  <button
                    onClick={handleLogout}
                    className="w-full p-4 rounded-xl font-medium text-base text-red-400 bg-card hover:bg-red-500/5 flex items-center gap-3 transition-all"
                  >
                    <LogOut className="w-5 h-5" />
                    Sair
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-4 rounded-xl font-medium text-base text-muted-foreground bg-card hover:bg-white/5 hover:text-white flex items-center gap-3 transition-all"
                  >
                    <LogIn className="w-5 h-5" />
                    Entrar
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-4 rounded-xl font-medium text-base text-white bg-primary/10 border border-primary/20 hover:bg-primary/20 flex items-center gap-3 transition-all mt-1"
                  >
                    <UserPlus className="w-5 h-5 text-primary" />
                    Criar conta grátis
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 w-full relative">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 md:py-12 mt-auto bg-card">
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
                <span className="font-display font-bold text-white text-lg">PalpiteStats</span>
                <p className="text-xs text-zinc-600 mt-0.5">Premium Football Analytics</p>
              </div>
            </div>

            <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-500">
              <Link href="/pricing" className="hover:text-zinc-300 transition-colors">Planos</Link>
              <Link href="/privacy" className="hover:text-zinc-300 transition-colors flex items-center gap-1">
                <Shield className="w-3 h-3" />
                Privacidade & LGPD
              </Link>
              {!user && (
                <Link href="/register" className="text-primary hover:text-primary/80 font-medium transition-colors">
                  Cadastrar grátis
                </Link>
              )}
            </nav>
          </div>

          <div className="mt-6 pt-6 border-t border-white/[0.05] text-center text-xs text-zinc-700">
            <p>&copy; {new Date().getFullYear()} PalpiteStats. Todos os direitos reservados.</p>
            <p className="mt-1">Informações para fins analíticos. Aposte com responsabilidade.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
