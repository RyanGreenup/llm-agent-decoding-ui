# Getting Started

## Prerequisites

- [Bun](https://bun.sh/) (package manager and runtime)
- [just](https://github.com/casey/just) (command runner)
- Node.js >= 22

## Quick Start

```bash
# Install dependencies and start the dev server
just dev
```

This runs `bun install` then `bun run dev`, which starts Vinxi's hot-reload server.

## Available Commands

All commands are defined in the root `justfile`:

| Command       | Description                              |
|---------------|------------------------------------------|
| `just dev`    | Install deps + start dev server          |
| `just check`  | Install deps + run TypeScript typecheck  |
| `just build`  | Docker build (no cache)                  |
| `just up`     | Typecheck, docker build, restart         |
| `just down`   | Stop docker containers                   |
| `just rebuild`| Stop, rebuild, restart                   |

The underlying npm scripts:

| Script             | Command          |
|--------------------|------------------|
| `bun run dev`      | `vinxi dev`      |
| `bun run build`    | `vinxi build`    |
| `bun run start`    | `vinxi start`    |
| `bun run typecheck`| `tsc --noEmit`   |

## Environment Variables

Create a `.env` file in the project root. The `justfile` loads it automatically (`set dotenv-load`).

| Variable       | Purpose                                         |
|----------------|------------------------------------------------ |
| `RAW_DOC_PATH` | Absolute path to the PDS document (.docx, .pdf) |

## Verify Everything Works

```bash
just check
```

Run this regularly. It installs dependencies and runs `tsc --noEmit` to catch type errors.
