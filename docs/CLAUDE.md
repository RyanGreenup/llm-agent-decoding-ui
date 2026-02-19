- Run `just check-links` and `just find-orphans` to assume all pages are included correctly.
- Run mdbook build after each change to ensure it works
- Omit Needless words when writing documentation
- Write in the Active Voice
- Ask before reviewing Github Links as they may be private, ask the user to clone them to a directory

## Variables

Server IPs are defined in `book.toml` under `[preprocessor.variables.variables]`. Use `{{hermes_ip}}` etc. in markdown.

To escape `{{` (e.g., in justfile examples), add spaces: `{ {variable} }` and note the workaround for readers.
