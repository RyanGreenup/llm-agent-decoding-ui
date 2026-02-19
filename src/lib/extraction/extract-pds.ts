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

// ── shared: call LLM + validate ─────────────────────────────────

interface RoundOutput {
  round: ExtractionRound;
  parsed: PdsData;
  messageContent: string;
}

async function callAndValidate(
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

// ── Step 1: Forward pass ────────────────────────────────────────
// Fresh LLM call that produces structured JSON from the markdown.

async function forwardPass(
  client: OpenAI,
  messages: OpenAI.ChatCompletionMessageParam[],
  markdown: string,
): Promise<RoundOutput> {
  return callAndValidate(client, messages, markdown, 0, "initial_extraction", null);
}

// ── Steps 2-3: Reflect ──────────────────────────────────────────
// Appends the previous answer + validator feedback to the conversation,
// then calls the LLM again so it can self-correct.

async function reflect(
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

  return callAndValidate(
    client, messages, markdown,
    reflectionIndex, "reflection", previous.round.validationFeedback,
  );
}

// ── pipeline ────────────────────────────────────────────────────

export async function extractPdsData(
  markdown: string,
): Promise<ExtractionResult> {
  "use server";
  const client = getClient();
  const pipelineStart = performance.now();
  const rounds: ExtractionRound[] = [];

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: markdown },
  ];

  // Step 1: Forward pass
  let result = await forwardPass(client, messages, markdown);
  rounds.push(result.round);

  if (result.round.passed) {
    return { data: result.parsed, trace: buildTrace(rounds, pipelineStart) };
  }

  // Steps 2-3: Reflect (bounded by MAX_REFLECTION_ROUNDS).
  // Step 4 (independent LLM verification) runs after this loop —
  // see verify-extraction.ts.
  for (let i = 1; i <= MAX_REFLECTION_ROUNDS; i++) {
    result = await reflect(client, messages, markdown, result, i);
    rounds.push(result.round);

    if (result.round.passed) {
      return { data: result.parsed, trace: buildTrace(rounds, pipelineStart) };
    }
  }

  // Retries exhausted — return best effort.
  console.warn(
    `Extraction grounding check still failing after ${MAX_REFLECTION_ROUNDS} reflection rounds.`,
  );
  return { data: result.parsed, trace: buildTrace(rounds, pipelineStart) };
}

export async function extractPdsFromFile(
  path: string,
): Promise<ExtractionResult> {
  "use server";
  const markdown = await readDocument(path);
  return extractPdsData(markdown);
}
