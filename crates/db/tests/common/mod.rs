use gtm_models::Game;
use sqlx::AnyPool;

/// Create a fresh in-memory SQLite pool with all migrations applied.
/// Uses max_connections(1) so all operations share the single in-memory database.
pub async fn test_pool() -> AnyPool {
    sqlx::any::install_default_drivers();
    let pool = sqlx::any::AnyPoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    gtm_db::migrate(&pool, "sqlite::memory:").await.unwrap();
    pool
}

/// Build a minimal Game struct suitable for testing.
pub fn sample_game(game_pk: i64) -> Game {
    Game {
        game_pk,
        game_guid: Some(format!("guid-{game_pk}")),
        game_type: "R".to_string(),
        season: "2026".to_string(),
        game_date: "2026-04-01T19:15:00Z".to_string(),
        official_date: "2026-04-01".to_string(),
        status_abstract: "Preview".to_string(),
        status_detailed: "Scheduled".to_string(),
        status_code: "S".to_string(),
        start_time_tbd: 0,
        away_team_id: 109,
        away_team_name: "Arizona Diamondbacks".to_string(),
        away_score: None,
        away_is_winner: None,
        home_team_id: 137,
        home_team_name: "San Francisco Giants".to_string(),
        home_score: None,
        home_is_winner: None,
        venue_id: 2395,
        venue_name: "Oracle Park".to_string(),
        day_night: Some("night".to_string()),
        series_description: Some("Regular Season".to_string()),
        series_game_number: Some(1),
        games_in_series: Some(3),
        double_header: "N".to_string(),
        game_number: 1,
        scheduled_innings: 9,
        is_tie: 0,
    }
}
