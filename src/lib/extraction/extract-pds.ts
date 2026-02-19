"use server";

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { PdsSchema, type PdsData } from "./pds-schema";
import { readDocument } from "~/lib/dataCleaning/convert_to_markdown";
import { validateExtraction } from "./validate-extraction";
import { DEFAULT_MODEL_ID } from "../config";
import type {
  ExtractionRound,
  ExtractionTrace,
  ExtractionResult,
  TokenUsage,
} from "../types";

// ── Prompts & config ────────────────────────────────────────────

const MAX_REFLECTION_ROUNDS = 2;

const EXTRACTION_SYSTEM_PROMPT = `You are a specialist data-extraction assistant for Australian superannuation Product Disclosure Statements (PDS).

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

// ── Pipeline entry points ───────────────────────────────────────

interface RoundOutput {
  round: ExtractionRound;
  parsed: PdsData;
  messageContent: string;
}

/** Extract structured PDS data from markdown, reflecting on validation failures up to N times. */
export async function extractPdsData(
  markdown: string,
): Promise<ExtractionResult> {
  "use server";
  const client = getClient();
  const pipelineStart = performance.now();
  const rounds: ExtractionRound[] = [];

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
    { role: "user", content: markdown },
  ];

  // Initial extraction
  let result = await extractAndValidate(client, messages, markdown, 0, "initial_extraction", null);
  rounds.push(result.round);

  // Feed validation failures back for self-correction
  for (let i = 1; i <= MAX_REFLECTION_ROUNDS && !result.round.passed; i++) {
    result = await reflectAndValidate(client, messages, markdown, result, i);
    rounds.push(result.round);
  }

  if (!result.round.passed) {
    console.warn(
      `Extraction grounding check still failing after ${MAX_REFLECTION_ROUNDS} reflection rounds.`,
    );
  }

  return { data: result.parsed, trace: buildTrace(rounds, pipelineStart) };
}

/** Read a document from disk and run the extraction pipeline. */
export async function extractPdsFromFile(
  path: string,
): Promise<ExtractionResult> {
  "use server";
  const markdown = await readDocument(path);
  return extractPdsData(markdown);
}

// ── Pipeline steps ──────────────────────────────────────────────

/** Append the previous answer + validator feedback to the conversation, then re-extract. */
async function reflectAndValidate(
  client: OpenAI,
  messages: OpenAI.ChatCompletionMessageParam[],
  markdown: string,
  previous: RoundOutput,
  reflectionIndex: number,
): Promise<RoundOutput> {
  messages.push(
    { role: "assistant", content: previous.messageContent },
    { role: "user", content: `${REFLECTION_PROMPT}\n\n${previous.round.validationFeedback}` },
  );

  return extractAndValidate(
    client, messages, markdown,
    reflectionIndex, "reflection", previous.round.validationFeedback,
  );
}

/** Call the LLM for structured extraction, then validate the result against source markdown. */
async function extractAndValidate(
  client: OpenAI,
  messages: OpenAI.ChatCompletionMessageParam[],
  markdown: string,
  roundIndex: number,
  role: ExtractionRound["role"],
  input: string | null,
): Promise<RoundOutput> {
  const t0 = performance.now();

  const completion = await client.chat.completions.parse({
    model: DEFAULT_MODEL_ID,
    temperature: 0,
    messages,
    response_format: zodResponseFormat(PdsSchema, "pds_extraction"),
  });

  const durationMs = performance.now() - t0;
  const message = completion.choices[0]?.message;
  const parsed = message?.parsed;

  if (!parsed) {
    throw new Error(
      "Structured extraction failed: no parsed response returned",
    );
  }

  const feedback = validateExtraction(parsed, markdown);

  return {
    round: {
      round: roundIndex,
      role,
      input,
      rawOutput: message.content ?? "",
      snapshot: parsed,
      validationFeedback: feedback,
      passed: !feedback,
      usage: toTokenUsage(completion.usage),
      durationMs,
      model: DEFAULT_MODEL_ID,
    },
    parsed,
    messageContent: message.content ?? "",
  };
}

// ── Utilities ───────────────────────────────────────────────────

let _client: OpenAI | undefined;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI(); // reads OPENAI_API_KEY from env
  }
  return _client;
}

function toTokenUsage(
  usage: OpenAI.Completions.CompletionUsage | undefined,
): TokenUsage | null {
  if (!usage) return null;
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

function buildTrace(
  rounds: ExtractionRound[],
  pipelineStartMs: number,
): ExtractionTrace {
  const totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  for (const r of rounds) {
    if (r.usage) {
      totalUsage.promptTokens += r.usage.promptTokens;
      totalUsage.completionTokens += r.usage.completionTokens;
      totalUsage.totalTokens += r.usage.totalTokens;
    }
  }
  return {
    rounds,
    totalDurationMs: performance.now() - pipelineStartMs,
    totalUsage,
    finalPassed: rounds.at(-1)?.passed ?? false,
    reflectionCount: rounds.filter((r) => r.role === "reflection").length,
    model: DEFAULT_MODEL_ID,
  };
}
