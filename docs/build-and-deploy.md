# Build & Deploy Pipeline

How GTM gets from source code to running in production.

---

## Technology inventory

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Backend** | Rust (Cargo workspace) | Single `gtm` binary — Axum HTTP server + Clap CLI |
| **Frontend** | React + TypeScript + Vite + TailwindCSS | SPA, built to static files in `frontend/dist/` |
| **Database** | SQLx AnyPool — SQLite (local) or Postgres (staging/prod) | Runtime backend detection by URL prefix |
| **Auth** | Auth0 | JWT-based authentication, roles via custom claims |
| **Source control** | Git + GitHub (`jdrivas/gtm`) | Main branch, tag-based releases |
| **CI** | GitHub Actions (`ci.yml`) | Lint, type-check, build, test on every push to main |
| **Release build** | GitHub Actions (`release.yml`) | Build release binary, publish GitHub Release |
| **Deploy** | GitHub Actions (`deploy.yml`) + Makefile | Build Docker image, push to ECR, restart ECS |
| **Container image** | Docker (multi-stage) | Combines pre-built Rust binary + freshly-built frontend |
| **Container registry** | AWS ECR | `190991350052.dkr.ecr.us-west-2.amazonaws.com/gtm` |
| **Runtime** | AWS ECS Fargate | One task per environment, behind ALB |
| **Infrastructure** | Terraform (`infra/`) | VPC, ALB, ECS, RDS, IAM, CloudWatch, Secrets Manager |
| **DNS** | Hover.com | Manual CNAME records → ALB |
| **Domains** | `staging-gtm.rivas-yee.com`, `gtm.rivas-yee.com` | Staging and production |
| **Orchestration** | Makefile | Local commands for build, deploy, release, logs, status |

---

## Key artifacts

### The Rust binary (`gtm`)

Built by `cargo build --release --bin gtm`. At compile time, `build.rs` bakes in:
- **Version** from `Cargo.toml` (`CARGO_PKG_VERSION`)
- **Git hash** from either the `GTM_GIT_HASH` env var (CI) or `git rev-parse --short HEAD` (local), truncated to 7 chars

The binary is a **linux/amd64** executable when built in CI. It cannot run on macOS directly from a GitHub Release download — it's meant to go into the Docker image.

### The frontend bundle (`frontend/dist/`)

Built by `npm run build` inside `frontend/`. Vite produces static JS/CSS/HTML. The `gtm` binary serves these files from `frontend/dist/` at runtime and injects Auth0 config into `index.html` on startup.

### The Docker image

Multi-stage Dockerfile:
1. **`frontend-builder`** — `node:20-bookworm-slim`, runs `npm ci` + `npm run build` from the current source tree
2. **`runtime`** — `debian:bookworm-slim`, copies in the pre-built Rust binary (`bin/gtm`) and the frontend dist from stage 1

The binary is NOT built inside Docker. It's downloaded from a GitHub Release and placed in `bin/gtm` before `docker build` runs.

---

## GitHub Actions workflows

### 1. CI (`ci.yml`)

**Triggers:** Push to `main`, pull requests to `main`

**What it does:**
- **Rust job:** fmt check → clippy → build → test (against Postgres 16)
- **Frontend job:** npm ci → TypeScript type-check → Vite build

**Outcome:** Pass/fail status on the commit. Does not produce any deployable artifacts.

### 2. Release (`release.yml`)

**Triggers:** Push of a tag matching `v*`

**What it does:**
1. Spins up Postgres 16 service container
2. `cargo fmt --check` and `cargo clippy`
3. `cargo build --release --bin gtm` (with `GTM_GIT_HASH` set to the full commit SHA)
4. `cargo test --all` (against Postgres)
5. Extracts the latest entry from `CHANGELOG.md`
6. Creates a GitHub Release with the changelog body and attaches the `gtm` binary

**Outcome:** A published GitHub Release at the tag, with a downloadable `gtm` linux binary.

### 3. Deploy (`deploy.yml`)

**Triggers:**
- `release: types: [published]` — fires automatically when a Release is created
- `workflow_dispatch` — manual trigger from GitHub UI (choose staging or prod)

**What it does:**
1. Checks out the repo at the release commit
2. Downloads the `gtm` binary from the triggering release (or latest release for workflow_dispatch)
3. Runs `docker build` — this builds the frontend from the checked-out source and packages it with the downloaded binary
4. Pushes the image to ECR tagged as `<sha-short>` and `staging-latest`
5. **deploy-staging job:** Forces a new ECS deployment on `gtm-staging`, waits for stability
6. **deploy-prod job:** Only runs on `workflow_dispatch` with `environment: prod`. Re-tags the image as `prod-latest`, forces ECS deployment on `gtm-prod`

**Outcome:** Staging gets the new image automatically on every release. Prod only deploys via manual workflow_dispatch.

---

## Development workflow

All changes go through feature branches and pull requests. The Makefile automates each step.

### Step 1: Start a feature

```
make branch NAME=simplify-game-dropdown
```

This pulls the latest `main`, creates `feature/simplify-game-dropdown`, and switches to it.

### Step 2: Develop and test locally

