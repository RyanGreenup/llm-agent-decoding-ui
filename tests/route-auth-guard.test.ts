import { describe, it, expect } from "vitest";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

/** Recursively find page route files under a directory */
async function findPageRoutes(dir: string): Promise<string[]> {
  const pages: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      pages.push(...(await findPageRoutes(full)));
      continue;
    }
    if (!entry.name.endsWith(".tsx")) continue;
    // Skip layout wrappers like (reports).tsx
    if (/^\(.+\)\.tsx$/.test(entry.name)) continue;
    // Skip non-page files (e.g. photo-viewer.shortcuts.tsx)
    if (entry.name.includes(".shortcuts.")) continue;

    const src = await readFile(full, "utf-8");
    if (!src.includes("export default")) continue;
    pages.push(full);
  }
  return pages;
}

// CI counterpart to src/vite/enforce-auth-guard.ts.
// Stricter: also verifies the import comes from ~/lib/auth,
// not just that the function name appears in the source.
describe("(app) route auth guard", () => {
  it("every page route calls createProtectedRoute", async () => {
    const root = join(process.cwd(), "src/routes/(app)");
    const pages = await findPageRoutes(root);
    expect(pages.length).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const file of pages) {
      const rel = file.replace(process.cwd() + "/", "");
      // Admin routes are checked separately
      if (rel.includes("/admin/")) continue;

      const src = await readFile(file, "utf-8");
      const hasImport = /import\s.*createProtectedRoute.*from\s+["']~\/lib\/auth["']/.test(src);
      const hasCall = src.includes("createProtectedRoute(");
      if (!hasImport || !hasCall) {
        missing.push(rel);
      }
    }

    expect(missing, [
      "These (app) routes are missing createProtectedRoute():",
      ...missing.map((f) => `  - ${f}`),
      "",
      "Every page route must call createProtectedRoute().",
    ].join("\n")).toEqual([]);
  });

  it("every admin route calls createProtectedStaffRoute", async () => {
    const root = join(process.cwd(), "src/routes/(app)/admin");
    let pages: string[];
    try {
      pages = await findPageRoutes(root);
    } catch {
      // admin directory doesn't exist yet — nothing to check
      return;
    }
    if (pages.length === 0) return;

    const missing: string[] = [];
    for (const file of pages) {
      const rel = file.replace(process.cwd() + "/", "");
      const src = await readFile(file, "utf-8");
      const hasImport = /import\s.*createProtectedStaffRoute.*from\s+["']~\/lib\/auth["']/.test(src);
      const hasCall = src.includes("createProtectedStaffRoute(");
      if (!hasImport || !hasCall) {
        missing.push(rel);
      }
    }

    expect(missing, [
      "These admin routes are missing createProtectedStaffRoute():",
      ...missing.map((f) => `  - ${f}`),
      "",
      "Every admin page route must call createProtectedStaffRoute().",
    ].join("\n")).toEqual([]);
  });
});
