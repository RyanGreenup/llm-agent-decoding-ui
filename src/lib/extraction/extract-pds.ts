"use server";

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { PdsSchema, type PdsData } from "./pds-schema";
import { readDocument } from "~/lib/dataCleaning/convert_to_markdown";
import { DEFAULT_MODEL_ID } from "../config";

let _client: OpenAI | undefined;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI(); // reads OPENAI_API_KEY from env
  }
  return _client;
}

const SYSTEM_PROMPT = `You are a specialist data-extraction assistant for Australian superannuation Product Disclosure Statements (PDS).

Your task is to read the provided PDS markdown and extract structured data into the given JSON schema.

CRITICAL DISTINCTION — current vs legacy products:
- "currentProducts" contains products and fees that are OPEN to all members (typically described in Section 7 of the PDS). These apply to anyone who joins today.
- "legacyProducts" contains products and fees that are CLOSED and only available to grandfathered members who joined before a specific cutoff date (typically described in Section 9 of the PDS).
- Never mix current fees with legacy fees. If a fee only applies to legacy members, it belongs in legacyProducts.fees, not currentProducts.fees.

Extract values exactly as they appear in the document. For numeric fields (e.g. preservationAge), return the number. For string fields, return the text verbatim. If a field is not mentioned in the document, return null.`;

export async function extractPdsData(markdown: string): Promise<PdsData> {
  "use server";
  const client = getClient();

  const completion = await client.chat.completions.parse({
    model: DEFAULT_MODEL_ID,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: markdown },
    ],
    response_format: zodResponseFormat(PdsSchema, "pds_extraction"),
  });

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) {
    throw new Error(
      "Structured extraction failed: no parsed response returned",
    );
  }
  return parsed;
}

export async function extractPdsFromFile(path: string): Promise<PdsData> {
  "use server";
  const markdown = await readDocument(path);
  return extractPdsData(markdown);
}
