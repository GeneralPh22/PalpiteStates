# Workspace

## Overview

PalpiteStats — a premium dark-themed football analytics and betting insights platform. Provides global football statistics, match analysis, player stats, bookmaker odds comparison, AI-powered predictions, value bets, user authentication, 5-day free trial, and subscription management.

**Target domain:** `www.palpitestats.com.br`

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
- **Frontend**: React + Vite, Tailwind CSS v4, Recharts, Framer Motion, React Query, Wouter
- **AI**: OpenAI via Replit AI Integrations (gpt-5.2)
- **Auth**: bcryptjs (password hashing) + session tokens in DB
- **Payments**: Stripe (set `STRIPE_SECRET_KEY` secret)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server (port 8080)
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

### Sports Data
- **leagues** — Football leagues (id, name, country, logoUrl)
- **teams** — Football clubs (id, name, shortName, logoUrl, leagueId)
- **matches** — Match data with probabilities and odds
- **players** — Player profiles
- **player_stats** — Per-match player performance
- **odds** — Bookmaker odds per match

### Auth & Subscriptions
- **users** — User accounts (id, email, passwordHash, emailVerified, emailVerifyToken)
- **subscriptions** — User plans (id, userId, plan, status, trialStartAt, trialEndAt, currentPeriodEnd, stripeCustomerId)
- **sessions** — Auth session tokens (id, userId, token, expiresAt)

## Pages

### Core Platform Pages
1. **Home** (`/`) — Today's matches (LIVE/Upcoming/Finished), clickable match cards, demo banner
2. **Fixture Detail** (`/fixture/:id`) — Full match analysis with 6 tabs: Overview, Team Stats, H2H, Players, Odds, AI Analysis
3. **Match Detail** (`/matches/:id`) — Internal DB match detail
4. **Matches** (`/matches`) — Searchable match list from DB
5. **Daily Analysis** (`/analysis`) — AI probability analysis for all today's matches
6. **Value Bets** (`/value-bets`) — AI-detected value bets where bookmaker odds > fair odds (EV filtering)
7. **Top Players** (`/top-players`) — Per-90 player rankings, filterable by position/league/metric
8. **Players** (`/players`) — Player search + stats table
9. **Player Detail** (`/players/:id`) — Player profile + per-90 charts
10. **Odds** (`/odds`) — Odds comparison table
11. **AI Predictions** (`/ai`) — Chat assistant powered by OpenAI

### Auth & Commerce
12. **Login** (`/login`) — User login with email/password
13. **Register** (`/register`) — User registration with 5-day trial, LGPD consent
14. **Pricing** (`/pricing`) — Plans (R$20/mo, R$50/3mo, R$95/6mo, R$180/yr)
15. **Privacy** (`/privacy`) — LGPD-compliant privacy policy
16. **Subscription Success** (`/subscription/success`) — Post-payment confirmation

### SEO Pages (redirect-to-canonical)
- `/jogos-ao-vivo` → Home (live matches)
- `/melhores-apostas-hoje` → /value-bets
- `/palpites-hoje` → /analysis
- `/palpites/:match` → match prediction page
- `/time/:team` → team page
- `/jogador/:player` → player page
- `/h2h/:match` → head-to-head page

## API Endpoints

### Internal (PostgreSQL / Drizzle)
- `GET /api/matches?date=YYYY-MM-DD` — Date matches from DB
- `GET /api/matches/:id` — Match detail + analysis from DB
- `GET /api/players?search=&page=&limit=` — Player search
- `GET /api/players/:id` — Player detail + stats
- `GET /api/odds?date=YYYY-MM-DD&matchId=` — Bookmaker odds from DB
- `GET /api/leagues` — All leagues
- `POST /api/ai/predict` — AI prediction via OpenAI

### Auth
- `POST /api/auth/register` — Register new user (creates trial subscription)
- `POST /api/auth/login` — Login, returns session token
- `POST /api/auth/logout` — Invalidate session
- `GET /api/auth/me` — Current user + subscription + accessLevel
- `POST /api/auth/verify-email` — Verify email token
- `POST /api/auth/stripe/checkout` — Create Stripe checkout session
- `POST /api/auth/stripe/webhook` — Handle Stripe webhook

