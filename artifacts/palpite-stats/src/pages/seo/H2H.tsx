import { useParams } from "wouter";
import { useEffect } from "react";
import { Link } from "wouter";
import { Swords, ArrowLeft } from "lucide-react";

export default function SeoH2H() {
  const { match } = useParams<{ match: string }>();
  const teams = match
    ? match
        .replace(/-vs-/g, " vs ")
        .replace(/-/g, " ")
        .split(" vs ")
        .map(s => s.replace(/\b\w/g, c => c.toUpperCase()))
    : [];

  const homeTeam = teams[0] ?? "Time A";
  const awayTeam = teams[1] ?? "Time B";

  useEffect(() => {
    document.title = `H2H ${homeTeam} vs ${awayTeam} | PalpiteStats`;
  }, [homeTeam, awayTeam]);

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl text-center">
      <Swords className="w-16 h-16 text-primary mx-auto mb-6 opacity-60" />
      <h1 className="text-2xl font-display font-bold text-white mb-2">
        {homeTeam} vs {awayTeam}
      </h1>
      <p className="text-zinc-500 mb-6 text-sm">Histórico de confrontos diretos e estatísticas.</p>
      <Link href="/analysis" className="inline-flex items-center gap-2 text-primary hover:underline text-sm">
        <ArrowLeft className="w-4 h-4" /> Análises do dia
      </Link>
    </div>
  );
}
