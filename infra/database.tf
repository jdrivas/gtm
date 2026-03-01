# --- RDS Postgres ---

resource "aws_db_subnet_group" "main" {
  name_prefix = "gtm-${var.environment}-"
  subnet_ids  = aws_subnet.private[*].id

  tags = { Name = "gtm-${var.environment}-db-subnet" }
}

resource "aws_security_group" "rds" {
  name_prefix = "gtm-${var.environment}-rds-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
    description     = "PostgreSQL from ECS tasks"
  }

  # Also allow from NAT instance (for SSM tunnel CLI access)
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.nat.id]
    description     = "PostgreSQL from NAT/bastion (SSM tunnel)"
  }

  tags = { Name = "gtm-${var.environment}-rds-sg" }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_instance" "main" {
  identifier_prefix = "gtm-${var.environment}-"

  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db_password.result

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  backup_retention_period = 7
  skip_final_snapshot     = var.environment == "staging"
  final_snapshot_identifier = var.environment == "staging" ? null : "gtm-${var.environment}-final"

  tags = { Name = "gtm-${var.environment}-db" }
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}
