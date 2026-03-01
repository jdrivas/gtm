# --- Secrets Manager ---

resource "aws_secretsmanager_secret" "db_password" {
  name_prefix = "gtm/${var.environment}/db-password-"
  description = "GTM ${var.environment} database password"
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result
}

resource "aws_secretsmanager_secret" "auth0" {
  name_prefix = "gtm/${var.environment}/auth0-"
  description = "GTM ${var.environment} Auth0 configuration"
}

resource "aws_secretsmanager_secret_version" "auth0" {
  secret_id = aws_secretsmanager_secret.auth0.id
  secret_string = jsonencode({
    domain   = var.auth0_domain
    audience = var.auth0_audience
  })
}
