# Workspace

## Overview

PalpiteStats — a premium dark-themed football analytics and betting analysis platform. Provides global football statistics, match analysis, player stats, bookmaker odds, AI-powered predictions, user authentication, 5-day free trial, and subscription management.

**Target domain:** `www.palpitestats.com`

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
- **Auth**: bcryptjs (password hashing) + session tokens in DB
- **Payments**: Stripe (set `STRIPE_SECRET_KEY` secret)

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

1. **Home** (`/`) — Today's matches sorted by top leagues (Flashscore-style), with AI insights and odds
2. **Matches** (`/matches`) — Searchable match list + detail view with analysis
3. **Players** (`/players`) — Player search + stats table + performance charts
4. **Odds** (`/odds`) — Odds comparison table
5. **AI Predictions** (`/ai`) — Chat assistant powered by OpenAI
6. **Login** (`/login`) — User login with email/password
7. **Register** (`/register`) — User registration with 5-day trial, LGPD consent
8. **Pricing** (`/pricing`) — Subscription plans (R$20/mo, R$50/3mo, R$95/6mo, R$180/yr)
9. **Privacy** (`/privacy`) — LGPD-compliant privacy policy
10. **Subscription Success** (`/subscription/success`) — Post-payment confirmation

## API Endpoints

### Internal (PostgreSQL / Drizzle)
- `GET /api/matches?date=YYYY-MM-DD` — Today's/date matches
- `GET /api/matches/:id` — Match detail + analysis
- `GET /api/players?search=&page=&limit=` — Player search
- `GET /api/players/:id` — Player detail + stats
- `GET /api/odds?date=YYYY-MM-DD&matchId=` — Bookmaker odds
- `GET /api/leagues` — All leagues
- `POST /api/ai/predict` — AI prediction

### Auth
- `POST /api/auth/register` — Register new user (creates trial subscription)
- `POST /api/auth/login` — Login, returns session token
- `POST /api/auth/logout` — Invalidate session
- `GET /api/auth/me` — Current user + subscription + accessLevel
- `POST /api/auth/verify-email` — Verify email token
- `POST /api/auth/stripe/checkout` — Create Stripe checkout session
- `POST /api/auth/stripe/webhook` — Handle Stripe webhook (set STRIPE_WEBHOOK_SECRET)

### API-Football (Live data via `API_FOOTBALL_KEY`)
- `GET /api/matches-today` — All fixtures for today (sorted by league priority)
- `GET /api/player-stats?id=&season=` — Player profile and season statistics
- `GET /api/team-stats?team=&league=&season=` — Team statistics
- `GET /api/live-odds?fixture=` — Live odds for a fixture
- `GET /api/fixture-analysis?homeTeam=&awayTeam=&league=` — AI probability analysis

## Subscription & Access Levels

- **`trial`** — 5-day full access after registration
- **`full`** — Paid subscriber (monthly/quarterly/semiannual/annual)
- **`limited`** — Trial expired or not logged in (basic odds visible, AI analysis blurred)

## Required Secrets

- `API_FOOTBALL_KEY` — API-Football.com API key (required)
- `STRIPE_SECRET_KEY` — Stripe secret key (required for payments)
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook secret (optional, for webhook verification)
- `JWT_SECRET` — JWT signing secret (optional, defaults to insecure placeholder)

## Social Media & SEO

- OG image: `/og-image.png` (16:9, auto-generated)
- Favicon: `/logo.png`
- Meta tags: Open Graph + Twitter Card configured in `index.html`
- Configured for domain: `www.palpitestats.com`
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
