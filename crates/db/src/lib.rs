use anyhow::Result;
use gtm_models::{Game, GameTicketDetail, Promotion, Seat, TicketRequest, User};
use sqlx::AnyPool;
use tracing::info;

static PG_MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../../migrations");
static SQLITE_MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../../migrations-sqlite");

pub async fn connect(database_url: &str) -> Result<AnyPool> {
    sqlx::any::install_default_drivers();
    let pool = AnyPool::connect(database_url).await?;
    info!("Connected to database: {database_url}");
    Ok(pool)
}

pub async fn migrate(pool: &AnyPool, database_url: &str) -> Result<()> {
    if database_url.starts_with("sqlite:") {
        SQLITE_MIGRATOR.run(pool).await?;
    } else {
        PG_MIGRATOR.run(pool).await?;
    }
    info!("Migrations applied");
    Ok(())
}

const GAME_COLUMNS: &str = "game_pk, game_guid, game_type, season, game_date, official_date, \
    status_abstract, status_detailed, status_code, start_time_tbd, \
    away_team_id, away_team_name, away_score, away_is_winner, \
    home_team_id, home_team_name, home_score, home_is_winner, \
    venue_id, venue_name, day_night, series_description, \
    series_game_number, games_in_series, double_header, game_number, \
    scheduled_innings, is_tie";

pub async fn list_games(pool: &AnyPool, month: Option<u32>) -> Result<Vec<Game>> {
    let games = match month {
        Some(m) => {
            let pattern = format!("%-{:02}-%", m);
            let sql = format!("SELECT {GAME_COLUMNS} FROM games WHERE official_date LIKE ? ORDER BY game_date");
            sqlx::query_as::<_, Game>(&sql)
                .bind(pattern)
                .fetch_all(pool)
                .await?
        }
        None => {
            let sql = format!("SELECT {GAME_COLUMNS} FROM games ORDER BY game_date");
            sqlx::query_as::<_, Game>(&sql)
                .fetch_all(pool)
                .await?
        }
    };
    Ok(games)
}

pub async fn get_game(pool: &AnyPool, game_pk: i64) -> Result<Option<Game>> {
    let sql = format!("SELECT {GAME_COLUMNS} FROM games WHERE game_pk = ?");
    let game = sqlx::query_as::<_, Game>(&sql)
        .bind(game_pk)
        .fetch_optional(pool)
        .await?;
    Ok(game)
}

pub async fn get_promotions_for_game(pool: &AnyPool, game_pk: i64) -> Result<Vec<Promotion>> {
    let promos = sqlx::query_as::<_, Promotion>(
        "SELECT offer_id, game_pk, name, offer_type, description, distribution, \
            presented_by, alt_page_url, ticket_link, thumbnail_url, image_url, display_order \
         FROM promotions WHERE game_pk = ? ORDER BY display_order",
    )
    .bind(game_pk)
    .fetch_all(pool)
    .await?;
    Ok(promos)
}

