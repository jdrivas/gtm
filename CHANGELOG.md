# Changelog

## [v0.3.4] — 2026-04-04

### Added
- Season summary stats in Schedule page filter bar (W/L, played, remaining, shown)
- Win/loss color highlighting on score column (green/red)
- Nightly automatic schedule scrape at 12:15 AM Pacific

### Changed
- Extracted shared `run_scrape()` helper used by CLI, API, and nightly scheduler

## [v0.3.3] — 2026-04-03

### Changed
- Remove redundant `seats_approved` column from `ticket_requests` table (actual ticket assignments are the source of truth)
- Show game time in the Date column of the Request Tickets table

## [v0.3.2] — 2026-03-21

### Fixed
- Releasing tickets now also withdraws the associated request
- Hide withdrawn requests from Requests page and My Tickets page
- Only show Withdraw button for pending requests on My Tickets

## [v0.3.1] — 2026-03-21

### Changed
- Move filter toggles to a separate row below "Request Tickets" title with smaller font and vertical dividers

### Fixed
- Fix race condition: coerce integer tag values to booleans on load to prevent cross-browser sync issues

## [v0.3.0] — 2026-03-21

### Added
- Game triage on Requests page: ★ Shortlist and 🚫 Can't Go tag columns per game
- Shortlist filter toggle to show only shortlisted (non-blocked) games
- Tags persist in database across sessions and devices
- New `user_game_tags` table, API endpoints, and optimistic UI updates

## [v0.2.5] — 2026-03-21

### Added
- My Tickets page showing allocated seats and pending requests with release/withdraw actions
- Role-based navigation: non-admin users see Schedule, Requests, and My Tickets; admins see all

### Fixed
- Seats and Allocation nav links no longer visible to non-admin users

## [v0.2.4] — 2026-03-21

### Fixed
- Auth0 connection name corrected to 'GTM-users' for password reset
- Improved error display with proper toast notifications

## [v0.2.3] — 2026-03-21

### Fixed
- Password reset messages now display as a toast notification instead of overflowing the header
- Auth0 error responses parsed to show human-readable description

## [v0.2.2] — 2026-03-21

### Changed
- Replaced Logout button with hamburger dropdown menu containing Change Password, Logout, and version number
- Version number moved from SF logo popup into the user menu

### Added
- Change Password option sends Auth0 password reset email directly from the app

## [v0.2.1] — 2026-03-19

### Added
- Auto-refresh: pages silently re-fetch data on tab focus and every 60 seconds
- Shared `useAutoRefresh` hook for consistent multi-user data coordination
- Silent refresh mode (no loading spinner) for background data updates

## [v0.2.0] — 2026-03-05

### Added
- Allocation page redesigned with dual views: "By User" (collapsible per-user sections) and "All Games" (flat table with User column), toggled via header buttons
- Sortable column headers on both allocation views (date, opponent, user, available, allocated) with fraction-based sorting for available/allocated columns
- Backend endpoint `GET /api/admin/allocation/by-users` returning allocation data grouped by user
- Release tickets button on Requests page with confirmation dialog warning that tickets will be returned to the available pool
- Request column on Schedule page now shows allocated/requested fraction format

### Changed
- Scrape Schedule button moved into schedule filter pill row (admin-only, between My Games and game count)
- Removed My Games page — functionality consolidated into Schedule and Requests pages
- Removed Request Tickets button and panel from Schedule page

### Fixed
- Promos column in Request Tickets table was always empty — now loads promotions for all home games

## [v0.1.4] — 2026-03-04

### Fixed
- Auth0 config not injected on staging/prod: ServeDir was serving raw index.html bypassing runtime config injection

## [v0.1.3] — 2026-03-04

### Added
- Redesigned Requests page with bulk request checklist for upcoming home games
  - Default seats selector with per-game override
  - Day/Night and Weekday/Weekend filters
  - Select All (respects current filters)
  - Running totals for games and seats (allocated, pending, total)
- Status column on Requests page uses icon-based display matching Schedule page
  - Shows allocated ticket count from actual assignments
  - Partial allocation shown as allocated/requested (e.g. 3/4)
- Header title updated to "Rivas-Yee Giants Ticket Manager"

### Fixed
- Race condition on page load: requests and tickets now load reliably on first visit
- Token getter closure no longer captures stale isAuthenticated state
- Inline seat picker dismisses cleanly without toggling row expansion
- SQLx AnyPool boolean incompatibility: boolean fields stored as INTEGER for SQLite compatibility

### Changed
- Schedule page: split Tickets and Request into separate columns
- Schedule page: removed DH column, kept D/N column
- Tickets and Request columns hidden when not logged in
- Nav bar shows only Schedule link when not authenticated

## [v0.1.2] — 2026-03-03

### Added
- Production environment deployed at `gtm.rivas-yee.com`
- Prod deploy gated to manual workflow dispatch only (staging auto-deploys on push to main)

### Changed
- ECR repository shared across environments (staging creates, prod references via data source)
- Simplified OIDC provider setup in Terraform
- Production RDS uses `db.t4g.micro` (same as staging)

## [v0.1.1] — 2026-03-03

Initial release.
