const TOP_LEAGUE_IDS: Record<number, number> = {
  39: 1,    // Premier League
  140: 2,   // La Liga
  78: 3,    // Bundesliga
  61: 4,    // Ligue 1
  135: 5,   // Serie A
  71: 6,    // Brasileirão Série A
  2: 7,     // Champions League
  3: 8,     // Europa League
  848: 9,   // Conference League
  13: 10,   // Copa Libertadores
  11: 11,   // Copa Sudamericana
  9: 12,    // Copa America
  94: 13,   // Primeira Liga (Portugal)
  88: 14,   // Eredivisie
  // Tier-2 domestic
  40: 15,   // Championship (England)
  141: 16,  // La Liga 2 (Spain)
  79: 17,   // 2. Bundesliga
  136: 18,  // Serie B (Italy)
  62: 19,   // Ligue 2 (France)
  72: 20,   // Série B (Brazil)
  // Cups & others
  73: 21,   // Copa do Brasil
  65: 22,   // Copa del Rey
  45: 23,   // FA Cup
  103: 24,  // Eliteserien
  253: 25,  // MLS
  197: 26,  // Super Lig
  218: 27,  // Saudi Pro League
  128: 28,  // Liga Profesional
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
