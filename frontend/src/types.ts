export interface Game {
  game_pk: number;
  game_guid: string | null;
  game_type: string;
  season: string;
  game_date: string;
  official_date: string;
  status_abstract: string;
  status_detailed: string;
  status_code: string;
  start_time_tbd: boolean;
  away_team_id: number;
  away_team_name: string;
  away_score: number | null;
  away_is_winner: boolean | null;
  home_team_id: number;
  home_team_name: string;
  home_score: number | null;
  home_is_winner: boolean | null;
  venue_id: number;
  venue_name: string;
  day_night: string | null;
  series_description: string | null;
  series_game_number: number | null;
  games_in_series: number | null;
  double_header: string;
  game_number: number;
  scheduled_innings: number;
  is_tie: boolean;
}

export interface Promotion {
  offer_id: number;
  game_pk: number;
  name: string;
  offer_type: string | null;
  description: string | null;
  distribution: string | null;
  presented_by: string | null;
  alt_page_url: string | null;
  ticket_link: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  display_order: number;
}
