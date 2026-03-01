# Stage 1: Build the Rust binary
FROM rust:1.85-bookworm AS rust-builder

WORKDIR /app

# Copy workspace files
COPY Cargo.toml Cargo.lock ./
COPY crates/ crates/
COPY migrations/ migrations/
COPY migrations-sqlite/ migrations-sqlite/

# Build release binary
ARG GTM_GIT_HASH=unknown
ENV GTM_GIT_HASH=${GTM_GIT_HASH}
RUN cargo build --release --bin gtm

# Stage 2: Build the frontend
FROM node:20-bookworm-slim AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY frontend/ ./

ARG VITE_AUTH0_DOMAIN
ARG VITE_AUTH0_CLIENT_ID
ARG VITE_AUTH0_AUDIENCE
ENV VITE_AUTH0_DOMAIN=${VITE_AUTH0_DOMAIN}
ENV VITE_AUTH0_CLIENT_ID=${VITE_AUTH0_CLIENT_ID}
ENV VITE_AUTH0_AUDIENCE=${VITE_AUTH0_AUDIENCE}

RUN npm run build

# Stage 3: Minimal runtime image
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash gtm

WORKDIR /home/gtm

COPY --from=rust-builder /app/target/release/gtm ./gtm
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN chown -R gtm:gtm /home/gtm
USER gtm

EXPOSE 3000

ENTRYPOINT ["./gtm"]
CMD ["serve"]
