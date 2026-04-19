# Structured Decoding Example

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- [Podman](https://podman.io) + `podman-compose` (for container workflow)
- [just](https://github.com/casey/just)

### Environment

```sh
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Description |
|---|---|
| `SESSION_SECRET` | Min 32-char random string — generate with `openssl rand -base64 32` |
| `ADMIN_PASSWORD` | Initial admin password. If unset, a random one is generated and printed to stdout on first run. |
| `OPENAI_API_KEY` | Required for the LLM features |
| `PORT` | Pre-set to `3075` — change if needed |
| `DATABASE_PATH` | Pre-set to `./data/app.db` |

---

### Option A — Podman (recommended)

```sh
just up
```

Then seed the database and get the admin password:

```sh
just compose-init-db
```

```
╔══════════════════════════════════════════════════╗
║  Default admin account created                   ║
║  Username: admin                                 ║
║  Password: <generated>                           ║
║                                                  ║
║  Change this password after first login.         ║
╚══════════════════════════════════════════════════╝
```

Open http://localhost:3075 and log in.

---

### Option B — Bun dev server

```sh
just init-db
```

This creates `./data/app.db` and prints the admin credentials (only on first run).

```sh
bun --bun run dev
```

Open http://localhost:3000.

---

## User Management

```sh
# Local dev
just manage-users create-user <username>
just manage-users update-password
just manage-users delete-user

# Running compose container
podman exec llm-agent-decoding-ui_app_1 \
    bun run scripts/manage_users.ts update-password
```
