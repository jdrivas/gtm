# GTM Deployment Makefile
# Usage: make <target> [ENV=staging|prod] [VERSION=v0.1.2]

ENV          ?= staging
AWS_PROFILE  ?= gtm
AWS_REGION   ?= us-west-2
AWS_ACCOUNT  := 190991350052
ECR_REPO     := $(AWS_ACCOUNT).dkr.ecr.$(AWS_REGION).amazonaws.com/gtm
IMAGE_TAG    := $(ENV)-latest
ECS_CLUSTER  := gtm-$(ENV)
ECS_SERVICE  := gtm-$(ENV)
GITHUB_REPO  := jdrivas/gtm

# VERSION: set explicitly (e.g. VERSION=v0.1.2) or auto-detect latest release
VERSION      ?= $(shell gh release view --repo $(GITHUB_REPO) --json tagName -q .tagName 2>/dev/null || echo "")

.PHONY: help ecr-login download build push deploy restart logs status plan apply release frontend-build frontend-dev dev dev-full

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

frontend-build: ## Build frontend (requires node/npm)
	cd frontend && npm run build

frontend-dev: ## Start frontend dev server with HMR (requires node/npm)
	cd frontend && npm run dev

dev: ## Run the local server (serves frontend/dist)
	cargo run -- serve

dev-full: frontend-build dev ## Build frontend then run local server

ecr-login: ## Authenticate Docker with ECR
	AWS_PROFILE=$(AWS_PROFILE) aws ecr get-login-password --region $(AWS_REGION) \
		| docker login --username AWS --password-stdin $(AWS_ACCOUNT).dkr.ecr.$(AWS_REGION).amazonaws.com

download: ## Download pre-built binary from GitHub Releases
	@if [ -z "$(VERSION)" ]; then echo "ERROR: No VERSION set and no releases found. Tag a release first."; exit 1; fi
	@echo "Downloading gtm binary from release $(VERSION)..."
	@mkdir -p bin
	@curl -fSL "https://github.com/$(GITHUB_REPO)/releases/download/$(VERSION)/gtm" -o bin/gtm
	@chmod +x bin/gtm
	@echo "Downloaded bin/gtm ($(VERSION))"

build: ## Build Docker image (requires bin/gtm from download)
	@if [ ! -f bin/gtm ]; then echo "ERROR: bin/gtm not found. Run 'make download' first."; exit 1; fi
	docker build --platform linux/amd64 \
		-t $(ECR_REPO):$(IMAGE_TAG) .

push: ## Push image to ECR
	docker push $(ECR_REPO):$(IMAGE_TAG)

restart: ## Force ECS to pull latest image and redeploy
	AWS_PROFILE=$(AWS_PROFILE) aws ecs update-service \
		--cluster $(ECS_CLUSTER) --service $(ECS_SERVICE) \
		--force-new-deployment --region $(AWS_REGION) \
		--query 'service.{status:status,desired:desiredCount}' --output table

deploy: ecr-login download build push restart ## Full deploy: download binary, build image, push, restart

release: ## Create a new release tag (use VERSION=v0.x.y)
	@if [ -z "$(VERSION)" ]; then echo "Usage: make release VERSION=v0.1.2"; exit 1; fi
	@if ! head -10 CHANGELOG.md | grep -q "$(VERSION)"; then \
		echo "ERROR: CHANGELOG.md does not mention $(VERSION). Update it before releasing."; exit 1; \
	fi
	git tag $(VERSION)
	git push origin $(VERSION)
	@echo "Tag $(VERSION) pushed. GitHub Actions will build the binary and create the release."
	@echo "Run 'make deploy VERSION=$(VERSION)' once the release is ready."

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
