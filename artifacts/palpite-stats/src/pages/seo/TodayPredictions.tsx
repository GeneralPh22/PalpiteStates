import { useEffect } from "react";
import { useLocation } from "wouter";

export default function SeoTodayPredictions() {
  const [, navigate] = useLocation();
  useEffect(() => {
    document.title = "Palpites de Hoje | PalpiteStats – Previsões com IA";
    navigate("/analysis");
  }, [navigate]);
  return null;
}
