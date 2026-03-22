# GTM — Giants Ticket Manager — Project Plan

## Overview

A Rust-based application for managing SF Giants season tickets and monitoring the team schedule. The system consists of an Axum HTTP server, a CLI tool, and a React SPA frontend. It uses SQLite for local development and PostgreSQL (RDS) for production, deployed on AWS ECS Fargate with Terraform-managed infrastructure.

## Project Structure

```
gtm/
├── Cargo.toml                  # Workspace root
├── Dockerfile                  # Slim: frontend build + pre-built binary (no Rust compile)
├── Makefile                    # All deploy ops: build, push, deploy, release, etc.
├── CHANGELOG.md                # Keep a Changelog format, drives GitHub Release notes
├── PLAN.md                     # This file
├── README.md
├── .github/workflows/          # CI (check/test), Deploy (Docker → ECR → ECS), Release (binary)
├── crates/
│   ├── app/                    # Unified binary: HTTP server + CLI (Axum, Clap)
│   ├── config/                 # Layered config: defaults → file → env → CLI
│   ├── db/                     # Database layer (SQLx AnyPool — SQLite dev / Postgres prod)
│   ├── models/                 # Shared domain models
│   └── scraper/                # MLB Stats API schedule fetcher
├── frontend/                   # React SPA (Vite + TypeScript + TailwindCSS)
├── infra/                      # Terraform (VPC, ECS, RDS, ALB, Secrets Manager, IAM)
├── docs/                       # auth.md, etc.
├── migrations/                 # SQL migrations — Postgres dialect (staging/prod)
└── migrations-sqlite/          # SQL migrations — SQLite dialect (local dev)
```

## Technology Stack

| Layer         | Technology                                              |
|---------------|---------------------------------------------------------|
| Server        | Axum, Tokio, tower-http (static file serving)           |
| CLI           | Clap (derive)                                           |
| Database      | SQLx AnyPool (SQLite for local dev, Postgres for prod)  |
| Auth          | Auth0 (JWT), jsonwebtoken crate, JWKS validation        |
| Scraper       | reqwest + serde_json (MLB Stats API — JSON, no HTML)    |
| Frontend      | React 18, Vite, TypeScript, TailwindCSS, React Router   |
| Container     | Multi-stage Dockerfile (pre-built binary + frontend)    |
| Orchestration | AWS ECS Fargate                                         |
| Infrastructure| Terraform (VPC, RDS, ALB, ECS, Secrets Manager, IAM)    |
| CI/CD         | GitHub Actions (CI, Deploy, Release)                    |
| Releases      | GitHub Releases (pre-built linux/amd64 binary)          |

## Data Source

MLB Stats API (free, public, JSON):
```
https://statsapi.mlb.com/api/v1/schedule?teamId=137&season=2025&sportId=1
```
Team ID `137` = San Francisco Giants.

## Domain Models

| Entity         | Key Fields                                                                  |
|----------------|-----------------------------------------------------------------------------|
| Game           | game_pk, official_date, game_time, home_team, away_team, venue, status      |
| Promotion      | id, game_pk (FK), name                                                      |
| Seat           | id, section, row, seat, notes                                               |
| GameTicket     | id, game_pk (FK), seat_id (FK), status, notes, assigned_to (FK → users)     |
| User           | id, auth0_sub, email, name (roles come from JWT, not stored)                |
| TicketRequest  | id, user_id (FK), game_pk, seats_requested, seats_approved, status, notes   |

## API Endpoints

**Public**

| Method | Path                      | Description                        |
|--------|---------------------------|------------------------------------|
| GET    | /api/health               | Health check + version string      |

**Auth-required (any logged-in user)**

