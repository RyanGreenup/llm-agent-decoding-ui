"use server";

import { basename, extname } from "node:path";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileTypeFromFile } from "file-type";
import { MarkItDown } from "markitdown-ts";
import * as prettier from "prettier";
import { docLog } from "~/lib/logger";

const _MARKITDOWN_SUFFIXES = new Set([
  ".docx",
  ".pdf",
  ".pptx",
  ".xls",
  ".xlsx",
]);

async function _warn_if_magic_mismatch(
  path: string,
): Promise<string | undefined> {
  const kind = await fileTypeFromFile(path);
  if (!kind) return;

  const declared = extname(path).slice(1).toLowerCase();
  const detected = kind.ext.toLowerCase();
  if (declared && declared !== detected) {
    docLog.warn("doc.magic_mismatch", { path: basename(path), declared, detected });
  }
  return `.${detected}`;
}

export async function read_document(path: string): Promise<string> {
  "use server";
  const t0 = performance.now();
  docLog.debug("doc.read.start", { path });
  const detected_suffix = await _warn_if_magic_mismatch(path);
  let result: string;
  if (detected_suffix) {
    if (_MARKITDOWN_SUFFIXES.has(detected_suffix)) {
      result = await convert_to_markdown(path);
    } else {
      result = await readFile(path, "utf8");
    }
  } else if (_MARKITDOWN_SUFFIXES.has(extname(path).toLowerCase())) {
    result = await convert_to_markdown(path);
  } else {
    result = await readFile(path, "utf8");
  }
  docLog.debug("doc.read.done", { path, chars: result.length, durationMs: Math.round(performance.now() - t0) });
  return result;
}

export async function convert_to_markdown(
  source: string,
  {
    skip_format = false,
  }: {
    skip_format?: boolean;
  } = {},
): Promise<string> {
  "use server";
  const md = new MarkItDown();
  const result = await md.convert(source);
  const markdown = result?.markdown;
  if (typeof markdown !== "string") {
    throw new Error("Conversion failed: no markdown returned");
  }
  if (skip_format) return markdown;
  return await prettier.format(markdown, { parser: "markdown" });
}

const execFileAsync = promisify(execFile);

// Handles tables better than markitdown-ts — pandoc produces proper
// GitHub-Flavored Markdown pipe tables with alignment indicators.
export async function convert_to_markdown_pandoc(
  source: string,
  {
    skip_format = false,
  }: {
    skip_format?: boolean;
  } = {},
): Promise<string> {
  "use server";
  const { stdout } = await execFileAsync("pandoc", [
    source,
    "-f",
    "docx",
    "-t",
    "gfm",
    "--wrap=none",
  ]);
  if (!stdout) {
    throw new Error("Pandoc conversion failed: no output");
  }
  if (skip_format) return stdout;
  return await prettier.format(stdout, { parser: "markdown" });
}

export async function get_raw_doc_path(): Promise<string> {
  "use server";
  const raw = process.env.RAW_DOC_PATH;
  if (!raw) {
    throw new Error("RAW_DOC_PATH environment variable is not set");
  }
  return raw;
}

export const readDocument = read_document;
export const convertToMarkdown = convert_to_markdown;
export const convertToMarkdownPandoc = convert_to_markdown_pandoc;
export const getRawDocPath = get_raw_doc_path;