pub async fn upsert_promotion(pool: &AnyPool, promo: &Promotion) -> Result<()> {
    sqlx::query(
        "INSERT INTO promotions (offer_id, game_pk, name, offer_type, description, distribution, \
            presented_by, alt_page_url, ticket_link, thumbnail_url, image_url, display_order) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(offer_id, game_pk) DO UPDATE SET \
            name = excluded.name, \
            offer_type = excluded.offer_type, \
            description = excluded.description, \
            distribution = excluded.distribution, \
            presented_by = excluded.presented_by, \
            alt_page_url = excluded.alt_page_url, \
            ticket_link = excluded.ticket_link, \
            thumbnail_url = excluded.thumbnail_url, \
            image_url = excluded.image_url, \
            display_order = excluded.display_order, \
            updated_at = CURRENT_TIMESTAMP",
    )
    .bind(promo.offer_id)
    .bind(promo.game_pk)
    .bind(&promo.name)
    .bind(&promo.offer_type)
    .bind(&promo.description)
    .bind(&promo.distribution)
    .bind(&promo.presented_by)
    .bind(&promo.alt_page_url)
    .bind(&promo.ticket_link)
    .bind(&promo.thumbnail_url)
    .bind(&promo.image_url)
    .bind(promo.display_order)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn upsert_game(pool: &AnyPool, game: &Game) -> Result<()> {
    sqlx::query(
        "INSERT INTO games (game_pk, game_guid, game_type, season, game_date, official_date, \
            status_abstract, status_detailed, status_code, start_time_tbd, \
            away_team_id, away_team_name, away_score, away_is_winner, \
            home_team_id, home_team_name, home_score, home_is_winner, \
            venue_id, venue_name, day_night, series_description, \
            series_game_number, games_in_series, double_header, game_number, \
            scheduled_innings, is_tie) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(game_pk) DO UPDATE SET \
            game_guid = excluded.game_guid, \
            game_date = excluded.game_date, \
            status_abstract = excluded.status_abstract, \
            status_detailed = excluded.status_detailed, \
            status_code = excluded.status_code, \
            start_time_tbd = excluded.start_time_tbd, \
            away_score = excluded.away_score, \
            away_is_winner = excluded.away_is_winner, \
            home_score = excluded.home_score, \
            home_is_winner = excluded.home_is_winner, \
            day_night = excluded.day_night, \
            is_tie = excluded.is_tie, \
            updated_at = CURRENT_TIMESTAMP",
    )
    .bind(game.game_pk)
    .bind(&game.game_guid)
    .bind(&game.game_type)
    .bind(&game.season)
    .bind(&game.game_date)
    .bind(&game.official_date)
    .bind(&game.status_abstract)
    .bind(&game.status_detailed)
    .bind(&game.status_code)
    .bind(game.start_time_tbd)
    .bind(game.away_team_id)
    .bind(&game.away_team_name)
    .bind(game.away_score)
    .bind(game.away_is_winner)
    .bind(game.home_team_id)
    .bind(&game.home_team_name)
    .bind(game.home_score)
    .bind(game.home_is_winner)
    .bind(game.venue_id)
    .bind(&game.venue_name)
    .bind(&game.day_night)
    .bind(&game.series_description)
    .bind(game.series_game_number)
    .bind(game.games_in_series)
    .bind(&game.double_header)
    .bind(game.game_number)
    .bind(game.scheduled_innings)
    .bind(game.is_tie)
    .execute(pool)
    .await?;
    Ok(())
}

// --- Seats ---

pub async fn add_seat(pool: &AnyPool, section: &str, row: &str, seat: &str, notes: Option<&str>) -> Result<Seat> {
    let result = sqlx::query_as::<_, Seat>(
        "INSERT INTO seats (section, row, seat, notes) VALUES (?, ?, ?, ?) \
         RETURNING id, section, row, seat, notes",
    )
    .bind(section)
    .bind(row)
    .bind(seat)
    .bind(notes)
    .fetch_one(pool)
    .await?;
    Ok(result)
}

pub async fn list_seats(pool: &AnyPool) -> Result<Vec<Seat>> {
    let seats = sqlx::query_as::<_, Seat>(
        "SELECT id, section, row, seat, notes FROM seats ORDER BY section, row, seat",
    )
    .fetch_all(pool)
    .await?;
    Ok(seats)
}

pub async fn update_seat_group_notes(pool: &AnyPool, section: &str, row: &str, notes: Option<&str>) -> Result<u64> {
    let result = sqlx::query(
        "UPDATE seats SET notes = ?, updated_at = CURRENT_TIMESTAMP WHERE section = ? AND row = ?",
    )
    .bind(notes)
    .bind(section)
    .bind(row)
    .execute(pool)
    .await?;
    Ok(result.rows_affected())
}

pub async fn delete_seat(pool: &AnyPool, seat_id: i64) -> Result<bool> {
    sqlx::query("DELETE FROM game_tickets WHERE seat_id = ?")
        .bind(seat_id)
        .execute(pool)
        .await?;
    let result = sqlx::query("DELETE FROM seats WHERE id = ?")
        .bind(seat_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

// --- Game Tickets ---

const GIANTS_TEAM_NAME: &str = "San Francisco Giants";

pub async fn generate_tickets_for_seat(pool: &AnyPool, seat_id: i64) -> Result<u64> {
    let result = sqlx::query(
        "INSERT INTO game_tickets (game_pk, seat_id, status) \
         SELECT game_pk, ?, 'available' FROM games WHERE home_team_name = ? \
         ON CONFLICT DO NOTHING",
    )
    .bind(seat_id)
    .bind(GIANTS_TEAM_NAME)
    .execute(pool)
    .await?;
    Ok(result.rows_affected())
}

pub async fn generate_tickets_for_all_seats(pool: &AnyPool) -> Result<u64> {
    let result = sqlx::query(
        "INSERT INTO game_tickets (game_pk, seat_id, status) \
         SELECT g.game_pk, s.id, 'available' \
         FROM games g CROSS JOIN seats s \
         WHERE g.home_team_name = ? \
         ON CONFLICT DO NOTHING",
    )
    .bind(GIANTS_TEAM_NAME)
    .execute(pool)
    .await?;
    Ok(result.rows_affected())
}

pub async fn list_tickets_for_game(pool: &AnyPool, game_pk: i64) -> Result<Vec<GameTicketDetail>> {
    let tickets = sqlx::query_as::<_, GameTicketDetail>(
        "SELECT gt.id, gt.game_pk, gt.seat_id, s.section, s.row, s.seat, gt.status, gt.notes, gt.assigned_to \
         FROM game_tickets gt \
         JOIN seats s ON s.id = gt.seat_id \
         WHERE gt.game_pk = ? \
         ORDER BY s.section, s.row, s.seat",
    )
    .bind(game_pk)
    .fetch_all(pool)
    .await?;
    Ok(tickets)
}

pub async fn update_ticket_status(pool: &AnyPool, ticket_id: i64, status: &str, notes: Option<&str>) -> Result<bool> {
    let result = sqlx::query(
        "UPDATE game_tickets SET status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(status)
    .bind(notes)
    .bind(ticket_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn ticket_summary_for_games(pool: &AnyPool) -> Result<Vec<(i64, i64, i64)>> {
    let rows = sqlx::query_as::<_, (i64, i64, i64)>(
        "SELECT game_pk, \
                COUNT(*) as total, \
                SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available \
         FROM game_tickets GROUP BY game_pk",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

// --- Users ---

pub async fn upsert_user(pool: &AnyPool, auth0_sub: &str, email: &str, name: &str, role: &str) -> Result<User> {
    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (auth0_sub, email, name, role) VALUES (?, ?, ?, ?) \
         ON CONFLICT(auth0_sub) DO UPDATE SET \
            email = excluded.email, \
            name = excluded.name, \
            role = excluded.role, \
            updated_at = CURRENT_TIMESTAMP \
         RETURNING id, auth0_sub, email, name, role",
    )
    .bind(auth0_sub)
    .bind(email)
    .bind(name)
    .bind(role)
    .fetch_one(pool)
    .await?;
    Ok(user)
}

pub async fn get_user_by_sub(pool: &AnyPool, auth0_sub: &str) -> Result<Option<User>> {
    let user = sqlx::query_as::<_, User>(
        "SELECT id, auth0_sub, email, name, role FROM users WHERE auth0_sub = ?",
    )
    .bind(auth0_sub)
    .fetch_optional(pool)
    .await?;
    Ok(user)
}

pub async fn list_users(pool: &AnyPool) -> Result<Vec<User>> {
    let users = sqlx::query_as::<_, User>(
        "SELECT id, auth0_sub, email, name, role FROM users ORDER BY name",
    )
    .fetch_all(pool)
    .await?;
    Ok(users)
}

// --- Ticket Requests ---

pub async fn create_ticket_request(
    pool: &AnyPool,
    user_id: i64,
    game_pk: i64,
    seats_requested: i64,
    notes: Option<&str>,
) -> Result<TicketRequest> {
    let req = sqlx::query_as::<_, TicketRequest>(
        "INSERT INTO ticket_requests (user_id, game_pk, seats_requested, notes) \
         VALUES (?, ?, ?, ?) \
         ON CONFLICT(user_id, game_pk) DO UPDATE SET \
            seats_requested = excluded.seats_requested, \
            notes = excluded.notes, \
            status = CASE WHEN ticket_requests.status = 'withdrawn' THEN 'pending' ELSE ticket_requests.status END, \
            updated_at = CURRENT_TIMESTAMP \
         RETURNING id, user_id, game_pk, seats_requested, seats_approved, status, notes",
    )
    .bind(user_id)
    .bind(game_pk)
    .bind(seats_requested)
    .bind(notes)
    .fetch_one(pool)
    .await?;
    Ok(req)
}

pub async fn list_requests_for_user(pool: &AnyPool, user_id: i64) -> Result<Vec<TicketRequest>> {
    let reqs = sqlx::query_as::<_, TicketRequest>(
        "SELECT id, user_id, game_pk, seats_requested, seats_approved, status, notes \
         FROM ticket_requests WHERE user_id = ? ORDER BY game_pk",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(reqs)
}

pub async fn list_requests_for_game(pool: &AnyPool, game_pk: i64) -> Result<Vec<TicketRequest>> {
    let reqs = sqlx::query_as::<_, TicketRequest>(
        "SELECT id, user_id, game_pk, seats_requested, seats_approved, status, notes \
         FROM ticket_requests WHERE game_pk = ? ORDER BY created_at",
    )
    .bind(game_pk)
    .fetch_all(pool)
    .await?;
    Ok(reqs)
}

pub async fn list_all_pending_requests(pool: &AnyPool) -> Result<Vec<TicketRequest>> {
    let reqs = sqlx::query_as::<_, TicketRequest>(
        "SELECT id, user_id, game_pk, seats_requested, seats_approved, status, notes \
         FROM ticket_requests WHERE status = 'pending' ORDER BY game_pk, created_at",
    )
    .fetch_all(pool)
    .await?;
    Ok(reqs)
}

pub async fn update_ticket_request(
    pool: &AnyPool,
    request_id: i64,
    user_id: i64,
    seats_requested: i64,
) -> Result<bool> {
    let result = sqlx::query(
        "UPDATE ticket_requests SET seats_requested = ?, updated_at = CURRENT_TIMESTAMP \
         WHERE id = ? AND user_id = ? AND status = 'pending'",
    )
    .bind(seats_requested)
    .bind(request_id)
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn withdraw_ticket_request(pool: &AnyPool, request_id: i64, user_id: i64) -> Result<bool> {
    let result = sqlx::query(
        "UPDATE ticket_requests SET status = 'withdrawn', updated_at = CURRENT_TIMESTAMP \
         WHERE id = ? AND user_id = ? AND status = 'pending'",
    )
    .bind(request_id)
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

// --- Allocation ---

pub async fn assign_ticket(
    pool: &AnyPool,
    game_ticket_id: i64,
    user_id: i64,
) -> Result<bool> {
    let result = sqlx::query(
        "UPDATE game_tickets SET assigned_to = ?, status = 'assigned', updated_at = CURRENT_TIMESTAMP \
         WHERE id = ? AND status = 'available'",
    )
    .bind(user_id)
    .bind(game_ticket_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn revoke_ticket(pool: &AnyPool, game_ticket_id: i64) -> Result<bool> {
    let result = sqlx::query(
        "UPDATE game_tickets SET assigned_to = NULL, status = 'available', updated_at = CURRENT_TIMESTAMP \
         WHERE id = ? AND status = 'assigned'",
    )
    .bind(game_ticket_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn release_tickets_for_game(
    pool: &AnyPool,
    game_pk: i64,
    user_id: i64,
) -> Result<u64> {
    let result = sqlx::query(
        "UPDATE game_tickets SET assigned_to = NULL, status = 'available', updated_at = CURRENT_TIMESTAMP \
         WHERE game_pk = ? AND assigned_to = ?",
    )
    .bind(game_pk)
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected())
}

pub async fn update_request_approval(
    pool: &AnyPool,
    request_id: i64,
    seats_approved: i64,
    status: &str,
) -> Result<bool> {
    let result = sqlx::query(
        "UPDATE ticket_requests SET seats_approved = seats_approved + ?, status = ?, updated_at = CURRENT_TIMESTAMP \
         WHERE id = ?",
    )
    .bind(seats_approved)
    .bind(status)
    .bind(request_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn list_tickets_for_user(pool: &AnyPool, user_id: i64) -> Result<Vec<GameTicketDetail>> {
    let tickets = sqlx::query_as::<_, GameTicketDetail>(
        "SELECT gt.id, gt.game_pk, gt.seat_id, s.section, s.row, s.seat, gt.status, gt.notes, gt.assigned_to \
         FROM game_tickets gt \
         JOIN seats s ON s.id = gt.seat_id \
         WHERE gt.assigned_to = ? \
         ORDER BY gt.game_pk, s.section, s.row, s.seat",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(tickets)
}

/// Per-game allocation summary: (game_pk, total_seats, assigned, available, total_requested)
pub async fn allocation_summary(pool: &AnyPool) -> Result<Vec<(i64, i64, i64, i64, i64)>> {
    let rows = sqlx::query_as::<_, (i64, i64, i64, i64, i64)>(
        "SELECT \
            g.game_pk, \
            COUNT(gt.id) as total_seats, \
            SUM(CASE WHEN gt.status = 'assigned' THEN 1 ELSE 0 END) as assigned, \
            SUM(CASE WHEN gt.status = 'available' THEN 1 ELSE 0 END) as available, \
            COALESCE(( \
                SELECT SUM(tr.seats_requested) FROM ticket_requests tr \
                WHERE tr.game_pk = g.game_pk AND tr.status = 'pending' \
            ), 0) as total_requested \
         FROM games g \
         JOIN game_tickets gt ON gt.game_pk = g.game_pk \
         WHERE g.home_team_name = ? \
         GROUP BY g.game_pk \
         ORDER BY g.game_date",
    )
    .bind(GIANTS_TEAM_NAME)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}
