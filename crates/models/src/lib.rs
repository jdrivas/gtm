use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// Serde helper: store as i64 in DB (for SQLx Any compatibility) but
/// serialize/deserialize as boolean in JSON.
mod bool_as_i64 {
    use serde::{Deserializer, Serializer};

    pub fn serialize<S>(value: &i64, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_bool(*value != 0)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<i64, D::Error>
    where
        D: Deserializer<'de>,
    {
        use serde::de;
        struct BoolOrIntVisitor;
        impl<'de> de::Visitor<'de> for BoolOrIntVisitor {
            type Value = i64;
            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("a boolean or integer")
            }
            fn visit_bool<E: de::Error>(self, v: bool) -> Result<i64, E> {
                Ok(if v { 1 } else { 0 })
            }
            fn visit_i64<E: de::Error>(self, v: i64) -> Result<i64, E> {
                Ok(v)
            }
            fn visit_u64<E: de::Error>(self, v: u64) -> Result<i64, E> {
                Ok(v as i64)
            }
        }
        deserializer.deserialize_any(BoolOrIntVisitor)
    }
}

/// Serde helper: Option<i64> ↔ Option<bool> in JSON.
mod option_bool_as_i64 {
    use serde::{Deserializer, Serializer};

    pub fn serialize<S>(value: &Option<i64>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match value {
            Some(v) => serializer.serialize_bool(*v != 0),
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<i64>, D::Error>
    where
        D: Deserializer<'de>,
    {
        use serde::de;
        struct OptionBoolOrIntVisitor;
        impl<'de> de::Visitor<'de> for OptionBoolOrIntVisitor {
            type Value = Option<i64>;
            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("null, a boolean, or integer")
            }
            fn visit_none<E: de::Error>(self) -> Result<Option<i64>, E> {
                Ok(None)
            }
            fn visit_unit<E: de::Error>(self) -> Result<Option<i64>, E> {
                Ok(None)
            }
            fn visit_bool<E: de::Error>(self, v: bool) -> Result<Option<i64>, E> {
                Ok(Some(if v { 1 } else { 0 }))
            }
            fn visit_i64<E: de::Error>(self, v: i64) -> Result<Option<i64>, E> {
                Ok(Some(v))
            }
            fn visit_u64<E: de::Error>(self, v: u64) -> Result<Option<i64>, E> {
                Ok(Some(v as i64))
            }
        }
        deserializer.deserialize_any(OptionBoolOrIntVisitor)
    }
}

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
    #[serde(with = "bool_as_i64")]
    pub start_time_tbd: i64,
    pub away_team_id: i64,
    pub away_team_name: String,
    pub away_score: Option<i64>,
    #[serde(with = "option_bool_as_i64")]
    pub away_is_winner: Option<i64>,
    pub home_team_id: i64,
    pub home_team_name: String,
    pub home_score: Option<i64>,
    #[serde(with = "option_bool_as_i64")]
    pub home_is_winner: Option<i64>,
    pub venue_id: i64,
    pub venue_name: String,
    pub day_night: Option<String>,
    pub series_description: Option<String>,
    pub series_game_number: Option<i64>,
    pub games_in_series: Option<i64>,
    pub double_header: String,
    pub game_number: i64,
    pub scheduled_innings: i64,
    #[serde(with = "bool_as_i64")]
    pub is_tie: i64,
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
