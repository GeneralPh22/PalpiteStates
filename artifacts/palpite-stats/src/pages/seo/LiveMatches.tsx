import { useEffect } from "react";
import { useLocation } from "wouter";

export default function SeoLiveMatches() {
  const [, navigate] = useLocation();
  useEffect(() => {
    document.title = "Jogos ao Vivo Hoje | PalpiteStats – Resultados em Tempo Real";
    navigate("/");
  }, [navigate]);
  return null;
}
