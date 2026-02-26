# GTM — Architecture & Theory of Operations

> **Version:** 0.1.1 · **Last updated:** 2026-02-26

## 1. System Overview

GTM (Giants Ticket Manager) is a season-ticket management tool for the San Francisco Giants. It ingests the official MLB schedule, maps season-ticket seats to every home game, and provides a web UI and CLI for managing seat inventory and (soon) allocating tickets to users.

```
┌─────────────────────────────────────────────────────────┐
│                      Operators / Users                   │
│                                                         │
│   CLI (gtm binary)              Browser (React SPA)     │
│        │                              │                  │
└────────┼──────────────────────────────┼──────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────────────────────────────────────────────┐
│                    Axum HTTP Server                       │
│                                                         │
│  /api/*  ─── JSON REST API                              │
│  /*      ─── Static file serving (SPA fallback)         │
│                                                         │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   SQLite Database   │
              │     (gtm.db)        │
              └─────────────────────┘
```

The single `gtm` binary serves as both the HTTP server and the CLI. All subcommands share the same database layer and migration runner.

---

## 2. Workspace Structure

```
gtm/
├── Cargo.toml                     # Workspace root (v0.1.1, edition 2024)
├── PLAN.md                        # Project roadmap & phase checklist
├── ARCHITECTURE.md                # This file
├── migrations/                    # SQLx SQL migrations (applied at startup)
│   ├── ..._create_games_table.sql
│   ├── ..._recreate_games_mirror_api.sql
│   ├── ..._create_promotions_table.sql
│   ├── ..._drop_games_description.sql
│   ├── ..._create_seats_table.sql
│   └── ..._create_game_tickets_table.sql
├── crates/
│   ├── app/                       # Unified binary — Axum server + Clap CLI
│   │   └── src/main.rs
│   ├── db/                        # Database layer — SQLx (SQLite)
│   │   └── src/lib.rs
│   ├── models/                    # Shared domain structs (Serialize, FromRow)
│   │   └── src/lib.rs
│   └── scraper/                   # MLB Stats API client
│       └── src/lib.rs
└── frontend/                      # React SPA
    ├── package.json
    ├── index.html
    ├── src/
    │   ├── main.tsx               # Entry point
    │   ├── App.tsx                # Layout shell, React Router, nav
    │   ├── SchedulePage.tsx       # Schedule list with ticket badges
    │   ├── ScheduleTable.tsx      # Sortable/filterable game table
    │   ├── SeatAdmin.tsx          # Seat CRUD admin page
    │   ├── api.ts                 # Fetch wrappers for all API endpoints
    │   └── types.ts               # TypeScript interfaces
    └── dist/                      # Production build (served by Axum)
```

### Crate Dependency Graph

```
app
├── db
│   └── models
├── models
└── scraper
    └── models
```

`app` is the only binary crate. `db`, `models`, and `scraper` are libraries.

---

## 3. Technology Stack

| Layer         | Technology                                                |
|---------------|-----------------------------------------------------------|
| Language      | Rust (edition 2024)                                       |
| HTTP Server   | Axum 0.8, Tokio, tower-http (ServeDir, ServeFile)         |
| CLI           | Clap 4 (derive macros)                                    |
| Database      | SQLx (SQLite for dev; Postgres planned for prod)          |
| Scraper       | reqwest + serde (MLB Stats API JSON)                      |
| Frontend      | React 19, Vite 8, TypeScript 5.9, TailwindCSS 4          |
| UI Libraries  | Lucide React (icons), React Router 7 (client-side routing)|
| Build Embed   | `GTM_GIT_HASH` env var injected at compile time           |

---

## 4. Database Schema

All tables live in a single SQLite database (`gtm.db` by default). Migrations are managed by SQLx and applied automatically on startup.

### 4.1 `games`

Mirrors the MLB Stats API schedule response. One row per game (home and away).

