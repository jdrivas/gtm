# GTM — Giants Ticket Manager

A Rust-based application for managing SF Giants season tickets and monitoring the team schedule.

## Components

- **gtm-server** — Axum HTTP server that serves the API and React SPA
- **gtm-cli** — Command-line tool for managing tickets and scraping schedules
- **gtm-db** — Database layer (SQLite for dev, PostgreSQL for prod)
- **gtm-models** — Shared domain models
- **gtm-scraper** — MLB Stats API schedule fetcher
- **frontend/** — React SPA (Vite + TypeScript + TailwindCSS)

## Development

### Prerequisites

- Rust (via rustup)
- Node.js (v20+)
- npm

### Build & Run

```bash
# Build the frontend
cd frontend && npm install && npm run build && cd ..

# Run the server
cargo run --bin gtm-server

# Use the CLI
cargo run --bin gtm-cli -- hello
```

The server listens on `http://localhost:3000`.

### API

- `GET /api/health` — Health check

## License

MIT
