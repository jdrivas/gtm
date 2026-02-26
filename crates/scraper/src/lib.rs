use anyhow::Result;
use gtm_models::{Game, Promotion};
use serde::Deserialize;
use tracing::info;

const GIANTS_TEAM_ID: u32 = 137;
const MLB_SCHEDULE_URL: &str = "https://statsapi.mlb.com/api/v1/schedule";

// --- MLB Stats API response types ---

#[derive(Deserialize)]
struct ScheduleResponse {
    dates: Vec<DateEntry>,
}

#[derive(Deserialize)]
struct DateEntry {
    games: Vec<ApiGame>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiGame {
    game_pk: i64,
    game_guid: Option<String>,
    game_type: String,
    season: String,
    game_date: String,
    official_date: String,
    status: GameStatus,
    teams: Teams,
    venue: Venue,
    is_tie: Option<bool>,
    game_number: Option<i64>,
    double_header: Option<String>,
    day_night: Option<String>,
    scheduled_innings: Option<i64>,
    games_in_series: Option<i64>,
    series_game_number: Option<i64>,
    series_description: Option<String>,
    #[serde(default)]
    promotions: Vec<ApiPromotion>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiPromotion {
    offer_id: i64,
    name: String,
    offer_type: Option<String>,
    description: Option<String>,
    distribution: Option<String>,
    presented_by: Option<String>,
    alt_page_url: Option<String>,
    tlink: Option<String>,
    thumbnail_url: Option<String>,
    image_url: Option<String>,
    #[serde(default)]
    order: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GameStatus {
    abstract_game_state: String,
    detailed_state: String,
    status_code: String,
    start_time_tbd: Option<bool>,
}

#[derive(Deserialize)]
struct Teams {
    away: TeamSide,
    home: TeamSide,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TeamSide {
    team: TeamInfo,
    score: Option<i64>,
    is_winner: Option<bool>,
}

#[derive(Deserialize)]
struct TeamInfo {
    id: i64,
    name: String,
}

#[derive(Deserialize)]
struct Venue {
    id: i64,
    name: String,
}

// --- Conversion ---

impl From<ApiGame> for Game {
    fn from(g: ApiGame) -> Self {
        Game {
            game_pk: g.game_pk,
            game_guid: g.game_guid,
            game_type: g.game_type,
            season: g.season,
            game_date: g.game_date,
            official_date: g.official_date,
            status_abstract: g.status.abstract_game_state,
            status_detailed: g.status.detailed_state,
            status_code: g.status.status_code,
            start_time_tbd: g.status.start_time_tbd.unwrap_or(false),
            away_team_id: g.teams.away.team.id,
            away_team_name: g.teams.away.team.name,
            away_score: g.teams.away.score,
            away_is_winner: g.teams.away.is_winner,
            home_team_id: g.teams.home.team.id,
            home_team_name: g.teams.home.team.name,
            home_score: g.teams.home.score,
            home_is_winner: g.teams.home.is_winner,
            venue_id: g.venue.id,
            venue_name: g.venue.name,
            day_night: g.day_night,
            series_description: g.series_description,
            series_game_number: g.series_game_number,
            games_in_series: g.games_in_series,
            double_header: g.double_header.unwrap_or_else(|| "N".to_string()),
            game_number: g.game_number.unwrap_or(1),
            scheduled_innings: g.scheduled_innings.unwrap_or(9),
            is_tie: g.is_tie.unwrap_or(false),
        }
    }
}

fn convert_promotions(game_pk: i64, api_promos: Vec<ApiPromotion>) -> Vec<Promotion> {
    api_promos
        .into_iter()
        .map(|p| Promotion {
            offer_id: p.offer_id,
            game_pk,
            name: p.name,
            offer_type: p.offer_type,
            description: p.description,
            distribution: p.distribution,
            presented_by: p.presented_by,
            alt_page_url: p.alt_page_url,
            ticket_link: p.tlink,
            thumbnail_url: p.thumbnail_url,
            image_url: p.image_url,
            display_order: p.order,
        })
        .collect()
}

// --- Public API ---

pub struct ScheduleData {
    pub games: Vec<Game>,
    pub promotions: Vec<Promotion>,
}

pub async fn fetch_schedule(season: u32) -> Result<ScheduleData> {
    info!("Fetching {season} Giants schedule from MLB Stats API\u{2026}");

    let url = format!(
        "{MLB_SCHEDULE_URL}?teamId={GIANTS_TEAM_ID}&season={season}&sportId=1&gameType=R&hydrate=game(promotions)"
    );

    let resp: ScheduleResponse = reqwest::get(&url).await?.json().await?;

    let mut games = Vec::new();
    let mut promotions = Vec::new();

    for date_entry in resp.dates {
        for mut api_game in date_entry.games {
            let game_pk = api_game.game_pk;
            let promos = std::mem::take(&mut api_game.promotions);
            promotions.extend(convert_promotions(game_pk, promos));
            games.push(Game::from(api_game));
        }
    }

    info!("Fetched {} games, {} promotions for {season} season", games.len(), promotions.len());
    Ok(ScheduleData { games, promotions })
}
