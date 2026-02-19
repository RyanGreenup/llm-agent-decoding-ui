"use server";

import { action, query } from "@solidjs/router";
import { basename, extname } from "node:path";
import { readFile } from "node:fs/promises";
import {
  getRawDocPath,
  convertToMarkdownPandoc,
} from "./convert_to_markdown";
import { getUser } from "~/lib/auth";

export const getConvertedDocument = query(async () => {
  "use server";
  const path = await getRawDocPath();
  const markdown = await convertToMarkdownPandoc(path);
  return { path, markdown };
}, "convertedDocument");

export const reconvertDocument = action(async () => {
  "use server";
  // Action completion triggers automatic revalidation of route queries
}, "reconvertDocument");

export async function downloadDocument(
  format: "docx" | "markdown",
): Promise<{
  filename: string;
  mimeType: string;
  dataBase64: string;
}> {
  "use server";
  await getUser();

  const sourcePath = await getRawDocPath();
  const sourceBase = basename(sourcePath, extname(sourcePath));

  if (format === "docx") {
    const bytes = await readFile(sourcePath);
    return {
      filename: `${sourceBase}.docx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      dataBase64: bytes.toString("base64"),
    };
  }

  const markdown = await convertToMarkdownPandoc(sourcePath);
  return {
    filename: `${sourceBase}.md`,
    mimeType: "text/markdown; charset=utf-8",
    dataBase64: Buffer.from(markdown, "utf8").toString("base64"),
  };
}
