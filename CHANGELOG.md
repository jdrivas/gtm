# Changelog

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
