import { ExternalLink } from "lucide-react";

const AFFILIATES = [
  {
    name: "Betfair",
    href: "https://promos.betfair.bet.br/choose-your-refer-and-earn-offer?referrerCode=PAXVX77DL",
    bg: "bg-yellow-400 hover:bg-yellow-300",
    text: "text-black",
  },
  {
    name: "Betano",
    href: "https://referme.to/pedroa-6161",
    bg: "bg-blue-600 hover:bg-blue-500",
    text: "text-white",
  },
];

interface AffiliateButtonsProps {
  label?: string;
  compact?: boolean;
}

export function AffiliateButtons({ label = "Ver Odds", compact = false }: AffiliateButtonsProps) {
  if (compact) {
    return (
      <div className="flex gap-1.5 flex-wrap">
        {AFFILIATES.map(({ name, href, bg, text }) => (
          <a
            key={name}
            href={href}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${bg} ${text}`}
          >
            <ExternalLink className="w-2.5 h-2.5" />
            {name}
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="border-t border-white/[0.06] pt-4 space-y-2">
      <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold">Apostar agora</p>
      <div className="flex gap-2 flex-wrap">
        {AFFILIATES.map(({ name, href, bg, text }) => (
          <a
            key={name}
            href={href}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${bg} ${text}`}
          >
            <ExternalLink className="w-3 h-3" />
            {label} — {name}
          </a>
        ))}
      </div>
      <p className="text-[9px] text-zinc-700 leading-relaxed">
        +18 · Jogue com responsabilidade · T&amp;C aplicam-se
      </p>
    </div>
  );
}
