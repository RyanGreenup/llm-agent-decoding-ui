set dotenv-load

init:
    bun install

dev: init
    bun run dev

build:
    docker compose build --no-cache

down:
    docker compose down

up-only:
    docker compose up -d

check: init
    bun run typecheck

up: check build down up-only




rebuild: down build up
