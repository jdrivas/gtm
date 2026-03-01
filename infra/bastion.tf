# NAT instance — doubles as SSM bastion for CLI access to RDS
# Cost: ~$3/mo (t4g.nano) vs ~$32/mo for NAT Gateway

data "aws_ami" "amazon_linux_arm" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-arm64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_security_group" "nat" {
  name_prefix = "gtm-${var.environment}-nat-"
  vpc_id      = aws_vpc.main.id

  # Allow all outbound
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow inbound from private subnets (NAT traffic)
  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [for s in aws_subnet.private : s.cidr_block]
  }

  tags = { Name = "gtm-${var.environment}-nat-sg" }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_iam_role" "nat_instance" {
  name_prefix = "gtm-${var.environment}-nat-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "nat_ssm" {
  role       = aws_iam_role.nat_instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "nat" {
  name_prefix = "gtm-${var.environment}-nat-"
  role        = aws_iam_role.nat_instance.name
}

resource "aws_instance" "nat" {
  ami                    = data.aws_ami.amazon_linux_arm.id
  instance_type          = "t4g.nano"
  subnet_id              = aws_subnet.public[0].id
  vpc_security_group_ids = [aws_security_group.nat.id]
  iam_instance_profile   = aws_iam_instance_profile.nat.name
  source_dest_check      = false

  user_data = <<-EOF
    #!/bin/bash
    yum install -y iptables-services
    sysctl -w net.ipv4.ip_forward=1
    echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.conf
    iptables -t nat -A POSTROUTING -o ens5 -j MASQUERADE
    service iptables save
  EOF

  tags = { Name = "gtm-${var.environment}-nat" }
}

# Auto-recovery: restart the instance if it becomes impaired
resource "aws_cloudwatch_metric_alarm" "nat_recovery" {
  alarm_name          = "gtm-${var.environment}-nat-recovery"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "StatusCheckFailed_System"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  alarm_actions       = ["arn:aws:automate:${var.aws_region}:ec2:recover"]

  dimensions = {
    InstanceId = aws_instance.nat.id
  }
}
