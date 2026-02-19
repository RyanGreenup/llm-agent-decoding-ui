# Server Functions

Server functions run only on the server. They never ship to the client bundle.

## Convention

Apply **both** file-level and function-level `"use server"` directives:

```ts
"use server"; // file-level: keeps the entire module server-only

export async function myServerFn(input: string): Promise<string> {
  "use server"; // function-level: safety net if the function moves to a mixed file
  // Node.js APIs, DB access, env vars, etc.
}
```

The file-level directive prevents anything in the module from leaking into the client bundle. The function-level directive acts as a safety net per function.

## Server Queries

For data-fetching functions called from components, wrap them with `query()` from `@solidjs/router`. This enables caching and preloading:

```ts
import { query } from "@solidjs/router";

export const getModels = query(async (): Promise<Model[]> => {
  "use server";
  // fetch data...
  return models;
}, "models"); // cache key
```

Consume in components with `createAsync`:

```tsx
const models = createAsync(() => getModels());
```

## Existing Server Functions

| Function             | File                               | Purpose                              |
|----------------------|------------------------------------|--------------------------------------|
| `getModels`          | `src/lib/models.ts`                | Return available LLM models          |
| `read_document`      | `src/lib/dataCleaning/convert_to_markdown.ts` | Read a file, auto-convert to markdown |
| `convert_to_markdown`| `src/lib/dataCleaning/convert_to_markdown.ts` | Convert docx/pdf/pptx/xls to markdown |
| `get_raw_doc_path`   | `src/lib/dataCleaning/convert_to_markdown.ts` | Read `RAW_DOC_PATH` env variable     |
