"use server";

import { query } from "@solidjs/router";
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
