import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Star, ChevronDown, ChevronRight, Trophy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { COUNTRY_LEAGUES } from "@/lib/leagues";
import { useFavoriteLeagues } from "@/hooks/useFavoriteLeagues";

interface LeagueNavProps {
  onClose?: () => void;
}

export function LeagueNav({ onClose }: LeagueNavProps) {
  const [location] = useLocation();
  const { isFavorite, toggle, favorites } = useFavoriteLeagues();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCountry = (code: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleLeagueClick = () => {
    onClose?.();
  };

  return (
    <nav className="h-full flex flex-col bg-[#0a0a0c] border-r border-white/[0.06]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold text-white">Ligas</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 text-zinc-600 hover:text-white transition-colors rounded-lg hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-2 scrollbar-hide">
        {/* Favorites section */}
        {favorites.length > 0 && (
          <div className="mb-1">
            <div className="px-3 py-1.5">
              <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Favoritas</span>
            </div>
            {COUNTRY_LEAGUES.flatMap(c =>
              c.leagues.filter(l => favorites.includes(l.id)).map(l => (
                <Link
                  key={`fav-${l.id}`}
                  href={`/?league=${l.id}`}
                  onClick={handleLeagueClick}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.05] group transition-colors"
                >
                  <Star className="w-3 h-3 text-amber-400 flex-shrink-0" />
                  <span className="text-xs text-zinc-300 font-medium truncate">{l.name}</span>
                  <span className="text-[9px] text-zinc-700 ml-auto truncate">
                    {COUNTRY_LEAGUES.find(c2 => c2.leagues.some(l2 => l2.id === l.id))?.flag}
                  </span>
                </Link>
              ))
            )}
            <div className="h-px bg-white/[0.05] mx-3 my-1" />
          </div>
        )}

        {/* Country/League list */}
        {COUNTRY_LEAGUES.map(({ country, flag, code, leagues }) => {
          const isCollapsed = collapsed.has(code);
          return (
            <div key={code} className="mb-0.5">
              {/* Country header */}
              <button
                onClick={() => toggleCountry(code)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.04] transition-colors text-left group"
              >
                <span className="text-sm flex-shrink-0">{flag}</span>
                <span className="text-xs font-bold text-zinc-400 group-hover:text-white transition-colors flex-1 truncate">
                  {country}
                </span>
                {isCollapsed ? (
                  <ChevronRight className="w-3 h-3 text-zinc-700 flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-zinc-700 flex-shrink-0" />
                )}
              </button>

              {/* Leagues under country */}
              {!isCollapsed && (
                <div className="ml-6 border-l border-white/[0.05]">
                  {leagues.map(league => {
                    const fav = isFavorite(league.id);
                    return (
                      <div
                        key={league.id}
                        className="flex items-center gap-1 pr-2 group hover:bg-white/[0.04] transition-colors"
                      >
                        <Link
                          href={`/?league=${league.id}`}
                          onClick={handleLeagueClick}
                          className="flex-1 px-3 py-1.5 text-xs text-zinc-500 hover:text-white transition-colors truncate"
                        >
                          {league.name}
                        </Link>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggle(league.id);
                          }}
                          className={cn(
                            "p-1 rounded transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0",
                            fav ? "opacity-100 text-amber-400" : "text-zinc-700 hover:text-amber-400"
                          )}
                          title={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                        >
                          <Star className={cn("w-3 h-3", fav && "fill-amber-400")} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-white/[0.06]">
        <p className="text-[9px] text-zinc-700 leading-relaxed">
          Clique ⭐ para fixar ligas favoritas
        </p>
      </div>
    </nav>
  );
}
