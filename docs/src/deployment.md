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

## Useful Commands

| Command        | Description                        |
|----------------|------------------------------------|
| `just up`      | Typecheck + build + deploy         |
| `just down`    | Stop containers                    |
| `just rebuild` | Stop + rebuild + restart           |
| `just build`   | Docker build only                  |
| `just prod-image-build` | Build `llm-agent:latest` from `Dockerfile.production` |
| `just prod-up` | Start production compose stack     |
