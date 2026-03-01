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

export interface Seat {
  id: number;
  section: string;
  row: string;
  seat: string;
  notes: string | null;
}

export interface TicketSummary {
  game_pk: number;
  total: number;
  available: number;
}

export interface GameTicketDetail {
  id: number;
  game_pk: number;
  seat_id: number;
  section: string;
  row: string;
  seat: string;
  status: string;
  notes: string | null;
  assigned_to: number | null;
}

export interface TicketRequest {
  id: number;
  user_id: number;
  game_pk: number;
  seats_requested: number;
  seats_approved: number;
  status: string;
  notes: string | null;
}

export interface AllocationSummaryRow {
  game_pk: number;
  official_date: string;
  away_team_name: string;
  total_seats: number;
  assigned: number;
  available: number;
  total_requested: number;
  oversubscribed: boolean;
}

export interface GameTicketWithUser {
  id: number;
  seat_id: number;
  section: string;
  row: string;
  seat: string;
  status: string;
  assigned_to: number | null;
  assigned_user_name: string | null;
}

export interface RequestWithUser {
  id: number;
  user_id: number;
  user_name: string;
  seats_requested: number;
  seats_approved: number;
  status: string;
  notes: string | null;
}

export interface GameAllocationDetail {
  game: Game;
  tickets: GameTicketWithUser[];
  requests: RequestWithUser[];
}

export interface User {
  id: number;
  auth0_sub: string;
  email: string;
  name: string;
  role: string;
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