| Column              | Type    | Constraints                  | Description                          |
|---------------------|---------|------------------------------|--------------------------------------|
| `game_pk`           | INTEGER | NOT NULL, UNIQUE (PK)        | MLB game primary key                 |
| `game_guid`         | TEXT    |                              | MLB game GUID                        |
| `game_type`         | TEXT    | NOT NULL                     | e.g. "R" (regular season)            |
| `season`            | TEXT    | NOT NULL                     | e.g. "2025"                          |
| `game_date`         | TEXT    | NOT NULL                     | ISO 8601 datetime                    |
| `official_date`     | TEXT    | NOT NULL                     | YYYY-MM-DD                           |
| `status_abstract`   | TEXT    | NOT NULL                     | e.g. "Final", "Preview"              |
| `status_detailed`   | TEXT    | NOT NULL                     | e.g. "Scheduled", "Postponed"        |
| `status_code`       | TEXT    | NOT NULL                     | e.g. "S", "F"                        |
| `start_time_tbd`    | INTEGER | NOT NULL, DEFAULT 0          | Boolean (0/1)                        |
| `away_team_id`      | INTEGER | NOT NULL                     | MLB team ID                          |
| `away_team_name`    | TEXT    | NOT NULL                     |                                      |
| `away_score`        | INTEGER |                              | Nullable until game is played        |
| `away_is_winner`    | INTEGER |                              | Boolean, nullable                    |
| `home_team_id`      | INTEGER | NOT NULL                     |                                      |
| `home_team_name`    | TEXT    | NOT NULL                     |                                      |
| `home_score`        | INTEGER |                              |                                      |
| `home_is_winner`    | INTEGER |                              |                                      |
| `venue_id`          | INTEGER | NOT NULL                     |                                      |
| `venue_name`        | TEXT    | NOT NULL                     |                                      |
| `day_night`         | TEXT    |                              | "day" or "night"                     |
| `series_description`| TEXT    |                              |                                      |
| `series_game_number`| INTEGER |                              |                                      |
| `games_in_series`   | INTEGER |                              |                                      |
| `double_header`     | TEXT    | NOT NULL, DEFAULT 'N'        |                                      |
| `game_number`       | INTEGER | NOT NULL, DEFAULT 1          |                                      |
| `scheduled_innings` | INTEGER | NOT NULL, DEFAULT 9          |                                      |
| `is_tie`            | INTEGER | NOT NULL, DEFAULT 0          |                                      |
| `created_at`        | TEXT    | NOT NULL, DEFAULT now        |                                      |
| `updated_at`        | TEXT    | NOT NULL, DEFAULT now        |                                      |

### 4.2 `promotions`

Game-day promotions (bobbleheads, giveaways, etc.) sourced from the MLB Stats API.

| Column          | Type    | Constraints                         | Description                |
|-----------------|---------|-------------------------------------|----------------------------|
| `offer_id`      | INTEGER | NOT NULL                            | MLB offer ID               |
| `game_pk`       | INTEGER | NOT NULL, FK → games(game_pk)       | Associated game            |
| `name`          | TEXT    | NOT NULL                            | Promotion name             |
| `offer_type`    | TEXT    |                                     |                            |
| `description`   | TEXT    |                                     |                            |
| `distribution`  | TEXT    |                                     |                            |
| `presented_by`  | TEXT    |                                     |                            |
| `alt_page_url`  | TEXT    |                                     |                            |
| `ticket_link`   | TEXT    |                                     |                            |
| `thumbnail_url` | TEXT    |                                     |                            |
| `image_url`     | TEXT    |                                     |                            |
| `display_order` | INTEGER | NOT NULL, DEFAULT 0                 |                            |
| `created_at`    | TEXT    | NOT NULL, DEFAULT now               |                            |
| `updated_at`    | TEXT    | NOT NULL, DEFAULT now               |                            |
|                 |         | **UNIQUE(offer_id, game_pk)**       |                            |

### 4.3 `seats`

Season ticket seat inventory. Each row is one physical seat.

