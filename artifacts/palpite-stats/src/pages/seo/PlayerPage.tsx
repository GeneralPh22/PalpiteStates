import { useParams } from "wouter";
import { useEffect } from "react";
import { Link } from "wouter";
import { Users, ArrowLeft } from "lucide-react";

export default function SeoPlayerPage() {
  const { player } = useParams<{ player: string }>();
  const playerName = player ? player.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "Player";

  useEffect(() => {
    document.title = `${playerName} – Estatísticas Per-90 | PalpiteStats`;
  }, [playerName]);

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl text-center">
      <Users className="w-16 h-16 text-primary mx-auto mb-6 opacity-60" />
      <h1 className="text-2xl font-display font-bold text-white mb-2">{playerName}</h1>
      <p className="text-zinc-500 mb-6 text-sm">Estatísticas per-90 e análise de performance.</p>
      <Link href="/top-players" className="inline-flex items-center gap-2 text-primary hover:underline text-sm">
        <ArrowLeft className="w-4 h-4" /> Ver top jogadores
      </Link>
    </div>
  );
}
