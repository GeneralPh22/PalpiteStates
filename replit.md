# Workspace

## Overview

PalpiteStats — a premium dark-themed football analytics and betting analysis platform. Provides global football statistics, match analysis, player stats, bookmaker odds, and AI-powered predictions.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite, Tailwind CSS, Recharts, Framer Motion, React Query
- **AI**: OpenAI via Replit AI Integrations (gpt-5.2)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── palpite-stats/      # React + Vite frontend (root path /)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   ├── db/                 # Drizzle ORM schema + DB connection
│   └── integrations-openai-ai-server/  # OpenAI integration server package
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Database Schema

- **leagues** — Football leagues (id, name, country, logoUrl)
- **teams** — Football clubs (id, name, shortName, logoUrl, leagueId)
- **matches** — Match data with probabilities and odds (id, homeTeamId, awayTeamId, leagueId, kickoffTime, status, scores, probabilities, form, analysis)
- **players** — Player profiles (id, name, position, nationality, age, photoUrl, teamId)
- **player_stats** — Per-match player performance (id, playerId, matchId, goals, assists, shots, fouls, tackles, cards, minutesPlayed)
- **odds** — Bookmaker odds per match (id, matchId, bookmaker, homeWin, draw, awayWin, over25, under25, bttsYes, bttsNo)

## Pages

1. **Home** (`/`) — Today's matches with teams, leagues, probabilities, odds
2. **Matches** (`/matches`) — Searchable match list + detail view with analysis
3. **Players** (`/players`) — Player search + stats table + performance charts
4. **Odds** (`/odds`) — Odds comparison table (Bet365 vs Betano)
5. **AI Predictions** (`/ai`) — Chat assistant powered by OpenAI gpt-5.2

## API Endpoints

### Internal (PostgreSQL / Drizzle)
- `GET /api/matches?date=YYYY-MM-DD` — Today's/date matches
- `GET /api/matches/:id` — Match detail + analysis
- `GET /api/players?search=&page=&limit=` — Player search
- `GET /api/players/:id` — Player detail + stats + recent matches
- `GET /api/odds?date=YYYY-MM-DD&matchId=` — Bookmaker odds
- `GET /api/leagues` — All leagues
- `POST /api/ai/predict` — AI prediction (body: {question, context?})

### API-Football (Live data via `API_FOOTBALL_KEY`)
- `GET /api/matches-today` — All fixtures scheduled for today (live + finished + upcoming)
- `GET /api/player-stats?id=&season=` — Player profile and season statistics
- `GET /api/team-stats?team=&league=&season=` — Team statistics for a given league season

## TypeScript & Composite Projects

- `lib/*` packages are composite and emit declarations via `tsc --build`
- `artifacts/*` are leaf packages checked with `tsc --noEmit`
- Always typecheck from the root: `pnpm run typecheck`

## Root Scripts

- `pnpm run build` — typecheck + build all
- `pnpm run typecheck` — full typecheck via project references

## Key Commands

- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client/zod from openapi.yaml
- `pnpm --filter @workspace/db run push` — push schema changes to DB
