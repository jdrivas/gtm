variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-west-2"
}

variable "environment" {
  description = "Environment name (staging or prod)"
  type        = string
}

variable "domain_name" {
  description = "Root domain name"
  type        = string
  default     = "rivas-yee.com"
}

variable "app_subdomain" {
  description = "Subdomain for the app (e.g. gtm or staging-gtm)"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "gtm"
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "gtm"
}

variable "ecs_cpu" {
  description = "ECS task CPU units"
  type        = number
  default     = 256
}

variable "ecs_memory" {
  description = "ECS task memory (MB)"
  type        = number
  default     = 512
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 3000
}

variable "auth0_domain" {
  description = "Auth0 tenant domain"
  type        = string
  default     = "momentlabs.auth0.com"
}

variable "auth0_audience" {
  description = "Auth0 API audience"
  type        = string
  default     = "https://gtm-api.momentlabs.io"
}

variable "github_org" {
  description = "GitHub organization or user for OIDC"
  type        = string
  default     = "jdrivas"
}

variable "github_repo" {
  description = "GitHub repository name for OIDC"
  type        = string
  default     = "gtm"
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}
