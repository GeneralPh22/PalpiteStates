import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "palpite_fav_leagues_v1";

export function useFavoriteLeagues() {
  const [favorites, setFavorites] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    } catch {}
  }, [favorites]);

  const toggle = useCallback((id: number) => {
    setFavorites(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, []);

  const isFavorite = useCallback((id: number) => favorites.includes(id), [favorites]);

  return { favorites, toggle, isFavorite };
}
