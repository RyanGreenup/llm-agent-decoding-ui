import { defineConfig } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  server: {
    plugins: ["./src/server/process-errors.ts"],
  },
  vite: {
    plugins: [tailwindcss()],
    server: {
      allowedHosts: ["pds.demo.vale"],
    },
  },
});
