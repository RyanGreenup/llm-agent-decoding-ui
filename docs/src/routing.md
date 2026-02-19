# Routing

## File-Based Routes

SolidStart uses `<FileRoutes />` to map files in `src/routes/` to URL paths:

| File                | URL       |
|---------------------|-----------|
| `routes/index.tsx`  | `/`       |
| `routes/about.tsx`  | `/about`  |
| `routes/[...404].tsx` | any unmatched path |

The `[...404].tsx` catch-all handles undefined routes.

## Route Preloading

Routes can export a `route` object to preload data before the component renders. The home page preloads the model list:

```tsx
import { type RouteDefinition } from "@solidjs/router";
import { getModels } from "~/lib/models";

export const route = {
  preload: () => {
    getModels();
  },
} satisfies RouteDefinition;
```

`getModels()` is a server function wrapped with `query()`. Calling it in `preload` starts the fetch early so data is ready when the component mounts.

## Async Data in Components

Inside the component, use `createAsync` to subscribe to the preloaded query:

```tsx
const models = createAsync(() => getModels());

// models() returns Model[] | undefined
// undefined while loading, then the resolved value
```

## Adding a New Route

1. Create `src/routes/my-page.tsx`
2. Export a default component
3. Optionally export a `route` object with `preload`
4. The page is available at `/my-page`
