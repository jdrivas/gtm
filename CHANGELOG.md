# Changelog

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
