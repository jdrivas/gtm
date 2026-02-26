use axum::{Router, extract::{Path, Query, State}, routing::{delete, get, patch, post}, Json};
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
    /// Add a season ticket seat
    AddSeat {
        /// Section (e.g. "127")
        #[arg(long)]
        section: String,
        /// Row (e.g. "A")
        #[arg(long)]
        row: String,
        /// Seat number (e.g. "3")
        #[arg(long)]
        seat: String,
        /// Optional notes
        #[arg(long)]
        notes: Option<String>,
    },
    /// List all season ticket seats
    ListSeats,
    /// List ticket inventory for all home games
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

#[derive(Deserialize)]
struct AddSeatRequest {
    section: String,
    row: String,
    seat: String,
    notes: Option<String>,
}

async fn api_add_seat(
    State(pool): State<SqlitePool>,
    Json(body): Json<AddSeatRequest>,
) -> Result<Json<gtm_models::Seat>, (axum::http::StatusCode, String)> {
    let seat = gtm_db::add_seat(&pool, &body.section, &body.row, &body.seat, body.notes.as_deref())
        .await
        .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, e.to_string()))?;
    let count = gtm_db::generate_tickets_for_seat(&pool, seat.id)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    info!("Seat {} added, {} game tickets generated", seat.id, count);
    Ok(Json(seat))
}

async fn api_list_seats(
    State(pool): State<SqlitePool>,
) -> Result<Json<Vec<gtm_models::Seat>>, (axum::http::StatusCode, String)> {
    gtm_db::list_seats(&pool)
        .await
        .map(Json)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

#[derive(Deserialize)]
struct AddSeatBatchRequest {
    section: String,
    row: String,
    seat_start: u32,
    seat_end: u32,
    notes: Option<String>,
}

async fn api_add_seat_batch(
    State(pool): State<SqlitePool>,
    Json(body): Json<AddSeatBatchRequest>,
) -> Result<Json<Vec<gtm_models::Seat>>, (axum::http::StatusCode, String)> {
    if body.seat_start > body.seat_end {
        return Err((axum::http::StatusCode::BAD_REQUEST, "seat_start must be <= seat_end".to_string()));
    }
    if body.seat_end - body.seat_start >= 50 {
        return Err((axum::http::StatusCode::BAD_REQUEST, "Maximum 50 seats per batch".to_string()));
    }
    let mut seats = Vec::new();
    for n in body.seat_start..=body.seat_end {
        let seat = gtm_db::add_seat(&pool, &body.section, &body.row, &n.to_string(), body.notes.as_deref())
            .await
            .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, e.to_string()))?;
        gtm_db::generate_tickets_for_seat(&pool, seat.id)
            .await
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        seats.push(seat);
    }
    info!("{} seats batch-added (Section {} Row {} Seats {}-{})", seats.len(), body.section, body.row, body.seat_start, body.seat_end);
    Ok(Json(seats))
}

#[derive(Deserialize)]
struct UpdateSeatGroupRequest {
    section: String,
    row: String,
    notes: Option<String>,
}

async fn api_update_seat_group(
    State(pool): State<SqlitePool>,
    Json(body): Json<UpdateSeatGroupRequest>,
) -> Result<Json<Vec<gtm_models::Seat>>, (axum::http::StatusCode, String)> {
    let updated = gtm_db::update_seat_group_notes(&pool, &body.section, &body.row, body.notes.as_deref())
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if updated == 0 {
        return Err((axum::http::StatusCode::NOT_FOUND, "No seats found for that section/row".to_string()));
    }
    info!("Updated notes for {} seats in Section {} Row {}", updated, body.section, body.row);
    let seats = gtm_db::list_seats(&pool)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(seats))
}

async fn api_delete_seat(
    State(pool): State<SqlitePool>,
    Path(seat_id): Path<i64>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let deleted = gtm_db::delete_seat(&pool, seat_id)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if deleted {
        Ok(Json(json!({ "status": "ok" })))
    } else {
        Err((axum::http::StatusCode::NOT_FOUND, "Seat not found".to_string()))
    }
}

