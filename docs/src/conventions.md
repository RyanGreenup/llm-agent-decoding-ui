# Conventions

## Verification

Run `just check` regularly. It installs dependencies and runs `tsc --noEmit`.

## Lucide Icons

Always use deep imports:

```ts
// Correct
import Send from "lucide-solid/icons/send";

// Wrong — barrel imports pull in the entire icon set
import { Send } from "lucide-solid";
```

## Server-Only Modules

Apply both file-level and function-level `"use server"`:

```ts
"use server";

export async function myFn() {
  "use server";
  // ...
}
```

See [Server Functions](./server-functions.md) for details.

## innerHTML Security

If you use `innerHTML`, sanitize content first with DOMPurify to prevent XSS.

## Props Patterns

- Pass signal accessors (`Accessor<T>`) to preserve reactivity
- Use `splitProps` to separate component-specific props from HTML attributes
- Caller controls layout — avoid baking margin classes into components

## Path Aliases

TypeScript and Vinxi resolve `~/` to `src/`:

```ts
import { Message } from "~/lib/types";
```

## Types

Core types live in `src/lib/types.ts`:

```ts
type TraceStep = {
  type: "thought" | "action" | "observation" | "review";
  content: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: TraceStep[];
  reviewStatus?: "pass" | "warning";
  reviewNote?: string;
};
```
