# Database Schema Reference

All tables, columns, and their corresponding Rust model structs in `crates/models/src/lib.rs`. Most tables also have `created_at` and `updated_at` timestamp columns that are not mapped into Rust structs.

## 1. `games` → `Game`

| Column | Rust Type | Notes |
|---|---|---|
| game_pk | `i64` | PK (from MLB API) |
| game_guid | `Option<String>` | |
| game_type | `String` | |
| season | `String` | |
| game_date | `String` | |
| official_date | `String` | |
| status_abstract | `String` | |
| status_detailed | `String` | |
| status_code | `String` | |
| start_time_tbd | `i64` | bool in JSON via `bool_as_i64` |
| away_team_id | `i64` | |
| away_team_name | `String` | |
| away_score | `Option<i64>` | |
| away_is_winner | `Option<i64>` | bool in JSON via `option_bool_as_i64` |
| home_team_id | `i64` | |
| home_team_name | `String` | |
| home_score | `Option<i64>` | |
| home_is_winner | `Option<i64>` | bool in JSON via `option_bool_as_i64` |
| venue_id | `i64` | |
| venue_name | `String` | |
| day_night | `Option<String>` | |
| series_description | `Option<String>` | |
| series_game_number | `Option<i64>` | |
| games_in_series | `Option<i64>` | |
| double_header | `String` | |
| game_number | `i64` | |
| scheduled_innings | `i64` | |
| is_tie | `i64` | bool in JSON via `bool_as_i64` |

## 2. `promotions` → `Promotion`

| Column | Rust Type | Notes |
|---|---|---|
| offer_id | `i64` | PK |
| game_pk | `i64` | FK → games |
| name | `String` | |
| offer_type | `Option<String>` | |
| description | `Option<String>` | |
| distribution | `Option<String>` | |
| presented_by | `Option<String>` | |
| alt_page_url | `Option<String>` | |
| ticket_link | `Option<String>` | |
| thumbnail_url | `Option<String>` | |
| image_url | `Option<String>` | |
| display_order | `i64` | |

## 3. `seats` → `Seat`

| Column | Rust Type | Notes |
|---|---|---|
| id | `i64` | PK (serial) |
| section | `String` | UNIQUE(section, row, seat) |
| row | `String` | |
| seat | `String` | |
| notes | `Option<String>` | |

## 4. `game_tickets` → `GameTicket`

| Column | Rust Type | Notes |
|---|---|---|
| id | `i64` | PK (serial) |
| game_pk | `i64` | FK → games |
| seat_id | `i64` | FK → seats, UNIQUE(game_pk, seat_id) |
| status | `String` | `available` or `assigned` |
| notes | `Option<String>` | |
| assigned_to | `Option<i64>` | FK → users (nullable) |

**`GameTicketDetail`** is a query projection (JOIN with `seats`), not a separate table. It adds `section`, `row`, `seat` fields from the `seats` table.

## 5. `users` → `User`

| Column | Rust Type | Notes |
|---|---|---|
| id | `i64` | PK (serial) |
| auth0_sub | `String` | UNIQUE |
| email | `String` | |
| name | `String` | |

Roles are **not stored** in the database — they come from the JWT access token (see `docs/auth.md`).

## 6. `ticket_requests` → `TicketRequest`

| Column | Rust Type | Notes |
|---|---|---|
| id | `i64` | PK (serial) |
| user_id | `i64` | FK → users, UNIQUE(user_id, game_pk) |
| game_pk | `i64` | FK → games |
| seats_requested | `i64` | |
| seats_approved | `i64` | default 0 |
| status | `String` | `pending`, `approved`, or `withdrawn` |
| notes | `Option<String>` | |

### Status lifecycle

| Status | Set By | When | DB Function |
|---|---|---|---|
| `pending` | DB default | Row created via INSERT | `create_ticket_request()` |
| `pending` | System | Re-request of a previously withdrawn game (ON CONFLICT upsert) | `create_ticket_request()` |
| `approved` | Admin | Admin assigns tickets via POST /api/admin/allocate | `update_request_approval()` |
| `withdrawn` | User | User withdraws a pending request via DELETE /api/my/requests/{id} | `withdraw_ticket_request()` |
| `withdrawn` | User | User releases allocated tickets via POST /api/my/games/{game_pk}/release | `release_tickets_for_game()` |

**Notes:**
- Only `pending` requests can be edited (seat count) or directly withdrawn.
- The release flow is the only path that can withdraw an `approved` request.
- `declined` is rendered in the frontend but never set by the backend (dead branch).

## 7. `user_game_tags` → `GameTag`

| Column | Rust Type | Notes |
|---|---|---|
| user_id | `i64` | FK → users, PK(user_id, game_pk) |
| game_pk | `i64` | FK → games |
| shortlist | `i64` | bool in JSON via `bool_as_i64` |
| cant_go | `i64` | bool in JSON via `bool_as_i64` |