| Column       | Type    | Constraints                        | Description              |
|--------------|---------|------------------------------------|--------------------------|
| `id`         | INTEGER | PRIMARY KEY AUTOINCREMENT          |                          |
| `section`    | TEXT    | NOT NULL                           | e.g. "121"               |
| `row`        | TEXT    | NOT NULL                           | e.g. "E"                 |
| `seat`       | TEXT    | NOT NULL                           | e.g. "12"                |
| `notes`      | TEXT    |                                    | Free-form notes          |
| `created_at` | DATETIME| NOT NULL, DEFAULT now              |                          |
| `updated_at` | DATETIME| NOT NULL, DEFAULT now              |                          |
|              |         | **UNIQUE(section, row, seat)**     |                          |

### 4.4 `game_tickets`

The cross-product of seats × home games. One row = one seat for one game.

| Column       | Type    | Constraints                        | Description              |
|--------------|---------|------------------------------------|--------------------------|
| `id`         | INTEGER | PRIMARY KEY AUTOINCREMENT          |                          |
| `game_pk`    | INTEGER | NOT NULL, FK → games(game_pk)      |                          |
| `seat_id`    | INTEGER | NOT NULL, FK → seats(id)           |                          |
| `status`     | TEXT    | NOT NULL, DEFAULT 'available'      | "available", "assigned", etc. |
| `notes`      | TEXT    |                                    |                          |
| `created_at` | DATETIME| NOT NULL, DEFAULT now              |                          |
| `updated_at` | DATETIME| NOT NULL, DEFAULT now              |                          |
|              |         | **UNIQUE(game_pk, seat_id)**       |                          |

### Entity Relationship Diagram

```
┌──────────┐       ┌─────────────┐       ┌──────────┐
│  games   │       │ game_tickets│       │  seats   │
│          │ 1───* │             │ *───1 │          │
│ game_pk ─┼───────┤ game_pk     │       │ id ──────┤
│          │       │ seat_id ────┼───────┤          │
│          │       │ status      │       │ section  │
│          │       │ notes       │       │ row      │
└────┬─────┘       └─────────────┘       │ seat     │
     │ 1                                  │ notes    │
     │                                    └──────────┘
     │ *
┌────┴──────────┐
│  promotions   │
│               │
│ offer_id      │
│ game_pk       │
│ name          │
└───────────────┘
```

---

## 5. Data Workflows

### 5.1 Schedule Ingestion

```
                   ┌───────────────────┐
                   │  MLB Stats API    │
                   │  statsapi.mlb.com │
                   └────────┬──────────┘
                            │  HTTP GET (JSON)
                            ▼
                   ┌───────────────────┐
                   │  gtm_scraper      │
                   │  fetch_schedule() │
                   └────────┬──────────┘
                            │  Vec<Game>, Vec<Promotion>
                            ▼
              ┌─────────────────────────────┐
              │         gtm_db              │
              │                             │
              │  upsert_game()       ──────►│── games table
              │  upsert_promotion()  ──────►│── promotions table
              │                             │
              │  generate_tickets_   ──────►│── game_tickets table
              │    for_all_seats()          │   (INSERT OR IGNORE for
              │                             │    each new game × seat)
              └─────────────────────────────┘
```

**Trigger:** `gtm scrape-schedule [--season YYYY]`

1. Fetches the full season schedule from `statsapi.mlb.com` (team ID 137 = Giants).
2. Upserts every game and promotion into the database (idempotent via `ON CONFLICT`).
3. Backfills `game_tickets` rows: for each existing seat, creates an "available" ticket for any new home game that doesn't already have one.

### 5.2 Seat Management

```
  Admin (CLI or SPA)
         │
         ├── add-seat / POST /api/seats ──► INSERT into seats
         │                                      │
         │                                      ▼
         │                              generate_tickets_for_seat()
         │                              (creates game_tickets for all home games)
         │
         ├── POST /api/seats/batch ────► Loop: add N seats + generate tickets
         │
         ├── PATCH /api/seats/group ───► UPDATE notes on all seats in section/row
         │
         └── DELETE /api/seats/{id} ───► DELETE game_tickets WHERE seat_id = ?
                                         DELETE seats WHERE id = ?
```

