import { useGetPlayers } from "@workspace/api-client-react";
import { useState } from "react";
import { Link } from "wouter";
import { Search, MapPin, Target } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

// Simple debounce hook implementation directly in the file for expediency
export function useDebounceHook<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  
  useState(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  });
  
  return debouncedValue;
}

export default function Players() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounceHook(search, 500);

  const { data, isLoading } = useGetPlayers({ 
    search: debouncedSearch,
    limit: 24,
    page: 1
  });

  return (
    <div className="container mx-auto px-4 py-8 md:py-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl md:text-4xl font-display font-bold mb-2">Player Analytics</h1>
          <p className="text-muted-foreground">Search and analyze individual player performance metrics.</p>
        </div>
        
        <div className="relative w-full md:w-96">
          <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search players (e.g. Mbappe)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-card border border-white/10 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-xl pl-12 pr-4 py-3.5 text-white placeholder:text-muted-foreground transition-all shadow-lg"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="h-48 bg-card rounded-2xl animate-pulse border border-white/5" />
          ))}
        </div>
      ) : data?.data.length === 0 ? (
        <div className="p-16 text-center bg-card rounded-3xl border border-white/5 flex flex-col items-center">
          <Search className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-xl font-medium text-white mb-2">No players found</h3>
          <p className="text-muted-foreground">Try adjusting your search criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {data?.data.map((player) => (
            <Link 
              key={player.id}
              href={`/players/${player.id}`}
              className="bg-card hover:bg-card/80 rounded-2xl p-5 border border-white/5 hover:border-primary/40 transition-all duration-300 group shadow-xl hover:-translate-y-1"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-16 h-16 rounded-xl bg-background border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                  {player.photoUrl ? (
                    <img src={player.photoUrl} className="w-full h-full object-cover" alt={player.name} />
                  ) : (
                    <span className="text-2xl font-bold text-muted-foreground">{player.name.charAt(0)}</span>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {player.position && (
                    <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider border border-primary/20">
                      {player.position}
                    </span>
                  )}
                  {player.nationality && (
                    <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {player.nationality}
                    </span>
                  )}
                </div>
              </div>
              
              <h3 className="text-lg font-bold text-white mb-1 group-hover:text-primary transition-colors line-clamp-1">{player.name}</h3>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-4 h-4 rounded-full bg-background flex items-center justify-center shrink-0">
                  {player.team.logoUrl && <img src={player.team.logoUrl} alt="" className="w-3 h-3" />}
                </div>
                <span className="truncate">{player.team.name}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
