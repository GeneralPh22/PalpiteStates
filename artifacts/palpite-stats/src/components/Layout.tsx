import { Link, useLocation } from "wouter";
import { Activity, LayoutDashboard, Users, TrendingUp, Cpu, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/matches", label: "Matches", icon: Activity },
  { href: "/players", label: "Players", icon: Users },
  { href: "/odds", label: "Odds", icon: TrendingUp },
  { href: "/ai", label: "AI Predictions", icon: Cpu },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 glass-panel border-b border-white/10 h-16 md:h-20 flex items-center">
        <div className="container mx-auto px-4 md:px-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-emerald-700 flex items-center justify-center shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-all duration-300">
              <Activity className="text-white w-5 h-5" />
            </div>
            <span className="font-display text-xl md:text-2xl font-bold tracking-tight text-white">
              Palpite<span className="text-primary">Stats</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-4 py-2 rounded-full font-medium text-sm transition-all duration-200 flex items-center gap-2",
                    isActive 
                      ? "bg-primary/10 text-primary" 
                      : "text-muted-foreground hover:bg-white/5 hover:text-white"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

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
        <div className="md:hidden fixed inset-0 top-16 z-40 bg-background/95 backdrop-blur-xl border-b border-white/5">
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
          </nav>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 w-full relative">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 md:py-12 mt-auto bg-card">
        <div className="container mx-auto px-4 md:px-6 text-center text-muted-foreground">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Activity className="text-primary w-5 h-5" />
            <span className="font-display font-bold text-white text-lg">PalpiteStats</span>
          </div>
          <p className="text-sm">Premium Football Analytics & Betting Predictions.</p>
          <p className="text-xs mt-4 opacity-50">&copy; {new Date().getFullYear()} PalpiteStats. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
