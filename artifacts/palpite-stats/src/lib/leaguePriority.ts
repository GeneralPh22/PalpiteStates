const TOP_LEAGUE_IDS: Record<number, number> = {
  2: 1,
  3: 2,
  848: 3,
  61: 4,
  39: 5,
  140: 6,
  135: 7,
  78: 8,
  71: 9,
  94: 10,
  253: 11,
  88: 12,
  103: 13,
  65: 14,
  66: 15,
  40: 16,
  45: 17,
  197: 18,
  218: 19,
  128: 20,
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
