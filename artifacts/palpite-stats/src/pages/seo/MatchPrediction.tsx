import { useParams } from "wouter";
import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Target } from "lucide-react";

export default function SeoMatchPrediction() {
  const { match } = useParams<{ match: string }>();

  const teams = match
    ? match
        .replace(/-vs-/g, " vs ")
        .replace(/-/g, " ")
        .split(" vs ")
        .map(s => s.replace(/\b\w/g, c => c.toUpperCase()))
    : [];

  const homeTeam = teams[0] ?? "Home";
  const awayTeam = teams[1] ?? "Away";

  useEffect(() => {
    document.title = `Palpite ${homeTeam} vs ${awayTeam} | PalpiteStats`;
  }, [homeTeam, awayTeam]);

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl text-center">
      <Target className="w-16 h-16 text-primary mx-auto mb-6 opacity-60" />
      <h1 className="text-2xl font-display font-bold text-white mb-2">
        {homeTeam} vs {awayTeam}
      </h1>
      <p className="text-zinc-500 mb-6 text-sm">
        Análise e palpite com inteligência artificial para esta partida.
      </p>
      <Link href="/analysis" className="inline-flex items-center gap-2 text-primary hover:underline text-sm">
        <ArrowLeft className="w-4 h-4" /> Ver todas as análises de hoje
      </Link>
    </div>
  );
}