async fn api_get_game_tickets(
    State(pool): State<SqlitePool>,
    Path(game_pk): Path<i64>,
) -> Result<Json<Vec<gtm_models::GameTicketDetail>>, (axum::http::StatusCode, String)> {
    gtm_db::list_tickets_for_game(&pool, game_pk)
        .await
        .map(Json)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

#[derive(Deserialize)]
struct UpdateTicketRequest {
    status: String,
    notes: Option<String>,
}

async fn api_update_ticket(
    State(pool): State<SqlitePool>,
    Path(ticket_id): Path<i64>,
    Json(body): Json<UpdateTicketRequest>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let updated = gtm_db::update_ticket_status(&pool, ticket_id, &body.status, body.notes.as_deref())
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if updated {
        Ok(Json(json!({ "status": "ok" })))
    } else {
        Err((axum::http::StatusCode::NOT_FOUND, "Ticket not found".to_string()))
    }
}

async fn api_ticket_summary(
    State(pool): State<SqlitePool>,
) -> Result<Json<Vec<serde_json::Value>>, (axum::http::StatusCode, String)> {
    let summary = gtm_db::ticket_summary_for_games(&pool)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let result: Vec<serde_json::Value> = summary
        .into_iter()
        .map(|(game_pk, total, available)| {
            json!({ "game_pk": game_pk, "total": total, "available": available })
        })
        .collect();
    Ok(Json(result))
}

async fn run_server(port: u16, pool: SqlitePool) -> anyhow::Result<()> {
    info!("GTM v{}", version_string());

    let api_routes = Router::new()
        .route("/health", get(health))
        .route("/games", get(api_list_games))
        .route("/games/{id}", get(api_get_game))
        .route("/games/{id}/promotions", get(api_get_game_promotions))
        .route("/games/{id}/tickets", get(api_get_game_tickets))
        .route("/seats", get(api_list_seats).post(api_add_seat))
        .route("/seats/batch", post(api_add_seat_batch))
        .route("/seats/group", patch(api_update_seat_group))
        .route("/seats/{id}", delete(api_delete_seat))
        .route("/tickets/{id}", patch(api_update_ticket))
        .route("/tickets/summary", get(api_ticket_summary));

    let app = Router::new()
        .nest("/api", api_routes)
        .fallback_service(ServeDir::new("frontend/dist").fallback(tower_http::services::ServeFile::new("frontend/dist/index.html")))
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
            let ticket_count = gtm_db::generate_tickets_for_all_seats(db).await?;
            if ticket_count > 0 {
                info!("{ticket_count} new game tickets generated for existing seats");
            }
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
        Commands::AddSeat { section, row, seat, notes } => {
            let db = pool.as_ref().unwrap();
            let new_seat = gtm_db::add_seat(db, &section, &row, &seat, notes.as_deref()).await?;
            let count = gtm_db::generate_tickets_for_seat(db, new_seat.id).await?;
            println!("Added seat: Section {} Row {} Seat {} (id={})", new_seat.section, new_seat.row, new_seat.seat, new_seat.id);
            println!("{count} game tickets generated for home games");
        }
        Commands::ListSeats => {
            let db = pool.as_ref().unwrap();
            let seats = gtm_db::list_seats(db).await?;
            if seats.is_empty() {
                println!("No seats registered. Use `gtm add-seat` to add one.");
            } else {
                println!("{:<6} {:<10} {:<6} {:<6} {}", "ID", "Section", "Row", "Seat", "Notes");
                println!("{}", "-".repeat(50));
                for s in &seats {
                    println!("{:<6} {:<10} {:<6} {:<6} {}", s.id, s.section, s.row, s.seat, s.notes.as_deref().unwrap_or(""));
                }
                println!("\n{} seat(s) total", seats.len());
            }
        }
        Commands::ListTickets => {
            let db = pool.as_ref().unwrap();
            let seats = gtm_db::list_seats(db).await?;
            if seats.is_empty() {
                println!("No seats registered. Use `gtm add-seat` to add one.");
            } else {
                let games = gtm_db::list_games(db, None).await?;
                let home_games: Vec<_> = games.iter().filter(|g| g.home_team_name == "San Francisco Giants").collect();
                println!(
                    "{:<10} {:<12} {:<25} {}",
                    "GamePK", "Date", "Opponent", "Tickets (available/total)"
                );
                println!("{}", "-".repeat(80));
                for g in &home_games {
                    let tickets = gtm_db::list_tickets_for_game(db, g.game_pk).await?;
                    let available = tickets.iter().filter(|t| t.status == "available").count();
                    let detail: Vec<String> = tickets.iter().map(|t| {
                        format!("{}:{}{} [{}]", t.section, t.row, t.seat, t.status)
                    }).collect();
                    println!(
                        "{:<10} {:<12} {:<25} {}/{} — {}",
                        g.game_pk,
                        g.official_date,
                        g.away_team_name,
                        available,
                        tickets.len(),
                        detail.join(", "),
                    );
                }
                println!("\n{} home game(s), {} seat(s)", home_games.len(), seats.len());
            }
        }
    }

    Ok(())
}
