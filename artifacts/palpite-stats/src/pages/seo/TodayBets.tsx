import { useEffect } from "react";
import { useLocation } from "wouter";

export default function SeoTodayBets() {
  const [, navigate] = useLocation();
  useEffect(() => {
    document.title = "Melhores Apostas Hoje | PalpiteStats – Value Bets com IA";
    navigate("/value-bets");
  }, [navigate]);
  return null;
}
