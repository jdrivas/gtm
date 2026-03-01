use axum::{Router, extract::{FromRef, FromRequestParts, Path, Query, State}, routing::{delete, get, patch, post}, Json};
use axum::http::{StatusCode, request::Parts};
use chrono::{Datelike, Local};
use clap::{Parser, Subcommand, ValueEnum};
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::AnyPool;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use tracing::{info, warn};
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
    /// Log level (overrides config file and env)
    #[arg(short, long, global = true)]
    log_level: Option<LogLevel>,

    /// Display log timestamps in UTC (default: local time)
    #[arg(long, global = true)]
    utc: bool,

    /// Database URL (overrides config file and env)
    #[arg(long, global = true)]
    db_url: Option<String>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the HTTP server
    Serve {
        /// Port to listen on (overrides config file and env)
        #[arg(short, long)]
        port: Option<u16>,
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

fn init_logging(config: &gtm_config::Config) {
    let filter = EnvFilter::new(&config.log_level);

    if config.log_json {
        tracing_subscriber::fmt()
            .with_env_filter(filter)
            .json()
            .with_target(true)
            .with_timer(OffsetTime::new(
                time::UtcOffset::UTC,
                time::macros::format_description!(
                    "[year]-[month]-[day]T[hour]:[minute]:[second].[subsecond digits:3]Z"
                ),
            ))
            .init();
    } else if config.utc {
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

// --- Auth ---

#[derive(Clone)]
struct AppState {
    pool: AnyPool,
    auth: Arc<AuthConfig>,
}

impl axum::extract::FromRef<AppState> for AnyPool {
    fn from_ref(state: &AppState) -> AnyPool {
        state.pool.clone()
    }
}

struct AuthConfig {
    jwks_keys: Vec<JwkKey>,
    audience: String,
    issuer: String,
}

#[derive(Clone)]
struct JwkKey {
    kid: String,
    decoding_key: DecodingKey,
}

#[derive(Debug, Deserialize)]
struct Claims {
    sub: String,
    #[serde(default, rename = "https://gtm-api.momentlabs.io/email")]
    email: Option<String>,
    #[serde(default, rename = "https://gtm-api.momentlabs.io/name")]
    name: Option<String>,
    #[serde(default, rename = "https://gtm-api.momentlabs.io/roles")]
    roles: Vec<String>,
}

/// Fetch JWKS from Auth0 and extract RSA decoding keys
async fn fetch_jwks(domain: &str) -> anyhow::Result<Vec<JwkKey>> {
    let url = format!("https://{domain}/.well-known/jwks.json");
    let resp: serde_json::Value = reqwest::get(&url).await?.json().await?;
    let keys = resp["keys"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("No keys in JWKS response"))?;

    let mut result = Vec::new();
    for key in keys {
        let kid = key["kid"].as_str().unwrap_or_default().to_string();
        let n = key["n"].as_str().unwrap_or_default();
        let e = key["e"].as_str().unwrap_or_default();
        if kid.is_empty() || n.is_empty() || e.is_empty() {
            continue;
        }
        match DecodingKey::from_rsa_components(n, e) {
            Ok(decoding_key) => result.push(JwkKey { kid, decoding_key }),
            Err(err) => warn!("Skipping JWK kid={kid}: {err}"),
        }
    }
    info!("Fetched {} JWKS keys from {domain}", result.len());
    Ok(result)
}

/// Axum extractor that validates a JWT Bearer token and returns the claims.
/// Returns 401 if the token is missing or invalid.
struct AuthUser {
    sub: String,
    email: Option<String>,
    name: Option<String>,
    roles: Vec<String>,
}

impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
    Arc<AuthConfig>: axum::extract::FromRef<S>,
{
    type Rejection = (StatusCode, String);

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let auth_config = Arc::<AuthConfig>::from_ref(state);

        let auth_header = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or((StatusCode::UNAUTHORIZED, "Missing Authorization header".to_string()))?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or((StatusCode::UNAUTHORIZED, "Invalid Authorization header format".to_string()))?;

        // Decode header to get kid
        let header = decode_header(token)
            .map_err(|e| (StatusCode::UNAUTHORIZED, format!("Invalid token header: {e}")))?;

        let kid = header.kid
            .ok_or((StatusCode::UNAUTHORIZED, "Token missing kid".to_string()))?;

        // Find matching key
        let jwk_key = auth_config.jwks_keys.iter()
            .find(|k| k.kid == kid)
            .ok_or((StatusCode::UNAUTHORIZED, "No matching JWK for kid".to_string()))?;

        // Validate token
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_audience(&[&auth_config.audience]);
        validation.set_issuer(&[&auth_config.issuer]);

        let token_data = decode::<Claims>(token, &jwk_key.decoding_key, &validation)
            .map_err(|e| (StatusCode::UNAUTHORIZED, format!("Token validation failed: {e}")))?;

        Ok(AuthUser {
            sub: token_data.claims.sub,
            email: token_data.claims.email,
            name: token_data.claims.name,
            roles: token_data.claims.roles,
        })
    }
}

impl axum::extract::FromRef<AppState> for Arc<AuthConfig> {
    fn from_ref(state: &AppState) -> Arc<AuthConfig> {
        state.auth.clone()
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
    State(pool): State<AnyPool>,
    Query(params): Query<GamesQuery>,
) -> Result<Json<Vec<gtm_models::Game>>, (axum::http::StatusCode, String)> {
    gtm_db::list_games(&pool, params.month)
        .await
        .map(Json)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn api_get_game(
    State(pool): State<AnyPool>,
    Path(game_pk): Path<i64>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    match gtm_db::get_game(&pool, game_pk).await {
        Ok(Some(game)) => Ok(Json(serde_json::to_value(game).unwrap())),
        Ok(None) => Err((axum::http::StatusCode::NOT_FOUND, "Game not found".to_string())),
        Err(e) => Err((axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

async fn api_get_game_promotions(
    State(pool): State<AnyPool>,
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
    State(pool): State<AnyPool>,
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
    State(pool): State<AnyPool>,
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
    State(pool): State<AnyPool>,
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
    State(pool): State<AnyPool>,
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
    State(pool): State<AnyPool>,
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
    State(pool): State<AnyPool>,
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
    State(pool): State<AnyPool>,
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
    State(pool): State<AnyPool>,
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

// --- User API endpoints ---

async fn api_get_me(
    auth_user: AuthUser,
    State(pool): State<AnyPool>,
) -> Result<Json<gtm_models::User>, (StatusCode, String)> {
    let user = resolve_user(&auth_user, &pool).await?;
    Ok(Json(user))
}

async fn api_list_users(
    _auth_user: AuthUser,
    State(pool): State<AnyPool>,
) -> Result<Json<Vec<gtm_models::User>>, (StatusCode, String)> {
    gtm_db::list_users(&pool)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

#[derive(Deserialize)]
struct ScrapeScheduleRequest {
    season: Option<u32>,
}

#[derive(Serialize, Deserialize)]
struct ScrapeScheduleResponse {
    games: usize,
    promotions: usize,
    tickets: usize,
}

async fn api_scrape_schedule(
    _auth_user: AuthUser,
    State(pool): State<AnyPool>,
    Json(body): Json<ScrapeScheduleRequest>,
) -> Result<Json<ScrapeScheduleResponse>, (StatusCode, String)> {
    let season = body.season.unwrap_or(chrono::Local::now().year() as u32);
    let data = gtm_scraper::fetch_schedule(season)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    for game in &data.games {
        gtm_db::upsert_game(&pool, game)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }
    for promo in &data.promotions {
        gtm_db::upsert_promotion(&pool, promo)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }
    let ticket_count = gtm_db::generate_tickets_for_all_seats(&pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    info!("{} games, {} promotions upserted, {} tickets generated", data.games.len(), data.promotions.len(), ticket_count);
    Ok(Json(ScrapeScheduleResponse {
        games: data.games.len(),
        promotions: data.promotions.len(),
        tickets: ticket_count as usize,
    }))
}

// --- Helper: resolve AuthUser → local User ---

async fn resolve_user(
    auth_user: &AuthUser,
    pool: &AnyPool,
) -> Result<gtm_models::User, (StatusCode, String)> {
    let name = auth_user.name.as_deref().unwrap_or("Unknown");
    let email = auth_user.email.as_deref().unwrap_or("unknown@example.com");
    let role = if auth_user.roles.contains(&"admin".to_string()) { "admin" } else { "member" };
    gtm_db::upsert_user(pool, &auth_user.sub, email, name, role)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

fn require_admin(auth_user: &AuthUser) -> Result<(), (StatusCode, String)> {
    if !auth_user.roles.contains(&"admin".to_string()) {
        Err((StatusCode::FORBIDDEN, "Admin access required".to_string()))
    } else {
        Ok(())
    }
}

// --- Member: Ticket Requests ---

#[derive(Deserialize)]
struct CreateRequestBody {
    game_pk: i64,
    seats_requested: i64,
    notes: Option<String>,
}

#[derive(Deserialize)]
struct CreateRequestBatchBody {
    requests: Vec<CreateRequestBody>,
}

async fn api_my_requests_list(
    auth_user: AuthUser,
    State(pool): State<AnyPool>,
) -> Result<Json<Vec<gtm_models::TicketRequest>>, (StatusCode, String)> {
    let user = resolve_user(&auth_user, &pool).await?;
    gtm_db::list_requests_for_user(&pool, user.id)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn api_my_requests_create(
    auth_user: AuthUser,
    State(pool): State<AnyPool>,
    Json(body): Json<CreateRequestBatchBody>,
) -> Result<Json<Vec<gtm_models::TicketRequest>>, (StatusCode, String)> {
    let user = resolve_user(&auth_user, &pool).await?;
    let mut results = Vec::new();
    for req in &body.requests {
        if req.seats_requested < 1 || req.seats_requested > 4 {
            return Err((StatusCode::BAD_REQUEST, format!("seats_requested must be 1-4 (got {} for game_pk {})", req.seats_requested, req.game_pk)));
        }
        let tr = gtm_db::create_ticket_request(&pool, user.id, req.game_pk, req.seats_requested, req.notes.as_deref())
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        results.push(tr);
    }
    Ok(Json(results))
}

#[derive(Deserialize)]
struct UpdateRequestBody {
    seats_requested: i64,
}

async fn api_my_requests_update(
    auth_user: AuthUser,
    State(pool): State<AnyPool>,
    Path(request_id): Path<i64>,
    Json(body): Json<UpdateRequestBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let user = resolve_user(&auth_user, &pool).await?;
    if body.seats_requested < 1 || body.seats_requested > 4 {
        return Err((StatusCode::BAD_REQUEST, "seats_requested must be 1-4".to_string()));
    }
    let updated = gtm_db::update_ticket_request(&pool, request_id, user.id, body.seats_requested)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if updated {
        Ok(Json(json!({ "status": "ok" })))
    } else {
        Err((StatusCode::NOT_FOUND, "Request not found or not pending".to_string()))
    }
}

async fn api_my_requests_withdraw(
    auth_user: AuthUser,
    State(pool): State<AnyPool>,
    Path(request_id): Path<i64>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let user = resolve_user(&auth_user, &pool).await?;
    let withdrawn = gtm_db::withdraw_ticket_request(&pool, request_id, user.id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if withdrawn {
        Ok(Json(json!({ "status": "ok" })))
    } else {
        Err((StatusCode::NOT_FOUND, "Request not found or not pending".to_string()))
    }
}

// --- Member: My Games ---

async fn api_my_games(
    auth_user: AuthUser,
    State(pool): State<AnyPool>,
) -> Result<Json<Vec<gtm_models::GameTicketDetail>>, (StatusCode, String)> {
    let user = resolve_user(&auth_user, &pool).await?;
    gtm_db::list_tickets_for_user(&pool, user.id)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn api_my_games_release(
    auth_user: AuthUser,
    State(pool): State<AnyPool>,
    Path(game_pk): Path<i64>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let user = resolve_user(&auth_user, &pool).await?;
    let count = gtm_db::release_tickets_for_game(&pool, game_pk, user.id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(json!({ "status": "ok", "released": count })))
}

// --- Admin: Allocation ---

#[derive(Serialize)]
struct AllocationSummaryRow {
    game_pk: i64,
    official_date: String,
    away_team_name: String,
    total_seats: i64,
    assigned: i64,
    available: i64,
    total_requested: i64,
    oversubscribed: bool,
}

async fn api_admin_allocation(
    auth_user: AuthUser,
    State(pool): State<AnyPool>,
) -> Result<Json<Vec<AllocationSummaryRow>>, (StatusCode, String)> {
    let _user = resolve_user(&auth_user, &pool).await?;
    require_admin(&auth_user)?;

    let summary = gtm_db::allocation_summary(&pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let games = gtm_db::list_games(&pool, None)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let game_map: std::collections::HashMap<i64, &gtm_models::Game> =
        games.iter().map(|g| (g.game_pk, g)).collect();

    let rows: Vec<AllocationSummaryRow> = summary
        .into_iter()
        .filter_map(|(game_pk, total_seats, assigned, available, total_requested)| {
            let g = game_map.get(&game_pk)?;
            Some(AllocationSummaryRow {
                game_pk,
                official_date: g.official_date.clone(),
                away_team_name: g.away_team_name.clone(),
                total_seats,
                assigned,
                available,
                total_requested,
                oversubscribed: total_requested > available,
            })
        })
        .collect();

    Ok(Json(rows))
}

#[derive(Serialize)]
struct GameAllocationDetail {
    game: gtm_models::Game,
    tickets: Vec<GameTicketWithUser>,
    requests: Vec<RequestWithUser>,
}

#[derive(Serialize)]
struct GameTicketWithUser {
    id: i64,
    seat_id: i64,
    section: String,
    row: String,
    seat: String,
    status: String,
    assigned_to: Option<i64>,
    assigned_user_name: Option<String>,
}

#[derive(Serialize)]
struct RequestWithUser {
    id: i64,
    user_id: i64,
    user_name: String,
    seats_requested: i64,
    seats_approved: i64,
    status: String,
    notes: Option<String>,
}

async fn api_admin_allocation_game(
    auth_user: AuthUser,
    State(pool): State<AnyPool>,
    Path(game_pk): Path<i64>,
) -> Result<Json<GameAllocationDetail>, (StatusCode, String)> {
    let _user = resolve_user(&auth_user, &pool).await?;
    require_admin(&auth_user)?;

    let game = gtm_db::get_game(&pool, game_pk)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Game not found".to_string()))?;

    let tickets = gtm_db::list_tickets_for_game(&pool, game_pk)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let requests = gtm_db::list_requests_for_game(&pool, game_pk)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let users = gtm_db::list_users(&pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let user_map: std::collections::HashMap<i64, &gtm_models::User> =
        users.iter().map(|u| (u.id, u)).collect();

    let tickets_with_user: Vec<GameTicketWithUser> = tickets
        .into_iter()
        .map(|t| GameTicketWithUser {
            id: t.id,
            seat_id: t.seat_id,
            section: t.section,
            row: t.row,
            seat: t.seat,
            status: t.status,
            assigned_to: t.assigned_to,
            assigned_user_name: t.assigned_to.and_then(|uid| user_map.get(&uid).map(|u| u.name.clone())),
        })
        .collect();

    let requests_with_user: Vec<RequestWithUser> = requests
        .into_iter()
        .map(|r| RequestWithUser {
            id: r.id,
            user_id: r.user_id,
            user_name: user_map.get(&r.user_id).map(|u| u.name.clone()).unwrap_or_default(),
            seats_requested: r.seats_requested,
            seats_approved: r.seats_approved,
            status: r.status,
            notes: r.notes,
        })
        .collect();

    Ok(Json(GameAllocationDetail {
        game,
        tickets: tickets_with_user,
        requests: requests_with_user,
    }))
}

#[derive(Deserialize)]
struct AllocateBody {
    game_ticket_id: i64,
    user_id: i64,
    request_id: Option<i64>,
}

#[derive(Deserialize)]
struct AllocateBatchBody {
    assignments: Vec<AllocateBody>,
}

async fn api_admin_allocate(
    auth_user: AuthUser,
    State(pool): State<AnyPool>,
    Json(body): Json<AllocateBatchBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let _user = resolve_user(&auth_user, &pool).await?;
    require_admin(&auth_user)?;

    let mut assigned_count = 0u64;
    // Track seats approved per request so we can update them
    let mut request_approvals: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();

    for a in &body.assignments {
        let ok = gtm_db::assign_ticket(&pool, a.game_ticket_id, a.user_id)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        if ok {
            assigned_count += 1;
            if let Some(rid) = a.request_id {
                *request_approvals.entry(rid).or_insert(0) += 1;
            }
        }
    }

    // Update request approval counts
    for (request_id, seats) in &request_approvals {
        gtm_db::update_request_approval(&pool, *request_id, *seats, "approved")
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    Ok(Json(json!({ "status": "ok", "assigned": assigned_count })))
}

async fn api_admin_revoke(
    auth_user: AuthUser,
    State(pool): State<AnyPool>,
    Path(game_ticket_id): Path<i64>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let _user = resolve_user(&auth_user, &pool).await?;
    require_admin(&auth_user)?;

    let ok = gtm_db::revoke_ticket(&pool, game_ticket_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if ok {
        Ok(Json(json!({ "status": "ok" })))
    } else {
        Err((StatusCode::NOT_FOUND, "Ticket not found or not assigned".to_string()))
    }
}

async fn api_admin_allocation_by_user(
    auth_user: AuthUser,
    State(pool): State<AnyPool>,
    Path(target_user_id): Path<i64>,
) -> Result<Json<Vec<gtm_models::GameTicketDetail>>, (StatusCode, String)> {
    let _user = resolve_user(&auth_user, &pool).await?;
    require_admin(&auth_user)?;

    gtm_db::list_tickets_for_user(&pool, target_user_id)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn api_admin_requests(
    auth_user: AuthUser,
    State(pool): State<AnyPool>,
) -> Result<Json<Vec<gtm_models::TicketRequest>>, (StatusCode, String)> {
    let _user = resolve_user(&auth_user, &pool).await?;
    require_admin(&auth_user)?;

    gtm_db::list_all_pending_requests(&pool)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn run_server(port: u16, pool: AnyPool, auth_domain: &str, auth_audience: &str) -> anyhow::Result<()> {
    info!("GTM v{}", version_string());

    // Fetch JWKS from Auth0 at startup
    let jwks_keys = fetch_jwks(auth_domain).await?;
    let auth_config = Arc::new(AuthConfig {
        jwks_keys,
        audience: auth_audience.to_string(),
        issuer: format!("https://{auth_domain}/"),
    });

    let state = AppState {
        pool,
        auth: auth_config,
    };

    let cors = CorsLayer::permissive();

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
        .route("/tickets/summary", get(api_ticket_summary))
        .route("/users/me", get(api_get_me))
        .route("/users", get(api_list_users))
        .route("/admin/scrape-schedule", post(api_scrape_schedule))
        // Member: ticket requests
        .route("/my/requests", get(api_my_requests_list).post(api_my_requests_create))
        .route("/my/requests/{id}", patch(api_my_requests_update).delete(api_my_requests_withdraw))
        // Member: my games (allocated tickets)
        .route("/my/games", get(api_my_games))
        .route("/my/games/{game_pk}/release", post(api_my_games_release))
        // Admin: allocation
        .route("/admin/allocation", get(api_admin_allocation))
        .route("/admin/allocation/{game_pk}", get(api_admin_allocation_game))
        .route("/admin/allocate", post(api_admin_allocate))
        .route("/admin/allocate/{id}", delete(api_admin_revoke))
        .route("/admin/allocation/by-user/{user_id}", get(api_admin_allocation_by_user))
        .route("/admin/requests", get(api_admin_requests));

    let app = Router::new()
        .nest("/api", api_routes)
        .fallback_service(ServeDir::new("frontend/dist").fallback(tower_http::services::ServeFile::new("frontend/dist/index.html")))
        .layer(cors)
        .with_state(state);

    let addr = format!("0.0.0.0:{port}");
    info!("Listening on http://{addr}");

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

// --- DB helper ---

async fn connect_db(config: &gtm_config::Config) -> anyhow::Result<AnyPool> {
    let pool = gtm_db::connect(&config.db_url).await?;
    gtm_db::migrate(&pool, &config.db_url).await?;
    Ok(pool)
}

// --- Main ---

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    // Load config: defaults → file → env
    let mut config = gtm_config::Config::load();

    // Layer 4: CLI args (highest precedence)
    if let Some(ref level) = cli.log_level {
        config.log_level = level.to_string();
    }
    if cli.utc {
        config.utc = true;
    }
    if let Some(ref url) = cli.db_url {
        config.db_url = url.clone();
    }
    if let Commands::Serve { port: Some(p) } = &cli.command {
        config.port = *p;
    }

    init_logging(&config);

    // Connect to DB for commands that need it (CLI always uses direct DB)
    let needs_db = !matches!(cli.command, Commands::Hello);
    let pool = if needs_db {
        Some(connect_db(&config).await?)
    } else {
        None
    };

    match cli.command {
        Commands::Hello => {
            println!("Hello, Giants! 🏟️");
        }
        Commands::Serve { .. } => {
            run_server(config.port, pool.unwrap(), &config.auth0_domain, &config.auth0_audience).await?;
        }
        Commands::ScrapeSchedule { season } => {
            let db = pool.as_ref().unwrap();
            let data = gtm_scraper::fetch_schedule(season).await?;
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
                        g.game_pk, g.official_date, time_display, home_away, opponent,
                        g.status_detailed, g.venue_name, promo_display,
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
                        g.game_pk, g.official_date, g.away_team_name,
                        available, tickets.len(), detail.join(", "),
                    );
                }
                println!("\n{} home game(s), {} seat(s)", home_games.len(), seats.len());
            }
        }
    }

    Ok(())
}
