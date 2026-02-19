"use server";

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { PdsSchema, type PdsData } from "./pds-schema";
import { readDocument } from "~/lib/dataCleaning/convert_to_markdown";
import { validateExtraction } from "./validate-extraction";
import { DEFAULT_MODEL_ID } from "../config";

let _client: OpenAI | undefined;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI(); // reads OPENAI_API_KEY from env
  }
  return _client;
}

/** Cap reflection rounds to bound context growth and API cost. */
const MAX_REFLECTION_ROUNDS = 2;

const SYSTEM_PROMPT = `You are a specialist data-extraction assistant for Australian superannuation Product Disclosure Statements (PDS).

Your task is to read the provided PDS markdown and extract structured data into the given JSON schema.

CRITICAL DISTINCTION — current vs legacy products:
- "currentProducts" contains products and fees that are OPEN to all members (typically described in Section 7 of the PDS). These apply to anyone who joins today.
- "legacyProducts" contains products and fees that are CLOSED and only available to grandfathered members who joined before a specific cutoff date (typically described in Section 9 of the PDS).
- Never mix current fees with legacy fees. If a fee only applies to legacy members, it belongs in legacyProducts.fees, not currentProducts.fees.

Extract values exactly as they appear in the document. For numeric fields (e.g. preservationAge), return the number. For string fields, return the text verbatim. If a field is not mentioned in the document, return null.`;

const REFLECTION_PROMPT = `A deterministic validator compared your extraction against the source markdown and found problems. For each issue listed below, re-read the relevant section of the document and correct the value.

Rules:
- If the validator says a value could not be found, search the document again carefully. Copy the value verbatim — do not paraphrase, round, or infer.
- If the document genuinely does not contain the value, return null for that field.
- Do not change fields that passed validation.

Validator report:`;

export async function extractPdsData(markdown: string): Promise<PdsData> {
  "use server";
  const client = getClient();

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: markdown },
  ];

  let lastParsed: PdsData | undefined;

  for (let attempt = 0; attempt <= MAX_REFLECTION_ROUNDS; attempt++) {
    const completion = await client.chat.completions.parse({
      model: DEFAULT_MODEL_ID,
      temperature: 0,
      messages,
      response_format: zodResponseFormat(PdsSchema, "pds_extraction"),
    });

    const message = completion.choices[0]?.message;
    const parsed = message?.parsed;
    if (!parsed) {
      throw new Error(
        "Structured extraction failed: no parsed response returned",
      );
    }
    lastParsed = parsed;

    const feedback = validateExtraction(parsed, markdown);
    if (!feedback) return parsed; // all fields grounded — done

    if (attempt < MAX_REFLECTION_ROUNDS) {
      // Append the assistant's answer + validator feedback for the next round.
      messages.push(
        { role: "assistant", content: message.content ?? "" },
        { role: "user", content: `${REFLECTION_PROMPT}\n\n${feedback}` },
      );
    }
  }

  // Retries exhausted — return best effort.
  console.warn(
    `Extraction grounding check still failing after ${MAX_REFLECTION_ROUNDS} reflection rounds.`,
  );
  return lastParsed!;
}

export async function extractPdsFromFile(path: string): Promise<PdsData> {
  "use server";
  const markdown = await readDocument(path);
  return extractPdsData(markdown);
}

// DONE implement a deterministic validator → validate-extraction.ts
// DONE Change system prompt for reflection, preserve context history
// DONE Ensure context history is not exceeded → bounded by MAX_REFLECTION_ROUNDS
// DONE Ensure it is finite in execution → bounded by MAX_REFLECTION_ROUNDS
//      TODO Is this sufficient though?
// TODO Use a follow up agent to catch anything else
// TODO Surface remaining validation issues to the caller
