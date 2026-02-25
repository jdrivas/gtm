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
- [ ] Implement `crates/scraper`: fetch schedule JSON from MLB Stats API, parse into Game models
- [ ] Add `scrape-schedule` CLI subcommand that fetches and upserts games into the DB
- [ ] Validate data and handle edge cases (postponed games, doubleheaders, TBD times)

### Phase 2c — Tickets & Seating
- [ ] Create migration for `tickets` table (FK to games)
- [ ] Implement ticket CRUD in `crates/db`
- [ ] Wire up `/api/tickets` endpoints in server
- [ ] Add `list-tickets` and `add-ticket` CLI subcommands

### Phase 3 — Frontend Build-Out
- [ ] Schedule view page (calendar or list)
- [ ] Ticket inventory page
- [ ] Add/edit ticket form
- [ ] Connect all pages to API

### Phase 4 — Containerization & AWS Deployment
- [ ] Multi-stage Dockerfile (build Rust + Vite, minimal runtime image)
- [ ] Kubernetes manifests (Deployment, Service, ConfigMap/Secrets)
- [ ] Switch DB feature flag to Postgres for release builds
- [ ] AWS ECR for images, EKS for cluster
- [ ] CI/CD pipeline (TBD)
