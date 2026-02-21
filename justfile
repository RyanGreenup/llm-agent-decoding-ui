set dotenv-load

init:
    npm install

dev: init
    npx vinxi dev --host

build:
    docker compose build

down:
    docker compose down

up-only:
    docker compose up -d

check: init
    npx tsc --noEmit

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
    uv run scripts/manage_users.py {{ARGS}}

# Build the admin tooling image (node + python + uv, deps pre-installed)
admin-build:
    docker build -t pds-llm-agent-admin -f scripts/Dockerfile.admin .

# User management against the production volume (docker)
docker-manage-users *ARGS: admin-build
    docker run --rm -it \
        -v pds-llm-agent-data:/app/data \
        -e DATABASE_PATH=/app/data/app.db \
        pds-llm-agent-admin {{ARGS}}

# User management against the production volume (podman)
podman-manage-users *ARGS: admin-build
    podman run --rm -it \
        -v pds-llm-agent-data:/app/data \
        -e DATABASE_PATH=/app/data/app.db \
        pds-llm-agent-admin {{ARGS}}