### Live Data (API-Football with Demo Fallback)
All endpoints automatically fall back to rich demo data when API-Football is unavailable/suspended:
- `GET /api/matches-today` — All fixtures for today (+ `demo: true` flag when using fallback)
- `GET /api/fixture/:id` — Fixture details (supports demo IDs 99001–99012)
- `GET /api/fixture/:id/analysis` — AI probability analysis (Poisson model)
- `GET /api/fixture/:id/odds` — Bookmaker odds (Bet365, Betano)
- `GET /api/fixture/:id/stats` — Team match statistics (in-match, real-time)
- `GET /api/fixture/:id/team-stats` — Season statistics for both teams (season=2025, fallback to last-5)
- `GET /api/fixture/:id/last5` — Last 5 matches for each team
- `GET /api/fixture/:id/h2h` — Head-to-head history (last 3, cached 6h)
- `GET /api/player-stats?id=&season=` — Player season statistics
- `GET /api/team-stats?team=&league=&season=` — Team statistics
- `GET /api/live-odds?fixture=` — Legacy alias for fixture odds
- `GET /api/fixture-analysis?homeTeam=&awayTeam=&league=` — Legacy alias
- `GET /api/api-status` — Current API status (suspended flag, cache size)

## Demo Data System

**CRITICAL:** The API-Football account is currently suspended. The backend has a complete demo fallback:

- **12 demo fixtures** (IDs 99001–99012) across UCL, Premier League, Brasileirão, LaLiga, Bundesliga, Serie A
- 3 LIVE matches (Real Madrid 2-1 Arsenal 67', Man City 1-0 Tottenham 34', Flamengo 1-1 Palmeiras 52')
- 5 Upcoming matches (Barcelona vs Atletico, PSG vs Bayern, São Paulo vs Corinthians, Napoli vs Inter, Bayer vs Dortmund)
- 4 Finished matches (Man United 0-2 Chelsea, Sevilla 3-1 Betis, Bayern 3-1 Leipzig, Atletico Mineiro 2-2 Grêmio)

**Suspension detection:** After first API-Football call fails, all subsequent calls for 5 minutes skip the HTTP request and return demo data immediately (~40ms response time).

## Probability Engine

Implemented in `football-api.ts` → `calcMatchProbabilities()`:
- **Model**: Poisson distribution for goal scoring
- **Parameters**: homeAttack, homeDefend, awayAttack, awayDefend, leagueAvg (1.35)
- **Outputs**: homeWin, draw, awayWin, over25, under25, btts, playerGoal, cornerOver9, over35cards
- **Value bet detection**: `fairOdds = 1 / probability`; `valueBet = bookmakerOdds > fairOdds`

## Subscription & Access Levels

- **`trial`** — 5-day full access after registration
- **`full`** — Paid subscriber (monthly/quarterly/semiannual/annual)
- **`limited`** — Trial expired or not logged in (basic odds visible, AI analysis blurred)

## Required Secrets

- `API_FOOTBALL_KEY` — API-Football.com API key (required; account currently suspended — reactivate at dashboard.api-football.com)
- `STRIPE_SECRET_KEY` — Stripe secret key (required for payments)
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook secret (optional, for webhook verification)
- `JWT_SECRET` — JWT signing secret (optional, defaults to insecure placeholder)

## Social Media & SEO

- OG image: `/og-image.png` (16:9, auto-generated)
- Favicon: `/logo.png`
- Meta tags: Open Graph + Twitter Card configured in `index.html`
- Configured for domain: `www.palpitestats.com.br`
- Language: `pt-BR`

## League Priority (Flashscore-style ordering)

Top leagues shown first: UEFA Champions League, UEFA Europa League, UEFA Conference League,
Ligue 1, Premier League, La Liga, Serie A, Bundesliga, Brasileirão, Primeira Liga, etc.
Implemented in `src/lib/leaguePriority.ts`.

## TypeScript & Composite Projects

- `lib/*` packages are composite and emit declarations via `tsc --build`
- `artifacts/*` are leaf packages checked with `tsc --noEmit`

## Key Commands

- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client/zod from openapi.yaml
- `pnpm --filter @workspace/db run push` — push schema changes to DB
