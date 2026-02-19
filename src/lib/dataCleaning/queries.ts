"use server";

import { action, query } from "@solidjs/router";
import {
  getRawDocPath,
  convertToMarkdownPandoc,
} from "./convert_to_markdown";

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
