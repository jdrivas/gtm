# GTM — Giants Ticket Manager — Project Plan

## Overview

A Rust-based application for managing SF Giants season tickets and monitoring the team schedule. The system consists of an Axum HTTP server, a CLI tool, and a React SPA frontend. It uses SQLite for local development and targets AWS RDS PostgreSQL for production, deployed on Kubernetes (EKS).

## Project Structure

```
gtm/
├── Cargo.toml                  # Workspace root
├── .gitignore
├── README.md
├── PLAN.md                     # This file
├── Dockerfile
├── k8s/                        # Kubernetes manifests (future)
├── migrations/                 # SQL migrations (shared between SQLite/Postgres)
├── crates/
│   ├── app/                    # Unified binary: HTTP server + CLI (Axum, Clap)
│   ├── db/                     # Database layer (SQLx — SQLite dev / Postgres prod)
│   ├── models/                 # Shared domain models
│   └── scraper/                # MLB Stats API schedule fetcher
└── frontend/                   # React SPA (Vite + TypeScript + TailwindCSS)
```

## Technology Stack

| Layer      | Technology                                              |
|------------|---------------------------------------------------------|
| Server     | Axum, Tokio, tower-http (static file serving)           |
| CLI        | Clap (derive)                                           |
| Database   | SQLx (SQLite feature for dev, Postgres feature for prod)|
| Scraper    | reqwest + serde_json (MLB Stats API — JSON, no HTML)    |
| Frontend   | React 18, Vite, TypeScript, TailwindCSS, React Router   |
| Container  | Multi-stage Dockerfile                                  |
| Orchestration | Kubernetes (AWS EKS)                                 |
| CI/CD      | TBD                                                     |

## Data Source

MLB Stats API (free, public, JSON):
```
https://statsapi.mlb.com/api/v1/schedule?teamId=137&season=2025&sportId=1
```
Team ID `137` = San Francisco Giants.

## Domain Models

| Entity   | Key Fields                                                              |
|----------|-------------------------------------------------------------------------|
| Game     | id, date, time, opponent, home_away, venue, result (nullable)           |
| Ticket   | id, game_id (FK), section, row, seat, cost, status, holder_notes        |

## API Endpoints

