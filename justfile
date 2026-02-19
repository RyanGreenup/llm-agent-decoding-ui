set dotenv-load

dev:
    bun run dev

build:
    docker compose build --no-cache

down:
    docker compose down

up-only:
    docker compose up -d

check:
    bun run typecheck

up: check build down up-only




rebuild: down build up
