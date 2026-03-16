import { useParams } from "wouter";
import { useEffect } from "react";
import { Link } from "wouter";
import { Trophy, ArrowLeft } from "lucide-react";

export default function SeoTeamPage() {
  const { team } = useParams<{ team: string }>();
  const teamName = team ? team.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "Team";

  useEffect(() => {
    document.title = `${teamName} – Estatísticas e Palpites | PalpiteStats`;
  }, [teamName]);

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl text-center">
      <Trophy className="w-16 h-16 text-primary mx-auto mb-6 opacity-60" />
      <h1 className="text-2xl font-display font-bold text-white mb-2">{teamName}</h1>
      <p className="text-zinc-500 mb-6 text-sm">Estatísticas, forma e palpites para {teamName}.</p>
      <Link href="/" className="inline-flex items-center gap-2 text-primary hover:underline text-sm">
        <ArrowLeft className="w-4 h-4" /> Ver jogos de hoje
      </Link>
    </div>
  );
}
