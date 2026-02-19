"use server";

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { PdsSchema, type PdsData } from "./pds-schema";
import { readDocument } from "~/lib/dataCleaning/convert_to_markdown";
import { getRawDocPath } from "~/lib/dataCleaning/convert_to_markdown";
import { validateExtraction } from "./validate-extraction";
import { DEFAULT_MODEL_ID, MAX_REFLECTION_ROUNDS } from "../config";
import { getOpenAIClient } from "../openai/server";
import { requireUser } from "~/lib/auth";
import {
  createSession,
  getSession as getExtractionSession,
  deleteSession,
} from "./session";
import type {
  ExtractionResult,
  ExtractionRound,
  ExtractionTrace,
  TokenUsage,
} from "../types";

// ── Prompts & config ────────────────────────────────────────────

// MAX_REFLECTION_ROUNDS imported from ~/lib/config (shared, not server-only)

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

// ── RPC entry points ────────────────────────────────────────────

export type StartExtractionResult = {
  sessionId: string;
  path: string;
  round: ExtractionRound;
  data: PdsData;
  trace: ExtractionTrace;
};

export type ContinueExtractionResult = {
  round: ExtractionRound;
  data: PdsData;
  trace: ExtractionTrace;
  done: boolean;
};

/**
 * Start a new extraction pipeline: reads the document, runs the initial
 * extractAndValidate round, stores the session for continuation, and
 * returns the first round result.
 */
export async function startExtraction(): Promise<StartExtractionResult> {
  "use server";
  await requireUser();

  const path = await getRawDocPath();
  const markdown = await readDocument(path);
  const client = await getOpenAIClient();
  const pipelineStart = performance.now();

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
    { role: "user", content: markdown },
  ];

  const result = await extractAndValidate(
    client,
    messages,
    markdown,
    0,
    "initial_extraction",
    null,
  );

  const rounds = [result.round];
  const trace = buildTrace(rounds, pipelineStart);

  // Store session so the client can call continueExtraction
  const sessionId = createSession(markdown, messages);

  return {
    sessionId,
    path,
    round: result.round,
    data: result.parsed,
    trace,
  };
}

/**
 * Continue an extraction session with a reflection round.
 * Looks up the session, appends the previous assistant response + validator
 * feedback, runs reflectAndValidate, and returns the new round.
 */
export async function continueExtraction(
  sessionId: string,
): Promise<ContinueExtractionResult> {
  "use server";
  await requireUser();

  const session = getExtractionSession(sessionId);
  const client = await getOpenAIClient();
  const pipelineStart = performance.now();

  // The messages array already has the reflection prompt appended from the
  // previous round's extractAndValidate call. Derive round metadata from
  // the conversation history.
  const { messages, markdown } = session;

  // User messages after the initial document message = reflection count
  const userMessages = messages.filter((m) => m.role === "user");
  const reflectionIndex = userMessages.length - 1;

  // Extract validation feedback from the last reflection prompt
  const lastReflectionMsg = [...messages].reverse().find(
    (m) =>
      m.role === "user" &&
      typeof m.content === "string" &&
      m.content.startsWith(REFLECTION_PROMPT),
  );
  const validationFeedback = lastReflectionMsg
    ? (lastReflectionMsg.content as string).slice(REFLECTION_PROMPT.length).trim()
    : null;

  const result = await extractAndValidate(
    client,
    messages,
    markdown,
    reflectionIndex,
    "reflection",
    validationFeedback,
  );

  const done = result.round.passed;
  const trace = buildTrace([result.round], pipelineStart);

  if (done) {
    deleteSession(sessionId);
  }

  return {
    round: result.round,
    data: result.parsed,
    trace,
    done,
  };
}

// ── Server-to-server convenience ─────────────────────────────────

/** Run the full extraction pipeline in one shot (no session needed). */
export async function extractPdsData(
  markdown: string,
): Promise<ExtractionResult> {
  "use server";
  const client = await getOpenAIClient();
  const pipelineStart = performance.now();
  const rounds: ExtractionRound[] = [];

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
    { role: "user", content: markdown },
  ];

  let result = await extractAndValidate(
    client, messages, markdown, 0, "initial_extraction", null,
  );
  rounds.push(result.round);

  for (let i = 1; i <= MAX_REFLECTION_ROUNDS && !result.round.passed; i++) {
    result = await extractAndValidate(
      client, messages, markdown, i, "reflection", result.round.validationFeedback,
    );
    rounds.push(result.round);
  }

  return { data: result.parsed, trace: buildTrace(rounds, pipelineStart) };
}

// ── Pipeline steps ──────────────────────────────────────────────

interface RoundOutput {
  round: ExtractionRound;
  parsed: PdsData;
  messageContent: string;
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

  // Append the assistant's response to the conversation for potential future reflection
  messages.push({ role: "assistant", content: message.content ?? "" });

  // If validation failed, append the reflection prompt so the next call can continue
  if (feedback) {
    messages.push({
      role: "user",
      content: `${REFLECTION_PROMPT}\n\n${feedback}`,
    });
  }

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
