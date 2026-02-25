use axum::{Router, extract::{Path, Query, State}, routing::get, Json};
use chrono::{Datelike, Local};
use clap::{Parser, Subcommand, ValueEnum};
use serde::Deserialize;
use serde_json::json;
use sqlx::SqlitePool;
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

    /// Database URL
    #[arg(long, default_value = "sqlite:gtm.db", global = true)]
    db_url: String,

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
    ScrapeSchedule {
        /// Season year to fetch (default: current year)
        #[arg(short, long, default_value_t = chrono::Local::now().year() as u32)]
        season: u32,
    },
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

#[derive(Deserialize)]
struct GamesQuery {
    month: Option<u32>,
}

async fn api_list_games(
    State(pool): State<SqlitePool>,
    Query(params): Query<GamesQuery>,
) -> Result<Json<Vec<gtm_models::Game>>, (axum::http::StatusCode, String)> {
    gtm_db::list_games(&pool, params.month)
        .await
        .map(Json)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn api_get_game(
    State(pool): State<SqlitePool>,
    Path(game_pk): Path<i64>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    match gtm_db::get_game(&pool, game_pk).await {
        Ok(Some(game)) => Ok(Json(serde_json::to_value(game).unwrap())),
        Ok(None) => Err((axum::http::StatusCode::NOT_FOUND, "Game not found".to_string())),
        Err(e) => Err((axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

async fn api_get_game_promotions(
    State(pool): State<SqlitePool>,
    Path(game_pk): Path<i64>,
) -> Result<Json<Vec<gtm_models::Promotion>>, (axum::http::StatusCode, String)> {
    gtm_db::get_promotions_for_game(&pool, game_pk)
        .await
        .map(Json)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn run_server(port: u16, pool: SqlitePool) -> anyhow::Result<()> {
    info!("GTM v{}", version_string());

    let api_routes = Router::new()
        .route("/health", get(health))
        .route("/games", get(api_list_games))
        .route("/games/{id}", get(api_get_game))
        .route("/games/{id}/promotions", get(api_get_game_promotions));

    let app = Router::new()
        .nest("/api", api_routes)
        .fallback_service(ServeDir::new("frontend/dist"))
        .with_state(pool);

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

    // Connect to DB and run migrations for commands that need it
    let needs_db = !matches!(cli.command, Commands::Hello);
    let pool = if needs_db {
        let pool = gtm_db::connect(&cli.db_url).await?;
        gtm_db::migrate(&pool).await?;
        Some(pool)
    } else {
        None
    };

    match cli.command {
        Commands::Serve { port } => {
            run_server(port, pool.unwrap()).await?;
        }
        Commands::Hello => {
            println!("Hello, Giants! 🏟️");
        }
        Commands::ScrapeSchedule { season } => {
            let data = gtm_scraper::fetch_schedule(season).await?;
            let db = pool.as_ref().unwrap();
            for game in &data.games {
                gtm_db::upsert_game(db, game).await?;
            }
            for promo in &data.promotions {
                gtm_db::upsert_promotion(db, promo).await?;
            }
            info!("{} games, {} promotions upserted into database", data.games.len(), data.promotions.len());
        }
        Commands::ListGames { month } => {
            let db = pool.as_ref().unwrap();
            let games = gtm_db::list_games(db, month).await?;
            if games.is_empty() {
                println!("No games found.");
            } else {
                println!(
                    "{:<10} {:<12} {:<22} {:<6} {:<25} {:<10} {:<20} {}",
                    "GamePK", "Date", "Time", "H/A", "Opponent", "Status", "Venue", "Promotions"
                );
                println!("{}", "-".repeat(140));
                for g in &games {
                    let home_away = if g.home_team_name == "San Francisco Giants" { "home" } else { "away" };
                    let opponent = if home_away == "home" { &g.away_team_name } else { &g.home_team_name };
                    let time_display = if g.start_time_tbd { "TBD".to_string() } else { g.game_date.clone() };
                    let promos = gtm_db::get_promotions_for_game(db, g.game_pk).await?;
                    let promo_display = if promos.is_empty() {
                        String::new()
                    } else {
                        promos.iter().map(|p| p.name.as_str()).collect::<Vec<_>>().join(", ")
                    };
                    println!(
                        "{:<10} {:<12} {:<22} {:<6} {:<25} {:<10} {:<20} {}",
                        g.game_pk,
                        g.official_date,
                        time_display,
                        home_away,
                        opponent,
                        g.status_detailed,
                        g.venue_name,
                        promo_display,
                    );
                }
                println!("\n{} game(s) total", games.len());
            }
        }
        Commands::ListTickets => {
            println!("Ticket listing not yet implemented (Phase 2c)");
        }
    }

    Ok(())
}
