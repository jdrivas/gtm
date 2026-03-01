output "app_url" {
  description = "Application URL"
  value       = "https://${var.app_subdomain}.${var.domain_name}"
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.main.dns_name
}

output "rds_endpoint" {
  description = "RDS endpoint"
  value       = aws_db_instance.main.endpoint
}

output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = aws_ecr_repository.gtm.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.gtm.name
}

# --- Manual DNS records (create these in Hover) ---

output "acm_validation_records" {
  description = "CNAME records to create in Hover for ACM certificate validation"
  value = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      cname_name  = dvo.resource_record_name
      cname_value = dvo.resource_record_value
    }
  }
}

output "app_cname_record" {
  description = "CNAME record to create in Hover: point this subdomain to the ALB"
  value = {
    name  = "${var.app_subdomain}.${var.domain_name}"
    value = aws_lb.main.dns_name
  }
}
