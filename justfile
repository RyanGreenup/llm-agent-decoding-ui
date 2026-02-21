set dotenv-load

init:
    bun install

dev: init
    bun --bun run dev --host

build:
    docker compose build

down:
    docker compose down

up-only:
    docker compose up -d

check: init
    bunx tsc --noEmit

up: check build down up-only




rebuild: down build up

# Create the external volume (idempotent)
prod-volume:
    docker volume create pds-llm-agent-data

# Production (hardened build + Caddy reverse proxy)
prod-image-build:
    docker build -f Dockerfile.production -t llm-agent:latest .

prod-build:
    docker compose -f docker-compose.production.yml build

prod-build-no-cache:
    docker compose -f docker-compose.production.yml build --no-cache


prod-up:
    docker compose -f docker-compose.production.yml up -d
    docker compose -f docker-compose.production.yml cp \
        "data/Product Disclosure Statement (PDS).docx" \
        app:"/app/data/Product Disclosure Statement (PDS).docx"

prod-seed-doc:
    docker compose -f docker-compose.production.yml cp \
        "data/Product Disclosure Statement (PDS).docx" \
        app:"/app/data/Product Disclosure Statement (PDS).docx"

prod-down:
    docker compose -f docker-compose.production.yml down

prod: prod-volume prod-build prod-down prod-up

# User management (create-user <name>, update-password, delete-user)
manage-users *ARGS:
    bun run scripts/manage_users.ts {{ARGS}}

# User management against the running production container
podman-manage-users *ARGS:
    podman exec -it systemd-llm-agent-app \
        bun run scripts/manage_users.ts {{ARGS}}

# =============================================================================
# Podman Quadlet Deployment
# =============================================================================

# Headless servers lack a D-Bus session bus; set XDG_RUNTIME_DIR so
# `systemctl --user` works outside a login session (requires lingering).
export XDG_RUNTIME_DIR := env("XDG_RUNTIME_DIR", "/run/user/" + `id -u`)

# Create podman secrets from the server .env file
deploy-secrets:
    #!/usr/bin/env bash
    set -euo pipefail
    ENV_FILE="/mnt/volume_syd1_02/llm-agent/.env"
    SESSION_SECRET=$(grep '^SESSION_SECRET=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')
    OPENAI_API_KEY=$(grep '^OPENAI_API_KEY=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')
    printf '%s' "$SESSION_SECRET" | podman secret create --replace llm-agent-session-secret -
    printf '%s' "$OPENAI_API_KEY" | podman secret create --replace llm-agent-openai-api-key -

# Build container images
deploy-build:
    podman build -f containers/Containerfile.app -t llm-agent:latest .
    podman build -f containers/Containerfile.caddy -t llm-agent-caddy:latest .

# Install quadlet files and reload systemd
deploy-install:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p ~/.config/containers/systemd
    cp containers/*.container containers/*.volume containers/*.network ~/.config/containers/systemd/
    systemctl --user daemon-reload

# Start services
deploy-up:
    systemctl --user start llm-agent-caddy

# Stop services
deploy-down:
    systemctl --user stop llm-agent-caddy llm-agent-app

# View app logs
deploy-log-app:
    journalctl --user -u llm-agent-app -f

# View caddy logs
deploy-log-caddy:
    journalctl --user -u llm-agent-caddy -f

# Full deployment pipeline
deploy: deploy-secrets deploy-build deploy-install deploy-down deploy-up
