# --- ACM Certificate ---
#
# DNS is managed externally on Hover. After `terraform apply`, check the
# outputs for the CNAME records to create manually:
#   1. ACM validation CNAME  → validates the certificate (one-time)
#   2. App CNAME             → points subdomain to the ALB

resource "aws_acm_certificate" "main" {
  domain_name       = "${var.app_subdomain}.${var.domain_name}"
  validation_method = "DNS"

  tags = { Name = "gtm-${var.environment}-cert" }

  lifecycle {
    create_before_destroy = true
  }
}
