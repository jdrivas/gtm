# --- CloudWatch Log Groups ---

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/gtm-${var.environment}"
  retention_in_days = var.log_retention_days

  tags = { Name = "gtm-${var.environment}-ecs-logs" }
}

# --- CloudWatch Alarm: ECS task crashes ---

resource "aws_cloudwatch_metric_alarm" "ecs_task_count" {
  alarm_name          = "gtm-${var.environment}-ecs-running-tasks"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "RunningTaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = 60
  statistic           = "Average"
  threshold           = 1
  alarm_description   = "GTM ${var.environment}: No running ECS tasks"
  treat_missing_data  = "breaching"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.gtm.name
  }
}
