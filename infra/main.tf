terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  backend "s3" {
    bucket         = "gtm-terraform-state"
    key            = "gtm/terraform.tfstate"
    region         = "us-west-2"
    dynamodb_table = "gtm-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "gtm"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
