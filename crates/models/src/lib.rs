use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Game {
    pub id: i64,
    pub date: String,
    pub time: Option<String>,
    pub opponent: String,
    pub home_away: String,
    pub venue: String,
    pub result: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ticket {
    pub id: i64,
    pub game_id: i64,
    pub section: String,
    pub row: String,
    pub seat: String,
    pub cost: f64,
    pub status: String,
    pub holder_notes: Option<String>,
}
