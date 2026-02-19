# Deployment

## Docker

The project includes a `Dockerfile` and `docker-compose.yml`.

### Build and Run

```bash
# Full pipeline: typecheck, build image, restart container
just up

# Or manually:
docker compose build --no-cache
docker compose up -d
```

### Dockerfile

Multi-stage build using `oven/bun:1`:

1. Install dependencies with `bun install --frozen-lockfile`
2. Copy source and run `bun run build` (Vinxi production build)
3. Expose port 3000
4. Start with `bun run start`

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

## Useful Commands

| Command        | Description                        |
|----------------|------------------------------------|
| `just up`      | Typecheck + build + deploy         |
| `just down`    | Stop containers                    |
| `just rebuild` | Stop + rebuild + restart           |
| `just build`   | Docker build only                  |