| Method | Path                              | Description                             |
|--------|-----------------------------------|-----------------------------------------|
| GET    | /api/games                        | List games (optional `?month=` filter)  |
| GET    | /api/games/{id}                   | Game details                            |
| GET    | /api/games/{id}/promotions        | Promotions for a game                   |
| GET    | /api/games/{id}/tickets           | Tickets for a game                      |
| GET    | /api/seats                        | List all seats                          |
| GET    | /api/tickets/summary              | Ticket availability summary per game    |
| PATCH  | /api/tickets/{id}                 | Update ticket status/notes              |
| GET    | /api/users/me                     | Current user info (auto-provision)      |
| GET    | /api/users                        | List all users                          |
| GET    | /api/my/requests                  | My ticket requests                      |
| POST   | /api/my/requests                  | Create a ticket request                 |
| PATCH  | /api/my/requests/{id}             | Update my request                       |
| DELETE | /api/my/requests/{id}             | Withdraw my request                     |
| GET    | /api/my/games                     | My allocated tickets                    |
| POST   | /api/my/games/{game_pk}/release   | Release an allocated ticket             |

**Admin-only**

| Method | Path                                    | Description                         |
|--------|-----------------------------------------|-------------------------------------|
| POST   | /api/seats                              | Add a seat                          |
| POST   | /api/seats/batch                        | Add multiple seats                  |
| PATCH  | /api/seats/group                        | Update seat group                   |
| DELETE | /api/seats/{id}                         | Delete a seat                       |
| POST   | /api/admin/scrape-schedule              | Trigger schedule scrape             |
| GET    | /api/admin/allocation                   | Allocation summary (all games)      |
| GET    | /api/admin/allocation/{game_pk}         | Allocation detail for a game        |
| GET    | /api/admin/allocation/by-user/{user_id} | Allocation detail for a user        |
| POST   | /api/admin/allocate                     | Assign tickets to a user            |
| DELETE | /api/admin/allocate/{id}                | Revoke a ticket assignment          |
| GET    | /api/admin/requests                     | All ticket requests                 |

**SPA fallback:** `GET /*` — serves `index.html` with injected runtime config

## CLI Commands

All commands are subcommands of the single `gtm` binary. Global options (`--log-level`, `--utc`) go before the subcommand.

