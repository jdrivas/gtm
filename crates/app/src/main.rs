use axum::{Router, routing::get, Json};
use chrono::Local;
use clap::{Parser, Subcommand, ValueEnum};
use serde_json::json;
use tower_http::services::ServeDir;
use tracing::info;
use tracing_subscriber::EnvFilter;
use tracing_subscriber::fmt::time::OffsetTime;

const VERSION: &str = env!("CARGO_PKG_VERSION");
const GIT_HASH: &str = env!("GTM_GIT_HASH");

fn version_string() -> String {
    format!("{VERSION} ({GIT_HASH})")
}

// --- CLI definition ---

#[derive(Debug, Clone, ValueEnum)]
enum LogLevel {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
}

impl std::fmt::Display for LogLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LogLevel::Trace => write!(f, "trace"),
            LogLevel::Debug => write!(f, "debug"),
            LogLevel::Info => write!(f, "info"),
            LogLevel::Warn => write!(f, "warn"),
            LogLevel::Error => write!(f, "error"),
        }
    }
}

#[derive(Parser)]
#[command(name = "gtm")]
#[command(about = "SF Giants Ticket Manager")]
#[command(version = concat!(env!("CARGO_PKG_VERSION"), " (", env!("GTM_GIT_HASH"), ")"))]
struct Cli {
    /// Log level
    #[arg(short, long, default_value = "info", global = true)]
    log_level: LogLevel,

    /// Display log timestamps in UTC (default: local time)
    #[arg(long, global = true)]
    utc: bool,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the HTTP server
    Serve {
        /// Port to listen on
        #[arg(short, long, default_value = "3000")]
        port: u16,
    },
    /// Display a hello world message
    Hello,
    /// Scrape the Giants schedule from the MLB Stats API
    ScrapeSchedule,
    /// List upcoming games
    ListGames {
        /// Filter by month (1-12)
        #[arg(long)]
        month: Option<u32>,
    },
    /// List ticket inventory
    ListTickets,
}

// --- Logging ---

fn init_logging(cli: &Cli) {
    let filter = EnvFilter::new(cli.log_level.to_string());

    if cli.utc {
        tracing_subscriber::fmt()
            .with_env_filter(filter)
            .with_timer(OffsetTime::new(
                time::UtcOffset::UTC,
                time::macros::format_description!(
                    "[year]-[month]-[day]T[hour]:[minute]:[second].[subsecond digits:3]Z"
                ),
            ))
            .init();
    } else {
        tracing_subscriber::fmt()
            .with_env_filter(filter)
            .with_timer(LocalTimer)
            .init();
    }
}

struct LocalTimer;

impl tracing_subscriber::fmt::time::FormatTime for LocalTimer {
    fn format_time(&self, w: &mut tracing_subscriber::fmt::format::Writer<'_>) -> std::fmt::Result {
        let now = Local::now();
        write!(w, "{}", now.format("%Y-%m-%dT%H:%M:%S%.3f%:z"))
    }
}

// --- Server ---

async fn health() -> Json<serde_json::Value> {
    Json(json!({
        "status": "ok",
        "message": "Hello, Giants!",
        "version": version_string()
    }))
}

async fn run_server(port: u16) -> anyhow::Result<()> {
    info!("GTM v{}", version_string());

    let api_routes = Router::new().route("/health", get(health));

    let app = Router::new()
        .nest("/api", api_routes)
        .fallback_service(ServeDir::new("frontend/dist"));

    let addr = format!("0.0.0.0:{port}");
    info!("Listening on http://{addr}");

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

// --- Main ---

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    init_logging(&cli);

    match cli.command {
        Commands::Serve { port } => {
            run_server(port).await?;
        }
        Commands::Hello => {
            println!("Hello, Giants! 🏟️");
        }
        Commands::ScrapeSchedule => {
            println!("Schedule scraping not yet implemented (Phase 2b)");
        }
        Commands::ListGames { month } => {
            match month {
                Some(m) => println!("Listing games for month {m} (not yet implemented — Phase 2a)"),
                None => println!("Listing all games (not yet implemented — Phase 2a)"),
            }
        }
        Commands::ListTickets => {
            println!("Ticket listing not yet implemented (Phase 2c)");
        }
    }

    Ok(())
}
