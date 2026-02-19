# LLM Agent

A chat interface for querying the NovigiSuper Product Disclosure Statement. Users ask plain-language questions and the agent searches the document, calculates figures, and verifies answers against the source.

## Stack

| Layer        | Technology                          |
|------------- |-------------------------------------|
| Framework    | SolidJS + SolidStart                |
| Router       | @solidjs/router (file-based)        |
| Build        | Vinxi                               |
| Styling      | Tailwind CSS v4 + DaisyUI v5        |
| Package mgr  | Bun                                 |
| Language     | TypeScript 5.9 (strict)             |
| Runtime      | Node.js >= 22                       |
| Container    | Docker (oven/bun image)             |

## Source Layout

```
src/
├── routes/           File-based pages
│   ├── index.tsx     Home — chat interface
│   ├── about.tsx     About page
│   └── [...404].tsx  Catch-all 404
├── components/       Reusable SolidJS components
├── lib/
│   ├── types.ts      Shared type definitions
│   ├── config.ts     Constants (default model, logos)
│   ├── models.ts     Model list + server query
│   └── dataCleaning/ Document-to-markdown pipeline
├── app.tsx           Root router + layout
├── app.css           Theme definitions
├── entry-client.tsx  Client hydration
└── entry-server.tsx  SSR shell
```
