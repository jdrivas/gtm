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

# Waits for the certificate to be validated. Since DNS is managed in
# Hover (not Route 53), you must manually create the CNAME record shown
# in the `acm_validation_records` output. Terraform will pause here
# until ACM confirms validation (~5-30 minutes after adding the CNAME).
resource "aws_acm_certificate_validation" "main" {
  certificate_arn = aws_acm_certificate.main.arn
}
