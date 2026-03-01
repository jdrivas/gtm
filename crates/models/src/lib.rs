use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Game {
    pub game_pk: i64,
    pub game_guid: Option<String>,
    pub game_type: String,
    pub season: String,
    pub game_date: String,
    pub official_date: String,
    pub status_abstract: String,
    pub status_detailed: String,
    pub status_code: String,
    pub start_time_tbd: bool,
    pub away_team_id: i64,
    pub away_team_name: String,
    pub away_score: Option<i64>,
    pub away_is_winner: Option<bool>,
    pub home_team_id: i64,
    pub home_team_name: String,
    pub home_score: Option<i64>,
    pub home_is_winner: Option<bool>,
    pub venue_id: i64,
    pub venue_name: String,
    pub day_night: Option<String>,
    pub series_description: Option<String>,
    pub series_game_number: Option<i64>,
    pub games_in_series: Option<i64>,
    pub double_header: String,
    pub game_number: i64,
    pub scheduled_innings: i64,
    pub is_tie: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Promotion {
    pub offer_id: i64,
    pub game_pk: i64,
    pub name: String,
    pub offer_type: Option<String>,
    pub description: Option<String>,
    pub distribution: Option<String>,
    pub presented_by: Option<String>,
    pub alt_page_url: Option<String>,
    pub ticket_link: Option<String>,
    pub thumbnail_url: Option<String>,
    pub image_url: Option<String>,
    pub display_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Seat {
    pub id: i64,
    pub section: String,
    pub row: String,
    pub seat: String,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct GameTicket {
    pub id: i64,
    pub game_pk: i64,
    pub seat_id: i64,
    pub status: String,
    pub notes: Option<String>,
    pub assigned_to: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: i64,
    pub auth0_sub: String,
    pub email: String,
    pub name: String,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct GameTicketDetail {
    pub id: i64,
    pub game_pk: i64,
    pub seat_id: i64,
    pub section: String,
    pub row: String,
    pub seat: String,
    pub status: String,
    pub notes: Option<String>,
    pub assigned_to: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct TicketRequest {
    pub id: i64,
    pub user_id: i64,
    pub game_pk: i64,
    pub seats_requested: i64,
    pub seats_approved: i64,
    pub status: String,
    pub notes: Option<String>,
}
