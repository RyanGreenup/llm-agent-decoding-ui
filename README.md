# Structured Decoding Example

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- [mise](https://mise.jdx.dev)
  - [sops](https://github.com/getsops/sops)
  - [age](https://github.com/FiloSottile/age)
- [Podman](https://podman.io) + `podman-compose` (for container workflow)
- [just](https://github.com/casey/just)

### Environment

Secrets are stored encrypted in `.env.yaml` (managed by sops + age).
See `.env.example.yaml` for the required variables:

| Variable         | Description                                  |
| ---------------- | -------------------------------------------- |
| `SESSION_SECRET` | 32-char generate with `openssl rand -hex 32` |
| `ADMIN_PASSWORD` | Initial admin password. [^1]                 |
| `OPENAI_API_KEY` | Required for the LLM features                |
| `PORT`           | Default `3075`                               |
| `DATABASE_PATH`  | Default `./data/app.db`                      |

Create and encrypt your own `.env.yaml`:

```sh
cp .env.example.yaml .env.yaml
# edit .env.yaml with real values, then encrypt:
sops encrypt --in-place .env.yaml
```

mise automatically decrypts and loads `.env.yaml` into your shell and
all `just` and `bun` commands inherit the vars from there.

---

### Podman

```sh
just up
just compose-init-db
```

```example
╔══════════════════════════════════════════════════╗
║  Default admin account created                   ║
║  Username: admin                                 ║
║  Password: <from ADMIN_PASSWORD or generated>    ║
║                                                  ║
║  Change this password after first login.         ║
╚══════════════════════════════════════════════════╝
```

Open <http://localhost:3075> and log in.

---

### Bun dev server

> [!NOTE]
> For debugging e.g.:

```sh
rm -r data/app.db data/app.db-shm data/app.db-shm
bun install &&
  bun --bun run build &&
  bun --bun .output/server/index.mjs
```

```sh
just init-db
bun --bun run dev
```

Open <http://localhost:3000>.

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

[^1]: If unset, a random one is generated and printed to stdout on first run.