Seats are grouped logically by **section + row** in the UI. Operations like "edit notes" and "delete group" apply to all seats sharing a section/row.

### 5.3 Request Flow (HTTP)

```
  Browser
    │
    ├── GET /admin/seats ────────► ServeDir fallback ─► index.html (SPA)
    │                                                     │
    │                               React Router handles  │
    │                               client-side route     ▼
    │                                                  <SeatAdmin />
    │
    ├── GET /api/seats ──────────► api_list_seats() ──► gtm_db::list_seats()
    │
    ├── POST /api/seats/batch ───► api_add_seat_batch() ──► gtm_db::add_seat() × N
    │                                                        + generate_tickets_for_seat() × N
    │
    └── GET /api/games?month=4 ──► api_list_games() ──► gtm_db::list_games()
```

All API routes are nested under `/api`. Any non-API path falls through to `ServeDir` which serves the built React SPA from `frontend/dist/`, with a fallback to `index.html` to support client-side routing.

---

## 6. API Reference

Base URL: `http://localhost:3000/api`

### System

| Method | Path               | Description                    |
|--------|--------------------|--------------------------------|
| GET    | `/health`          | Health check, returns version  |

### Games

| Method | Path                       | Query Params   | Description                        |
|--------|----------------------------|----------------|------------------------------------|
| GET    | `/games`                   | `?month=1..12` | List games, optionally by month    |
| GET    | `/games/{id}`              |                | Single game by `game_pk`           |
| GET    | `/games/{id}/promotions`   |                | Promotions for a game              |
| GET    | `/games/{id}/tickets`      |                | Ticket details (seats + status)    |

### Seats

| Method | Path               | Body                                                         | Description                                |
|--------|--------------------|--------------------------------------------------------------|--------------------------------------------|
| GET    | `/seats`           |                                                              | List all seats                             |
| POST   | `/seats`           | `{ section, row, seat, notes? }`                             | Add a single seat + generate game tickets  |
| POST   | `/seats/batch`     | `{ section, row, seat_start, seat_end, notes? }`             | Batch-add seats (max 50) + generate tickets|
| PATCH  | `/seats/group`     | `{ section, row, notes? }`                                   | Update notes for all seats in a group      |
| DELETE | `/seats/{id}`      |                                                              | Delete seat + cascade delete game tickets  |

### Tickets

| Method | Path                 | Body                      | Description                    |
|--------|----------------------|---------------------------|--------------------------------|
| PATCH  | `/tickets/{id}`      | `{ status, notes? }`      | Update ticket status/notes     |
| GET    | `/tickets/summary`   |                            | Per-game totals (total, available) |

### SPA Fallback

| Method | Path   | Description                                      |
|--------|--------|--------------------------------------------------|
| GET    | `/*`   | Serves `frontend/dist/`, falls back to `index.html` |

---

## 7. CLI Reference

All commands are subcommands of the single `gtm` binary.

### Global Options

| Flag            | Default         | Description                            |
|-----------------|-----------------|----------------------------------------|
| `--log-level`   | `info`          | Logging verbosity: trace, debug, info, warn, error |
| `--utc`         | off (local)     | Display log timestamps in UTC          |
| `--db-url`      | `sqlite:gtm.db` | Database connection URL                |
| `--version`     |                 | Print version and git hash             |

### Commands

| Command                 | Flags                                         | Description                                                      |
|-------------------------|-----------------------------------------------|------------------------------------------------------------------|
| `serve`                 | `--port N` (default 3000)                     | Start the HTTP server (API + SPA)                                |
| `hello`                 |                                               | Print "Hello, Giants! 🏟️"                                       |
| `scrape-schedule`       | `--season YYYY` (default: current year)       | Fetch schedule from MLB Stats API, upsert games + promotions, backfill game tickets |
| `list-games`            | `--month M` (1–12, optional)                  | Print a tabular game listing                                     |
| `add-seat`              | `--section S --row R --seat N [--notes TEXT]`  | Register a season ticket seat and generate game tickets           |
| `list-seats`            |                                               | Print all registered seats                                       |
| `list-tickets`          |                                               | Print per-game ticket inventory for all home games                |

