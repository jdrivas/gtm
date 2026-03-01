# --- ECR Repository ---

resource "aws_ecr_repository" "gtm" {
  name                 = "gtm"
  image_tag_mutability = "MUTABLE"
  force_delete         = var.environment == "staging"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "gtm" {
  repository = aws_ecr_repository.gtm.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 20 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 20
        }
        action = { type = "expire" }
      }
    ]
  })
}

# --- ECS Cluster ---

resource "aws_ecs_cluster" "main" {
  name = "gtm-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# --- ECS Security Group ---

resource "aws_security_group" "ecs_tasks" {
  name_prefix = "gtm-${var.environment}-ecs-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "From ALB"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "gtm-${var.environment}-ecs-sg" }

  lifecycle {
    create_before_destroy = true
  }
}

# --- ECS Task Definition ---

locals {
  db_url = "postgres://${var.db_username}:${random_password.db_password.result}@${aws_db_instance.main.endpoint}/${var.db_name}"
}

resource "aws_ecs_task_definition" "gtm" {
  family                   = "gtm-${var.environment}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_cpu
  memory                   = var.ecs_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "gtm"
    image     = "${aws_ecr_repository.gtm.repository_url}:${var.environment}-latest"
    essential = true

    portMappings = [{
      containerPort = var.container_port
      protocol      = "tcp"
    }]

    environment = [
      { name = "GTM_PORT", value = tostring(var.container_port) },
      { name = "GTM_LOG_LEVEL", value = "info" },
      { name = "GTM_UTC", value = "true" },
      { name = "GTM_DB_URL", value = local.db_url },
    ]

    secrets = [
      {
        name      = "AUTH0_DOMAIN"
        valueFrom = "${aws_secretsmanager_secret.auth0.arn}:domain::"
      },
      {
        name      = "AUTH0_AUDIENCE"
        valueFrom = "${aws_secretsmanager_secret.auth0.arn}:audience::"
      },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "gtm"
      }
    }
  }])
}

# --- ECS Service ---

resource "aws_ecs_service" "gtm" {
  name            = "gtm-${var.environment}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.gtm.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  enable_execute_command = true

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.gtm.arn
    container_name   = "gtm"
    container_port   = var.container_port
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  depends_on = [aws_lb_listener.https]
}
