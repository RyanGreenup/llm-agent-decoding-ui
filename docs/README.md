# GForce Docs

Internal technical documentation built with [mdbook](https://rust-lang.github.io/mdBook/).

## Setup

```bash
just init
```

Installs mdbook-mermaid and mdbook-variables, and sets up mermaid JS files.

## Build

```bash
mdbook build
```

## Serve Locally

```bash
mdbook serve --open
```

## Deploy

```bash
just deploy
```

Deploys to [Thebes](src/servers/thebes.md) via rsync.

## Variables

Server IPs are configured in `book.toml` under `[preprocessor.variables.variables]`. Use `{{variable_name}}` in markdown files.

To escape `{{` (e.g., in justfile code blocks), add spaces: `{ {variable} }`.

## Mermaid Diagrams

Use fenced code blocks with `mermaid` language:

~~~markdown
```mermaid
graph LR
    A[Start] --> B[End]
```
~~~
