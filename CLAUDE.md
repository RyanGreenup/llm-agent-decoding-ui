# Project Conventions

## Verification

Run `just check` regularly to verify the project builds and passes checks.

## Lucide Icons (lucide-solid)

Always use deep imports for lucide-solid icons:

```ts
// Correct
import FileText from "lucide-solid/icons/file-text";

// Wrong — do NOT use barrel imports
import { FileText } from "lucide-solid";
```

## Server-only modules: `"use server"`

For files that are entirely server-only (e.g. Node.js APIs, DB access), use a belt-and-suspenders approach — apply **both** file-level and function-level `"use server"` directives:

```ts
"use server"; // file-level: marks the entire module as server-only

export async function myServerFn(input: string): Promise<string> {
  "use server"; // function-level: redundant but explicit per-function safety net
  // ...
}
```

The file-level directive ensures nothing in the module leaks into the client bundle. The function-level directive on each exported function acts as a safety net if the function is ever moved to a mixed file.

## Security: innerHTML

If you use `innerHTML` (or SolidJS's `innerHTML` directive), always sanitize the content first (e.g. with DOMPurify) to prevent XSS.
