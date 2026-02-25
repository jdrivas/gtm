# GTM — Giants Ticket Manager

A Rust-based application for managing SF Giants season tickets and monitoring the team schedule.

## Components

- **gtm** (`crates/app`) — Unified binary: HTTP server + CLI in one executable
- **gtm-db** (`crates/db`) — Database layer (SQLite for dev, PostgreSQL for prod)
- **gtm-models** (`crates/models`) — Shared domain models
- **gtm-scraper** (`crates/scraper`) — MLB Stats API schedule fetcher
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

# Start the server
cargo run --bin gtm -- serve

# Start the server on a custom port with debug logging
cargo run --bin gtm -- --log-level debug serve --port 8080

# CLI commands
cargo run --bin gtm -- hello
cargo run --bin gtm -- --help
```

The server listens on `http://localhost:3000` by default.

### API

- `GET /api/health` — Health check

## License

MIT
