export interface LeagueInfo {
  id: number;
  name: string;
}

export interface CountryLeagues {
  country: string;
  flag: string;
  code: string;
  leagues: LeagueInfo[];
}

export const COUNTRY_LEAGUES: CountryLeagues[] = [
  { country: "Brasil",      flag: "🇧🇷", code: "BR", leagues: [{ id: 71,  name: "Série A" },          { id: 72,  name: "Série B" }] },
  { country: "England",     flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", code: "GB-ENG", leagues: [{ id: 39,  name: "Premier League" },    { id: 40,  name: "Championship" }] },
  { country: "Spain",       flag: "🇪🇸", code: "ES", leagues: [{ id: 140, name: "La Liga" },            { id: 141, name: "Segunda División" }] },
  { country: "Germany",     flag: "🇩🇪", code: "DE", leagues: [{ id: 78,  name: "Bundesliga" },          { id: 79,  name: "2. Bundesliga" }] },
  { country: "Italy",       flag: "🇮🇹", code: "IT", leagues: [{ id: 135, name: "Serie A" },             { id: 136, name: "Serie B" }] },
  { country: "France",      flag: "🇫🇷", code: "FR", leagues: [{ id: 61,  name: "Ligue 1" },             { id: 62,  name: "Ligue 2" }] },
  { country: "Portugal",    flag: "🇵🇹", code: "PT", leagues: [{ id: 94,  name: "Primeira Liga" },        { id: 95,  name: "Liga Portugal 2" }] },
  { country: "Netherlands", flag: "🇳🇱", code: "NL", leagues: [{ id: 88,  name: "Eredivisie" },           { id: 89,  name: "Eerste Divisie" }] },
  { country: "Scotland",    flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", code: "GB-SCT", leagues: [{ id: 179, name: "Premiership" },         { id: 180, name: "Championship" }] },
  { country: "Norway",      flag: "🇳🇴", code: "NO", leagues: [{ id: 103, name: "Eliteserien" },          { id: 104, name: "OBOS Ligaen" }] },
  { country: "Denmark",     flag: "🇩🇰", code: "DK", leagues: [{ id: 119, name: "Superliga" },            { id: 120, name: "1st Division" }] },
  { country: "Sweden",      flag: "🇸🇪", code: "SE", leagues: [{ id: 113, name: "Allsvenskan" },          { id: 114, name: "Superettan" }] },
];

export const ALL_LEAGUE_IDS = COUNTRY_LEAGUES.flatMap(c => c.leagues.map(l => l.id));

export function findLeague(id: number): { league: LeagueInfo; country: CountryLeagues } | undefined {
  for (const country of COUNTRY_LEAGUES) {
    const league = country.leagues.find(l => l.id === id);
    if (league) return { league, country };
  }
  return undefined;
}
