use anyhow::Result;
use gtm_models::{Game, Promotion};
use sqlx::SqlitePool;
use tracing::info;

pub async fn connect(database_url: &str) -> Result<SqlitePool> {
    let pool = SqlitePool::connect(database_url).await?;
    info!("Connected to database: {database_url}");
    Ok(pool)
}

pub async fn migrate(pool: &SqlitePool) -> Result<()> {
    sqlx::migrate!("../../migrations").run(pool).await?;
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

pub async fn list_games(pool: &SqlitePool, month: Option<u32>) -> Result<Vec<Game>> {
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

pub async fn get_game(pool: &SqlitePool, game_pk: i64) -> Result<Option<Game>> {
    let sql = format!("SELECT {GAME_COLUMNS} FROM games WHERE game_pk = ?");
    let game = sqlx::query_as::<_, Game>(&sql)
        .bind(game_pk)
        .fetch_optional(pool)
        .await?;
    Ok(game)
}

pub async fn get_promotions_for_game(pool: &SqlitePool, game_pk: i64) -> Result<Vec<Promotion>> {
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

pub async fn upsert_promotion(pool: &SqlitePool, promo: &Promotion) -> Result<()> {
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
            updated_at = datetime('now')",
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

pub async fn upsert_game(pool: &SqlitePool, game: &Game) -> Result<()> {
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
            updated_at = datetime('now')",
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
