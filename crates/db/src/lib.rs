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

pub async fn list_games(pool: &SqlitePool, month: Option<u32>) -> Result<Vec<Game>> {
    let games = match month {
        Some(m) => {
            let pattern = format!("%-{:02}-%", m);
            sqlx::query_as::<_, Game>(
                "SELECT id, date, time, opponent, home_away, venue, result FROM games WHERE date LIKE ? ORDER BY date",
            )
            .bind(pattern)
            .fetch_all(pool)
            .await?
        }
        None => {
            sqlx::query_as::<_, Game>(
                "SELECT id, date, time, opponent, home_away, venue, result FROM games ORDER BY date",
            )
            .fetch_all(pool)
            .await?
        }
    };
    Ok(games)
}

pub async fn get_game(pool: &SqlitePool, id: i64) -> Result<Option<Game>> {
    let game = sqlx::query_as::<_, Game>(
        "SELECT id, date, time, opponent, home_away, venue, result FROM games WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    Ok(game)
}

pub async fn insert_game(
    pool: &SqlitePool,
    date: &str,
    time: Option<&str>,
    opponent: &str,
    home_away: &str,
    venue: &str,
) -> Result<Game> {
    let row = sqlx::query_as::<_, Game>(
        "INSERT INTO games (date, time, opponent, home_away, venue) VALUES (?, ?, ?, ?, ?) RETURNING id, date, time, opponent, home_away, venue, result",
    )
    .bind(date)
    .bind(time)
    .bind(opponent)
    .bind(home_away)
    .bind(venue)
    .fetch_one(pool)
    .await?;
    Ok(row)
}