### Usage Examples

```bash
# Start the server
gtm serve
gtm serve --port 8080

# Ingest schedule data
gtm scrape-schedule
gtm scrape-schedule --season 2026

# Manage seats
gtm add-seat --section 121 --row E --seat 12
gtm add-seat --section 121 --row E --seat 13 --notes "Aisle seat"
gtm list-seats

# View ticket inventory
gtm list-games --month 6
gtm list-tickets

# Debugging
gtm --log-level debug serve
gtm --utc --log-level trace scrape-schedule
```

---

## 8. Frontend Architecture

### Pages & Routing

| Route           | Component        | Description                                     |
|-----------------|------------------|-------------------------------------------------|
| `/`             | `SchedulePage`   | Season schedule table with ticket availability badges |
| `/admin/seats`  | `SeatAdmin`      | Seat inventory CRUD — add/edit/delete groups    |

Routing is handled by React Router (`BrowserRouter`). The Axum server's SPA fallback ensures deep links work on page refresh.

### Component Tree

```
<BrowserRouter>
  <App>                          ── Layout shell: header + nav
    <Routes>
      <Route path="/">
        <SchedulePage>           ── Fetches games + ticket summary
          <ScheduleTable>        ── Sortable table with expandable promo rows
        </SchedulePage>
      </Route>
      <Route path="/admin/seats">
        <SeatAdmin>              ── Seat group CRUD
        </SeatAdmin>
      </Route>
    </Routes>
  </App>
</BrowserRouter>
```

### Data Flow

```
Component          API call                      Data
─────────          ────────                      ────
SchedulePage  ──►  fetchGames()             ──►  Game[]
              ──►  fetchTicketSummary()     ──►  TicketSummary[]

SeatAdmin     ──►  fetchSeats()             ──►  Seat[]
              ──►  addSeatBatch(...)         ──►  Seat[] (created)
              ──►  updateSeatGroupNotes(...) ──►  Seat[] (full refresh)
              ──►  deleteSeat(id)           ──►  void
```

---

## 9. Build & Run

### Prerequisites

- Rust toolchain (edition 2024)
- Node.js (for frontend build)
- SQLite3

### Build

```bash
# Backend
cargo build                      # Debug build
cargo build --release            # Release build

# Frontend
cd frontend && npm install && npm run build
```

The frontend builds into `frontend/dist/`, which the Axum server serves as static files.

### Run

```bash
# Start server (auto-runs migrations)
cargo run --bin gtm -- serve

# Or use the release binary
./target/release/gtm serve
```

### Environment

| Variable       | Purpose                                      |
|----------------|----------------------------------------------|
| `GTM_GIT_HASH` | Set at compile time via `build.rs`; shown in `--version` and `/api/health` |

---

## 10. Key Design Decisions

1. **Single binary** — The `gtm` binary is both the server and the CLI. This simplifies deployment and ensures the CLI uses the exact same DB code as the server.

2. **Automatic ticket generation** — When a seat is added, `game_tickets` rows are created for every existing home game. When new games are scraped, tickets are backfilled for every existing seat. This keeps the cross-product of seats × home games always complete.

3. **Cascade deletes** — Deleting a seat first removes all its `game_tickets` rows, then the seat itself. This avoids FK violations without requiring `ON DELETE CASCADE` in SQLite.

4. **Seat groups** — Seats are grouped by section + row in the UI. Group-level operations (edit notes, delete group) update all seats sharing that section/row.

5. **SPA fallback** — The Axum server uses `ServeDir` with a `ServeFile` fallback to `index.html`, enabling React Router client-side navigation without 404s on refresh.

6. **Idempotent ingestion** — `upsert_game` and `upsert_promotion` use `ON CONFLICT ... DO UPDATE`, and ticket generation uses `INSERT OR IGNORE`. Running `scrape-schedule` multiple times is safe.
