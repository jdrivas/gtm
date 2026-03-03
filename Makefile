# GTM Deployment Makefile
# Usage: make <target> [ENV=staging|prod]

ENV          ?= staging
AWS_PROFILE  ?= gtm
AWS_REGION   ?= us-west-2
AWS_ACCOUNT  := 190991350052
ECR_REPO     := $(AWS_ACCOUNT).dkr.ecr.$(AWS_REGION).amazonaws.com/gtm
IMAGE_TAG    := $(ENV)-latest
ECS_CLUSTER  := gtm-$(ENV)
ECS_SERVICE  := gtm-$(ENV)
GIT_HASH     := $(shell git rev-parse --short HEAD)

.PHONY: help ecr-login build push deploy restart logs status plan apply

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

ecr-login: ## Authenticate Docker with ECR
	AWS_PROFILE=$(AWS_PROFILE) aws ecr get-login-password --region $(AWS_REGION) \
		| docker login --username AWS --password-stdin $(AWS_ACCOUNT).dkr.ecr.$(AWS_REGION).amazonaws.com

build: ## Build Docker image for linux/amd64
	docker build --platform linux/amd64 \
		--build-arg GTM_GIT_HASH=$(GIT_HASH) \
		-t $(ECR_REPO):$(IMAGE_TAG) .

push: ## Push image to ECR
	docker push $(ECR_REPO):$(IMAGE_TAG)

restart: ## Force ECS to pull latest image and redeploy
	AWS_PROFILE=$(AWS_PROFILE) aws ecs update-service \
		--cluster $(ECS_CLUSTER) --service $(ECS_SERVICE) \
		--force-new-deployment --region $(AWS_REGION) \
		--query 'service.{status:status,desired:desiredCount}' --output table

deploy: ecr-login build push restart ## Full deploy: login, build, push, restart

logs: ## Tail ECS logs (last 10 min)
	AWS_PROFILE=$(AWS_PROFILE) aws logs tail /ecs/$(ECS_CLUSTER) \
		--region $(AWS_REGION) --since 10m --follow

status: ## Show ECS service status and recent events
	@AWS_PROFILE=$(AWS_PROFILE) aws ecs describe-services \
		--cluster $(ECS_CLUSTER) --services $(ECS_SERVICE) --region $(AWS_REGION) \
		--query 'services[0].{desired:desiredCount,running:runningCount,pending:pendingCount,events:events[0:5]}' \
		--output yaml

plan: ## Terraform plan for the current environment
	cd infra && AWS_PROFILE=$(AWS_PROFILE) terraform plan -var-file=environments/$(ENV).tfvars

apply: ## Terraform apply for the current environment
	cd infra && AWS_PROFILE=$(AWS_PROFILE) terraform apply -var-file=environments/$(ENV).tfvars