```
# Terminal 1 — frontend dev server with hot reload
make frontend-dev
# → Vite dev server on http://localhost:5173, proxies API calls to :3000

# Terminal 2 — backend server
make dev
# → Axum server on http://localhost:3000, uses SQLite (gtm.db)
```

Or without hot reload: `make dev-full` (builds frontend then runs server).

Commit as you go — all commits are on your feature branch, not `main`.

### Step 3: Open a pull request

```
make pr
```

This pushes the branch to GitHub and opens a PR targeting `main`. CI runs automatically (fmt, clippy, build, test for Rust; type-check, build for frontend).

If CI fails, fix the issue, commit, and `git push` — CI re-runs on the PR.

### Step 4: Merge

```
make merge
```

Squash-merges the PR into `main` (one clean commit), deletes the feature branch, and switches back to `main`.

### Step 5: Release to staging

Update `Cargo.toml` version and `CHANGELOG.md`, then:

```
make staging VERSION=v0.3.0
```

This runs three targets in sequence:
1. **`release`** — Validates `CHANGELOG.md` mentions the version, creates git tag, pushes tag to GitHub
2. **`wait-release`** — Polls every 10 seconds until the GitHub Release is published with the `gtm` binary attached (~5 minutes for the Release workflow to build)
3. **`deploy`** — Downloads the binary, builds Docker image locally (including fresh frontend build), pushes to ECR, restarts ECS staging service

Meanwhile, GitHub Actions also runs the Deploy workflow (triggered by the release being published), so staging gets deployed twice — but the result is identical.

### Step 6: Validate on staging

Test the deployment at `https://staging-gtm.rivas-yee.com`.

### Step 7: Deploy to production

```
make prod VERSION=v0.3.0
```

This verifies the release exists, shows a confirmation prompt, then deploys to production. Under the hood it runs `make deploy ENV=prod VERSION=v0.3.0`.

**Alternative:** Deploy via GitHub Actions UI — go to Actions → Deploy → Run workflow → select `prod`.

---

## Scenarios

### CI only (no deploy)

Pushing to `main` (or a PR) triggers the CI workflow: fmt, clippy, build, test (Rust) + type-check, build (frontend). No release or deployment happens.

### Frontend-only changes

You still need to cut a release — the binary will be identical to the last one, but the process ensures the new frontend code gets built into the Docker image.

**Alternative for quick iteration:** Use `make deploy` directly without a new release. This rebuilds the Docker image locally (picking up frontend changes from your working tree) and pushes it, using the existing release binary.

```
make deploy VERSION=v0.3.0    # re-deploy with same binary, new frontend
```

### What the Docker image contains

The image built during deploy combines:
- **Binary:** The `gtm` executable from the GitHub Release (built on ubuntu in CI, linux/amd64)
- **Frontend:** Built from source by `npm run build` inside the Docker build — uses whatever frontend code is checked out at the time

The frontend in the Docker image comes from the **current source tree**, not from any pre-built artifact.

---

## Infrastructure management

Terraform manages all AWS resources. The state is stored in S3 (bootstrapped separately).

```
make plan                  # terraform plan for staging (default)
make plan ENV=prod         # terraform plan for production
make apply                 # terraform apply for staging
make apply ENV=prod        # terraform apply for production
```

**What Terraform manages:** VPC, subnets, ALB, ACM certificates, ECS cluster/service/task definition, RDS Postgres, security groups, IAM roles, CloudWatch log groups, Secrets Manager (Auth0 credentials), ECR repository.

**What Terraform does NOT manage:** DNS records (manual on Hover.com), Auth0 configuration, the Docker image contents, GitHub Actions workflows.

---

## Monitoring

```
make logs                  # tail staging CloudWatch logs (last 10 min, live follow)
make logs ENV=prod         # tail production logs
make status                # show ECS staging service status + recent events
make status ENV=prod       # show ECS production service status
```

---

## Version string

The app displays its version as `<cargo_version> (<git_hash>)`, e.g. `0.2.0 (499d0d0)`.

- **`cargo_version`** comes from `Cargo.toml` `[workspace.package] version`
- **`git_hash`** comes from `build.rs`:
  - In CI: `GTM_GIT_HASH` env var (the full SHA), truncated to 7 chars
  - Locally: `git rev-parse --short HEAD`, with `-dirty` suffix if working tree has changes

Visible at:
- `/api/health` endpoint (JSON response includes `version` field)
- CLI: `gtm --version`
- Frontend: version popup in the header (fetches from `/api/health` on load)

---

## Summary of triggers

| Event | CI | Release | Deploy (staging) | Deploy (prod) |
|-------|:--:|:-------:|:----------------:|:-------------:|
| Push to `main` | ✅ | — | — | — |
| Push tag `v*` | — | ✅ | — | — |
| Release published | — | — | ✅ (auto) | — |
| `workflow_dispatch` (staging) | — | — | ✅ (manual) | — |
| `workflow_dispatch` (prod) | — | — | — | ✅ (manual) |
| `make staging VERSION=...` | — | — | ✅ (local) | — |
| `make prod VERSION=...` | — | — | — | ✅ (local) |
