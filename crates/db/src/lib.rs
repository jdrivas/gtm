use anyhow::Result;
use gtm_models::Game;
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
    venue_id, venue_name, day_night, description, series_description, \
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

pub async fn upsert_game(pool: &SqlitePool, game: &Game) -> Result<()> {
    sqlx::query(
        "INSERT INTO games (game_pk, game_guid, game_type, season, game_date, official_date, \
            status_abstract, status_detailed, status_code, start_time_tbd, \
            away_team_id, away_team_name, away_score, away_is_winner, \
            home_team_id, home_team_name, home_score, home_is_winner, \
            venue_id, venue_name, day_night, description, series_description, \
            series_game_number, games_in_series, double_header, game_number, \
            scheduled_innings, is_tie) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
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
            description = excluded.description, \
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
    .bind(&game.description)
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
