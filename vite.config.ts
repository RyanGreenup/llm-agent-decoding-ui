import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    solidStart(),
    tailwindcss(),
    nitro(),
  ],
  server: {
    allowedHosts: ["pds.demo.vale"],
  },
  nitro: {
    preset: "bun",
    plugins: ["./src/server/process-errors.ts"],
    rolldownConfig: {
      external: ["@lancedb/lancedb", "jsdom"],
    },
  },
});
