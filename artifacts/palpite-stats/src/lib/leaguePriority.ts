const TOP_LEAGUE_IDS: Record<number, number> = {
  39: 1,    // Premier League
  140: 2,   // La Liga
  78: 3,    // Bundesliga
  61: 4,    // Ligue 1
  135: 5,   // Serie A
  71: 6,    // Brasileirão
  2: 7,     // Champions League
  3: 8,     // Europa League
  848: 9,   // Conference League
  94: 10,   // Primeira Liga (Portugal)
  253: 11,  // MLS
  88: 12,   // Eredivisie
  103: 13,  // Eliteserien
  65: 14,   // Copa del Rey
  66: 15,   // Copa do Brasil
  40: 16,   // Championship
  45: 17,   // FA Cup
  197: 18,  // Super Lig
  218: 19,  // Saudi Pro League
  128: 20,  // Liga Profesional
};

const TOP_COUNTRY_ORDER = [
  "UEFA",
  "World",
  "England",
  "Spain",
  "Italy",
  "Germany",
  "France",
  "Portugal",
  "Brazil",
  "Netherlands",
  "Belgium",
  "Argentina",
  "USA",
];

export function getLeaguePriority(leagueId: number, country: string): number {
  if (leagueId in TOP_LEAGUE_IDS) return TOP_LEAGUE_IDS[leagueId];
  const countryIdx = TOP_COUNTRY_ORDER.findIndex((c) =>
    country?.toLowerCase().includes(c.toLowerCase())
  );
  if (countryIdx >= 0) return 100 + countryIdx;
  return 999;
}

export function sortMatchesByLeague<T extends { league: { id: number; name: string; country: string } }>(
  matches: T[]
): T[] {
  return [...matches].sort((a, b) => {
    const pa = getLeaguePriority(a.league.id, a.league.country);
    const pb = getLeaguePriority(b.league.id, b.league.country);
    if (pa !== pb) return pa - pb;
    return a.league.name.localeCompare(b.league.name);
  });
}
