# Deployment

## Local Docker (dev)

The project includes a `Dockerfile` and `docker-compose.yml`.

### Build and Run

```bash
# Full pipeline: typecheck, build image, restart container
just up

# Or manually:
docker compose build --no-cache
docker compose up -d
```

### Environment

Pass environment variables via `.env` or docker-compose:

```yaml
# docker-compose.yml
services:
  app:
    env_file: .env
```

Required variables:

| Variable       | Purpose                                  |
|----------------|------------------------------------------|
| `RAW_DOC_PATH` | Path to the PDS document inside the container |

## Production Image Transfer (no registry)

This project supports shipping a prebuilt production image to a server as a tarball.

### 1) Build and export locally

```bash
# Builds Dockerfile.production as llm-agent:latest
just prod-image-build

# Export image archive
docker save llm-agent:latest | gzip > llm-agent_latest.tar.gz
```

### 2) Copy to server

```bash
rsync -avz llm-agent_latest.tar.gz user@your-server:/tmp/
```

### 3) Import on server

```bash
gunzip -c /tmp/llm-agent_latest.tar.gz | docker load
```

Notes:
- `docker load` restores the image/tag embedded in the archive.
- This repo expects `llm-agent:latest` for the production app service.

### 4) Start production services on server

From the repo directory on the server:

```bash
docker volume create pds-llm-agent-data
docker compose -f docker-compose.production.yml up -d
```

Requirements:
- `.env` must exist next to `docker-compose.production.yml`.
- `docker-compose.production.yml` uses `image: llm-agent:latest` and `build:` for `app`.
- `pull_policy: never` prevents accidental registry pulls.

## Production (Podman Quadlets)

Production uses Podman Quadlet unit files instead of docker-compose. Quadlet files live in `containers/` and get installed as systemd user units.

### Architecture

- **llm-agent-app** — Bun application (not published to host)
- **llm-agent-caddy** — Caddy reverse proxy (ports 80/443)
- **llm-agent-data** — persistent volume for SQLite + documents
- **llm-agent-caddy-data** — persistent volume for Caddy TLS certs
- **llm-agent** — shared network for app/caddy communication

Secrets (`SESSION_SECRET`, `OPENAI_API_KEY`) are stored via `podman secret` and never touch the filesystem.

### Full Deploy

```bash
just deploy
```

This runs: `deploy-secrets` → `deploy-build` → `deploy-install` → `deploy-down` → `deploy-up`.

### Individual Steps

```bash
# Create/update secrets from server .env
just deploy-secrets

# Build images
just deploy-build

# Install quadlet files + reload systemd
just deploy-install

# Start/stop
just deploy-up
just deploy-down
```

### User Management

Runs inside the app container via `podman exec` (the app must be running):

```bash
just podman-manage-users create-user <name>
just podman-manage-users update-password
just podman-manage-users delete-user
```

On first startup with an empty database, a default admin account is auto-seeded
and the credentials are printed to the container logs:

```bash
just deploy-log-app
```

### Logs

```bash
just deploy-log-app    # app stdout/stderr
just deploy-log-caddy  # caddy stdout/stderr
```

### Security Hardening

All containers run with:
- `ReadOnly=true` — read-only root filesystem
- `NoNewPrivileges=true` — no privilege escalation
- Non-root user (UID 1001)
- Network isolation (app only reachable via Caddy)
- Caddy: `DropCapability=ALL` + `AddCapability=NET_BIND_SERVICE`

## Useful Commands

| Command        | Description                        |
|----------------|------------------------------------|
| `just up`      | Typecheck + build + deploy (dev)   |
| `just down`    | Stop dev containers                |
| `just rebuild` | Stop + rebuild + restart (dev)     |
| `just deploy`  | Full production deployment         |
| `just deploy-build` | Build production images       |
| `just deploy-up` | Start production services        |
| `just deploy-down` | Stop production services       |
| `just deploy-log-app` | Tail app logs               |
| `just deploy-log-caddy` | Tail caddy logs           |
| `just podman-manage-users` | Manage users against production DB |
