# Stage 1: Build the frontend
FROM node:20-bookworm-slim AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY frontend/ ./

RUN npm run build

# Stage 2: Minimal runtime image
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash gtm

WORKDIR /home/gtm

# Pre-built binary downloaded from GitHub Releases (see Makefile `download` target)
COPY bin/gtm ./gtm
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN chmod +x ./gtm && chown -R gtm:gtm /home/gtm
USER gtm

EXPOSE 3000

ENTRYPOINT ["./gtm"]
CMD ["serve"]
