"use server";

import { basename, extname } from "node:path";
import { readFile } from "node:fs/promises";
import { fileTypeFromFile } from "file-type";
import { MarkItDown } from "markitdown-ts";
import * as prettier from "prettier";

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
    console.error(
      `Warning: '${basename(
        path,
      )}' has extension .${declared} but magic bytes indicate .${detected}`,
    );
  }
  return `.${detected}`;
}

export async function read_document(path: string): Promise<string> {
  "use server";
  const detected_suffix = await _warn_if_magic_mismatch(path);
  if (detected_suffix) {
    if (_MARKITDOWN_SUFFIXES.has(detected_suffix)) {
      return await convert_to_markdown(path);
    }
    return await readFile(path, "utf8");
  }
  if (_MARKITDOWN_SUFFIXES.has(extname(path).toLowerCase())) {
    return await convert_to_markdown(path);
  }
  return await readFile(path, "utf8");
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
export const getRawDocPath = get_raw_doc_path;
