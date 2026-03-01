# GTM Infrastructure

Terraform-managed AWS infrastructure for the GTM application.

## Architecture

- **VPC** with 2 public + 2 private subnets across 2 AZs
- **NAT instance** (t4g.nano, ~$3/mo) for private subnet internet access + SSM bastion
- **RDS Postgres 16** in private subnets
- **ECS Fargate** running the GTM container in private subnets
- **ALB** in public subnets with ACM certificate + HTTP→HTTPS redirect
- **Route 53** DNS for `gtm.rivas-yee.com` (prod) / `staging-gtm.rivas-yee.com`
- **CloudWatch Logs** for ECS container output
- **Secrets Manager** for DB password and Auth0 config
- **ECR** for Docker image storage
- **GitHub Actions OIDC** for keyless CI/CD deployment

## Prerequisites

1. AWS CLI configured with admin credentials
2. Terraform >= 1.5 installed
3. Route 53 hosted zone for `rivas-yee.com` exists
4. GitHub repo at `jdrivas/gtm`

## Deployment Order

### 1. Bootstrap (one-time)

Creates the S3 bucket and DynamoDB table for Terraform remote state.

```bash
cd infra/bootstrap
terraform init
terraform apply
```

### 2. Deploy Staging

```bash
cd infra
terraform init
terraform workspace new staging || terraform workspace select staging
terraform plan -var-file=environments/staging.tfvars
terraform apply -var-file=environments/staging.tfvars
```

### 3. Deploy Production

```bash
cd infra
terraform workspace new prod || terraform workspace select prod
terraform plan -var-file=environments/prod.tfvars
terraform apply -var-file=environments/prod.tfvars
```

### 4. Push First Docker Image

After ECR is created, push the first image:

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URL="${AWS_ACCOUNT_ID}.dkr.ecr.us-west-2.amazonaws.com/gtm"

aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin $ECR_URL

docker build \
  --build-arg GTM_GIT_HASH=$(git rev-parse HEAD) \
  --build-arg VITE_AUTH0_DOMAIN=momentlabs.auth0.com \
  --build-arg VITE_AUTH0_CLIENT_ID=<your-client-id> \
  --build-arg VITE_AUTH0_AUDIENCE=https://gtm-api.momentlabs.io \
  -t $ECR_URL:staging-latest \
  .

docker push $ECR_URL:staging-latest
```

### 5. Configure GitHub Actions Secrets

In your GitHub repo settings, add these secrets:

| Secret | Value |
|--------|-------|
| `AWS_DEPLOY_ROLE_ARN` | Output from `terraform output` — the GitHub Actions IAM role ARN |
| `AUTH0_DOMAIN` | `momentlabs.auth0.com` |
| `AUTH0_CLIENT_ID` | Your Auth0 SPA client ID for the target environment |
| `AUTH0_AUDIENCE` | `https://gtm-api.momentlabs.io` |

## CLI Access to Production DB

Use SSM port forwarding through the NAT instance:

```bash
# Find the NAT instance ID
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=gtm-prod-nat" "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)

# Start port forwarding
aws ssm start-session \
  --target $INSTANCE_ID \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["<RDS_ENDPOINT>"],"portNumber":["5432"],"localPortNumber":["5432"]}'

# In another terminal, use the CLI
GTM_DB_URL="postgres://gtm:<password>@localhost/gtm" ./target/release/gtm list-games
```

## Cost Estimate

| Resource | Staging | Production |
|----------|---------|------------|
| NAT instance (t4g.nano) | $3 | $3 |
| RDS (t4g.micro/small) | $12 | $26 |
| ECS Fargate (0.25 vCPU) | $9 | $9 |
| ALB | $16 | $16 |
| ECR + CloudWatch | $2 | $2 |
| **Total** | **~$42/mo** | **~$56/mo** |
