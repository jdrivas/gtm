# Changelog

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