| Method  | Path               | Description                          |
|---------|---------------------|--------------------------------------|
| GET     | /api/health         | Health check / hello world           |
| GET     | /api/games          | List games (filterable by date range)|
| GET     | /api/games/:id      | Game details                         |
| GET     | /api/tickets        | List all tickets                     |
| POST    | /api/tickets        | Add a ticket                         |
| PATCH   | /api/tickets/:id    | Update ticket status/notes           |
| DELETE  | /api/tickets/:id    | Remove a ticket                      |
| GET     | /*                  | Serve React SPA (fallback)           |

## CLI Commands

All commands are subcommands of the single `gtm` binary. Global options (`--log-level`, `--utc`) go before the subcommand.

```
gtm serve                    # Start HTTP server (default port 3000)
gtm serve --port 8080        # Start on custom port
gtm scrape-schedule          # Fetch & populate games from MLB Stats API
gtm list-games [--month X]   # Print upcoming games
gtm list-tickets             # Print ticket inventory
gtm add-ticket ...           # Add a ticket interactively or via flags
gtm --log-level debug serve  # Example: debug logging with serve
gtm --utc serve              # Example: UTC timestamps
```

---

## Phases

### Phase 1 — Scaffolding & Hello World
- [x] Initialize Cargo workspace with all crates (server, cli, db, models, scraper)
- [x] Set up Axum server returning "Hello, Giants!" on `/api/health`
- [x] Set up CLI with Clap, `--version`, and a placeholder subcommand
- [x] Set up React frontend with Vite + TypeScript + TailwindCSS, display "Hello, Giants!"
- [x] Configure server to serve the built SPA static files
- [x] Initialize git, `.gitignore`, create GitHub repo, push via SSH

### Phase 2a — Database Infrastructure & Game Schema
- [x] Add SQLx with SQLite feature to `crates/db`
- [x] Create migration for `games` table
- [x] Implement `db` crate: connection pool, run migrations, CRUD for games
- [x] Wire up `/api/games` and `/api/games/:id` endpoints in server
- [x] Add `list-games` CLI subcommand

### Phase 2b — Populate Schedule from MLB Stats API
- [x] Implement `crates/scraper`: fetch schedule JSON from MLB Stats API, parse into Game models
- [x] Add `scrape-schedule` CLI subcommand that fetches and upserts games into the DB
- [x] Validate data and handle edge cases (postponed games, doubleheaders, TBD times)

### Phase 2c — Seats & Game Tickets
- [x] Create migration for `seats` table (section/row/seat, unique constraint)
- [x] Create migration for `game_tickets` table (FK to games + seats, unique per game+seat)
- [x] Add `Seat`, `GameTicket`, `GameTicketDetail` models to `crates/models`
- [x] Implement DB functions: `add_seat`, `list_seats`, `generate_tickets_for_seat`, `generate_tickets_for_all_seats`, `list_tickets_for_game`, `update_ticket_status`, `ticket_summary_for_games`
- [x] Auto-generate `game_tickets` rows when adding a seat (one per home game)
- [x] Hook ticket generation into `scrape-schedule` (backfill new home games × existing seats)
- [x] Wire up API: `POST /api/seats`, `GET /api/seats`, `GET /api/games/{id}/tickets`, `PATCH /api/tickets/{id}`, `GET /api/tickets/summary`
- [x] Add CLI: `add-seat`, `list-seats`, implement `list-tickets`
- [x] Frontend: ticket availability badges (available/total) on home game rows in ScheduleTable

### Phase 2d — Auth, Users & Ticket Allocation

#### 2d-auth: Auth0 Integration ✅
- [x] Auth0 tenant setup (momentlabs.auth0.com, SPA app, API audience)
- [x] Frontend: `@auth0/auth0-react`, `Auth0Provider` in `main.tsx`
- [x] Frontend: Login/logout button in nav header (`App.tsx`)
- [x] Frontend: Auth-aware fetch with Bearer token (`api.ts` → `authFetch`)
- [x] Backend: `jsonwebtoken` + `reqwest` deps, JWKS fetch at startup
- [x] Backend: `AuthUser` extractor (JWT validation: signature, expiry, audience, issuer)
- [x] Backend: `AppState` with `FromRef` for `SqlitePool` + `Arc<AuthConfig>`
- [x] Backend: `users` table migration + `User` model + DB functions (`upsert_user`, `get_user_by_sub`, `list_users`)
- [x] Backend: `GET /api/users/me` (auto-provision on first login, first user = admin)
- [x] Backend: `GET /api/users` (list all, requires auth)
- [x] Backend: CORS layer, `AUTH0_DOMAIN` / `AUTH0_AUDIENCE` env vars
- [x] Updated ARCHITECTURE.md with auth flow, users table, env vars, component tree

#### 2d-config: Unified Config Management ✅
- [x] New `crates/config` crate with `Config` struct (single source of truth)
- [x] Layered resolution: compiled defaults → `~/.gtm/config.toml` → env vars → CLI args
- [x] Migrated all existing settings: `db_url`, `port`, `log_level`, `utc`, `auth0_domain`, `auth0_audience`
- [x] CLI args made optional (use config values when not explicitly provided)
- [x] `POST /api/admin/scrape-schedule` endpoint (auth-protected, for remote triggering)
- [x] CLI remains direct-DB by design (admin tool that works even when server is down)

#### 2d-families: Family Grouping
- [ ] `families` table migration + model + CRUD
- [ ] Add `family_id` to `users` table
- [ ] Admin UI: manage families, assign users to families
- [ ] API: `GET/POST /api/families`, `PATCH /api/users/{id}` (set family)

#### 2d-requests: Ticket Request Workflow
- [ ] `ticket_requests` table migration + model
- [ ] `POST /api/requests` — member creates request (family_id derived from user)
- [ ] `GET /api/requests` — admin sees all; member sees own family's
- [ ] Frontend: "Request Tickets" button on schedule, family request list

#### 2d-allocation: Admin Draft Board
- [ ] `GET /api/allocation/games` — demand summary per game
- [ ] `GET /api/allocation/games/{game_pk}` — all requests + assignments for a game
- [ ] `POST /api/allocation/games/{game_pk}` — bulk-assign seats to families
- [ ] Add `family_id` column to `game_tickets`
- [ ] Frontend: allocation dashboard (oversubscription view, assign, finalize)
- [ ] Post-allocation: waitlisted requests, admin reassign, voluntary release
- [ ] `GET /api/my/games` — family's assigned tickets ("My Games" view)

### Phase 3 — Frontend Build-Out
- [ ] Schedule view page (calendar or list)
- [ ] Ticket detail panel in expanded game row (show individual seats + statuses)
- [ ] Ticket inventory page
- [ ] Add/edit ticket form
- [ ] Connect all pages to API

### Phase 4 — Containerization & AWS Deployment
- [ ] Multi-stage Dockerfile (build Rust + Vite, minimal runtime image)
- [ ] Kubernetes manifests (Deployment, Service, ConfigMap/Secrets)
- [ ] Switch DB feature flag to Postgres for release builds
- [ ] AWS ECR for images, EKS for cluster
- [ ] CI/CD pipeline (TBD)
- [ ] **DB credentials via AWS IAM** — DB (Postgres/RDS) must not be exposed to public internet. Server runs in AWS VPC and authenticates to RDS using IAM credentials (not static passwords). The `Config` struct will need a new resolution path for AWS-managed secrets (e.g., IAM auth token, Secrets Manager, or env vars injected by EKS).
- [ ] **CLI access post-deployment** — Determine best approach for admin CLI access to production DB (e.g., bastion host, SSM Session Manager, or a VPN into the VPC). Defer until deployment is underway.
