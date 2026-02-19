// Polyfill DOMMatrix/Path2D for pdf.js (loaded eagerly by markitdown-ts)
if (typeof globalThis.DOMMatrix === "undefined") {
  // @ts-expect-error minimal shim — only needed so pdf.js doesn't crash on import
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() {
      return Object.assign(this, {
        a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
        is2D: true, isIdentity: true,
      });
    }
  };
}
if (typeof globalThis.Path2D === "undefined") {
  // @ts-expect-error minimal shim
  globalThis.Path2D = class Path2D {};
}

// Dynamic import so polyfills are installed before markitdown-ts loads pdf.js
const { resolve } = await import("node:path");
const { convert_to_markdown } = await import(
  "./src/lib/dataCleaning/convert_to_markdown.ts"
);

const docPath = resolve("data/Product Disclosure Statement (PDS).docx");
const markdown = await convert_to_markdown(docPath);
console.log(markdown);