```
gtm serve                                  # Start HTTP server (default port 3000)
gtm serve --port 8080                      # Start on custom port
gtm scrape-schedule [--season 2026]        # Fetch & populate games + promotions from MLB Stats API
gtm list-games [--month 4]                 # Print upcoming games
gtm add-seat --section VR313 --row A --seat 1  # Register a season ticket seat
gtm list-seats                             # Print registered seats
gtm list-tickets                           # Print ticket inventory per game
gtm generate-tickets                       # Generate game_tickets for all seats × home games
gtm hello                                  # Hello, Giants! 🏟️
gtm --log-level debug serve                # Example: debug logging
gtm --utc serve                            # Example: UTC timestamps
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

#### 2d-families: Family Grouping (deferred)
Deferred — users request tickets directly (no family grouping needed yet).

#### 2d-requests: Ticket Request Workflow ✅
- [x] `ticket_requests` table migration + model
- [x] `POST /api/my/requests` — member creates request
- [x] `GET /api/my/requests` — member sees own requests
- [x] `PATCH /api/my/requests/{id}` — update request; `DELETE` — withdraw
- [x] `GET /api/admin/requests` — admin sees all requests
- [x] Frontend: request creation from schedule, My Requests page

#### 2d-allocation: Admin Allocation ✅
- [x] `GET /api/admin/allocation` — demand summary per game (oversubscription detection)
- [x] `GET /api/admin/allocation/{game_pk}` — all requests + seat assignments for a game
- [x] `GET /api/admin/allocation/by-user/{user_id}` — allocation detail per user
- [x] `POST /api/admin/allocate` — assign tickets to users
- [x] `DELETE /api/admin/allocate/{id}` — revoke assignment
- [x] `assigned_to` column on `game_tickets` (FK → users)
- [x] Frontend: AllocationDashboard, GameAllocation pages
- [x] `GET /api/my/games` — member's allocated tickets ("My Games" view)
- [x] `POST /api/my/games/{game_pk}/release` — member releases allocated ticket

### Phase 3 — Frontend Build-Out ✅
- [x] Schedule page with game list, ticket availability badges, month filter
- [x] Ticket detail panel in expanded game row (individual seats + statuses)
- [x] Seat admin page (add/delete seats, batch add)
- [x] My Requests page (create, update, withdraw ticket requests)
- [x] My Games page (view allocated tickets, release back)
- [x] Allocation Dashboard (admin: demand summary, oversubscription view)
- [x] Game Allocation page (admin: assign/revoke seats per game)
- [x] Auth-aware navigation (login/logout, admin badge, role-gated links)
- [x] Version tooltip on SF logo (git hash from /api/health)

### Phase 4 — Containerization & AWS Deployment ✅
- [x] Multi-stage Dockerfile (frontend build + pre-built binary, no Rust compile in Docker)
- [x] SQLx AnyPool: runtime SQLite/Postgres detection via URL prefix
- [x] Dual migration sets: `migrations/` (Postgres) + `migrations-sqlite/` (SQLite)
- [x] Terraform infrastructure (`infra/`): VPC, public/private subnets, ALB, ECS Fargate, RDS Postgres, Secrets Manager, IAM, CloudWatch
- [x] ECR for container images
- [x] GitHub Actions CI (fmt, clippy, build, test) on every push
- [x] GitHub Actions Deploy (Docker build → ECR push → ECS restart) on push to main
- [x] DB credentials via AWS Secrets Manager (injected into ECS task as env vars)
- [x] RDS in private subnets, not exposed to public internet
- [x] NAT instance for private subnet egress (cost-optimized vs NAT Gateway)
- [x] CLI access via SSM Session Manager port forwarding through NAT instance (documented in `infra/README.md`)
- [x] Staging environment live: `staging-gtm.rivas-yee.com`
- [x] DNS via Hover.com (manual CNAME records, not Route 53)

### Phase 5 — Release Pipeline & Runtime Config ✅
- [x] Runtime Auth0 config injection: server injects `window.__GTM_CONFIG__` into `index.html` at startup
- [x] Frontend bundle is environment-agnostic (no build-time `VITE_AUTH0_*` vars)
- [x] `auth0_client_id` added to config crate + Terraform Secrets Manager + ECS task definition
- [x] Removed `VITE_AUTH0_*` from Dockerfile, Makefile, deploy.yml
- [x] GitHub Releases workflow: tag push → CI + build → binary uploaded as release asset
- [x] Dockerfile simplified: downloads pre-built binary, no Rust build stage (~1s Docker build)
- [x] Makefile: `make release VERSION=v0.x.y` (tags + pushes), `make deploy` (download binary → Docker → ECR → ECS)
- [x] CHANGELOG.md workflow: changelog-driven release notes, Makefile enforces update before tagging

---

## What's Next

Open items for future work (not prioritized):

- **Export allocations** — Let users download their current allocations as a CSV or Excel (.xlsx) file from the My Tickets page. Include game date, opponent, seat details, and status.
- **Calendar integration** — Let users add their allocated games to their calendar. Options to explore: .ics file download (universal — works with Apple Calendar, Google Calendar, Outlook), Google Calendar API direct add, and/or a subscribable calendar feed URL.
- **Admin user panel** — Admin-only page showing all users with last login date, games/seats requested, and games/seats allocated. Gives admins a quick overview of user activity and demand.
- **Family grouping** (2d-families) — group users into families for ticket allocation; deferred until needed
- **Frontend polish** — mobile responsiveness, loading skeletons, error boundaries
- **Monitoring** — CloudWatch alarms, uptime checks, error rate alerting
- **README.md update** — README is stale; should reflect current deployment, API, and Makefile usage
