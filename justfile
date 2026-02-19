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

# User management (create-user <name>, update-password, delete-user)
manage-users *ARGS:
    uv run scripts/manage_users.py {{ARGS}}
