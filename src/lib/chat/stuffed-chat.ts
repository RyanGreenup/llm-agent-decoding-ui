"use server";

import OpenAI from "openai";
import type { RunnableToolFunctionWithoutParse } from "openai/lib/RunnableFunction";
import type { ChatCompletion } from "openai/resources/chat/completions";
import { DEFAULT_MODEL_ID } from "~/lib/config";
import { readDocument } from "~/lib/dataCleaning/convert_to_markdown";
import { extractPdsData } from "~/lib/extraction/extract-pds";
import { getOpenAIClient } from "~/lib/openai/server";
import type { PdsData } from "~/lib/extraction/pds-schema";
import { getModels } from "~/lib/models";
import {
  buildRoundFromCompletion,
  createTrace,
  finalizeTraceError,
  finalizeTraceSuccess,
  type StuffedChatTraceEvent,
  type StuffedChatResult,
  type ToolAudit,
} from "~/lib/chat/stuffed-chat-auditing";
export type {
  StuffedChatResult,
  StuffedChatRoundTrace,
  StuffedChatToolCallTrace,
  StuffedChatTrace,
  StuffedChatTraceEvent,
} from "~/lib/chat/stuffed-chat-auditing";

const BASE_SYSTEM_PROMPT = `# Identity
You are a precise document analyst helping a user understand a document.

# Instructions
- Ground every answer in the document. Quote or paraphrase the relevant passage.
- When asked for a recommendation, surface the facts the document provides — fees, risks, options, conditions — so the user can form their own view.
- If the document contains a general-advice disclaimer, note it briefly but still present the relevant facts.
- Only say the document doesn't cover something when it is genuinely silent on the topic.

# Tools
You have access to tools. Use them when appropriate:
- **extract_pds_data**: Call this when you need precise structured data — specific fee amounts, preservation ages, investment option details, or current-vs-legacy comparisons. Returns a structured JSON object with clearly separated current and legacy product data.
- **get_models**: Call this when the user asks about available LLM models, their pricing, or capabilities.

Prefer using extract_pds_data over manually scanning the raw document when answering questions about specific fees, numbers, or product comparisons.`;

const MAX_TOOL_ROUNDS = 5;

// Cache extracted PDS data per document path to avoid repeated LLM calls.
// Bounded FIFO: evicts the oldest entry when the limit is reached.
const PDS_CACHE_MAX = 20;
const _pdsCache = new Map<string, PdsData>();
const TOOL_RESULT_PREVIEW_MAX = 1600;

function pdsCacheSet(key: string, value: PdsData): void {
  if (_pdsCache.size >= PDS_CACHE_MAX && !_pdsCache.has(key)) {
    const oldest = _pdsCache.keys().next().value!;
    _pdsCache.delete(oldest);
  }
  _pdsCache.set(key, value);
}

function stringifyToolResult(result: unknown): string {
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function toToolPreview(serialized: string): {
  resultPreview: string;
  resultSizeBytes: number;
  resultTruncated: boolean;
} {
  const resultSizeBytes = new TextEncoder().encode(serialized).length;
  if (serialized.length <= TOOL_RESULT_PREVIEW_MAX) {
    return { resultPreview: serialized, resultSizeBytes, resultTruncated: false };
  }
  return {
    resultPreview: `${serialized.slice(0, TOOL_RESULT_PREVIEW_MAX)}...`,
    resultSizeBytes,
    resultTruncated: true,
  };
}

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function buildTools(
  documentText: string,
  documentPath: string,
  audit: ToolAudit,
): RunnableToolFunctionWithoutParse[] {
  return [
    {
      type: "function",
      function: {
        name: "extract_pds_data",
        description:
          "Extract structured data from the PDS document. Returns fees, products (current vs legacy), investment options, preservation ages, insurance, and taxation as structured JSON. Use this for precise numeric lookups and current-vs-legacy comparisons.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
          additionalProperties: false,
        },
        function: async (rawArgs: string) => {
          const started = performance.now();
          const startedAt = new Date().toISOString();
          let cached = false;
          try {
            let data = _pdsCache.get(documentPath);
            if (!data) {
              const result = await extractPdsData(documentText);
              data = result.data;
              pdsCacheSet(documentPath, data);
            } else {
              cached = true;
            }
            const serialized = stringifyToolResult(data);
            const preview = toToolPreview(serialized);
            audit.onToolCall({
              name: "extract_pds_data",
              startedAt,
              durationMs: performance.now() - started,
              arguments: rawArgs || "{}",
              resultPreview: preview.resultPreview,
              resultSizeBytes: preview.resultSizeBytes,
              resultTruncated: preview.resultTruncated,
              cached,
              success: true,
              error: null,
            });
            return serialized;
          } catch (e) {
            console.error("extract_pds_data failed:", e);
            const serialized = JSON.stringify({ error: "Failed to extract document data." });
            const preview = toToolPreview(serialized);
            audit.onToolCall({
              name: "extract_pds_data",
              startedAt,
              durationMs: performance.now() - started,
              arguments: rawArgs || "{}",
              resultPreview: preview.resultPreview,
              resultSizeBytes: preview.resultSizeBytes,
              resultTruncated: preview.resultTruncated,
              cached,
              success: false,
              error: e instanceof Error ? e.message : String(e),
            });
            return serialized;
          }
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_models",
        description:
          "Get the list of available LLM models with their provider, context window size, pricing, and review status.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
          additionalProperties: false,
        },
        function: async (rawArgs: string) => {
          const started = performance.now();
          const startedAt = new Date().toISOString();
          try {
            const models = await getModels();
            const serialized = stringifyToolResult(models);
            const preview = toToolPreview(serialized);
            audit.onToolCall({
              name: "get_models",
              startedAt,
              durationMs: performance.now() - started,
              arguments: rawArgs || "{}",
              resultPreview: preview.resultPreview,
              resultSizeBytes: preview.resultSizeBytes,
              resultTruncated: preview.resultTruncated,
              cached: false,
              success: true,
              error: null,
            });
            return serialized;
          } catch (e) {
            console.error("get_models failed:", e);
            const serialized = JSON.stringify({ error: "Failed to retrieve models." });
            const preview = toToolPreview(serialized);
            audit.onToolCall({
              name: "get_models",
              startedAt,
              durationMs: performance.now() - started,
              arguments: rawArgs || "{}",
              resultPreview: preview.resultPreview,
              resultSizeBytes: preview.resultSizeBytes,
              resultTruncated: preview.resultTruncated,
              cached: false,
              success: false,
              error: e instanceof Error ? e.message : String(e),
            });
            return serialized;
          }
        },
      },
    },
  ];
}

async function runStuffedChat(
  question: string,
  documentPath: string,
  history: ChatMessage[],
  options?: {
    model?: string;
    onDelta?: (delta: string) => void;
    onTraceEvent?: (event: StuffedChatTraceEvent) => void;
  },
): Promise<StuffedChatResult> {
  const client = await getOpenAIClient();
  const text = await readDocument(documentPath);
  const selectedModel = options?.model || DEFAULT_MODEL_ID;
  const started = performance.now();
  const startedAt = new Date().toISOString();
  const trace = createTrace({
    question,
    documentPath,
    model: selectedModel,
    historyCount: history.length,
    documentChars: text.length,
    startedAt,
  });
  options?.onTraceEvent?.({ type: "trace_started", trace: { ...trace } });

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: BASE_SYSTEM_PROMPT },
    {
      role: "user",
      content: `<document>\n${text}\n</document>`,
    },
    ...history.map(
      (m): OpenAI.ChatCompletionMessageParam => ({
        role: m.role,
        content: m.content,
      }),
    ),
    { role: "user", content: question },
  ];

  try {
    let content = "";
    let usage: OpenAI.Completions.CompletionUsage | undefined;
    let completions: ChatCompletion[] = [];
    if (options?.onDelta) {
      const runner = client.chat.completions.runTools(
        {
          model: selectedModel,
          stream: true,
          messages,
          tools: buildTools(text, documentPath, {
            onToolCall: (entry) => {
              trace.toolCalls.push(entry);
              options?.onTraceEvent?.({ type: "tool_call", toolCall: entry });
            },
          }),
        },
        { maxChatCompletions: MAX_TOOL_ROUNDS },
      );
      let roundCounter = 0;
      let prevCreated: number | undefined;
      runner.on("chatCompletion", (completion) => {
        const round = buildRoundFromCompletion({
          completion,
          round: roundCounter,
          fallbackModel: selectedModel,
          prevCreated,
        });
        trace.rounds.push(round);
        options?.onTraceEvent?.({ type: "round_completed", round });
        roundCounter += 1;
        prevCreated = completion.created;
      });
      runner.on("content", (delta: string) => {
        if (delta) options.onDelta?.(delta);
      });
      content = (await runner.finalContent()) ?? "";
      usage = await runner.totalUsage();
      completions = runner.allChatCompletions();
    } else {
      const runner = client.chat.completions.runTools(
        {
          model: selectedModel,
          stream: false,
          messages,
          tools: buildTools(text, documentPath, {
            onToolCall: (entry) => {
              trace.toolCalls.push(entry);
              options?.onTraceEvent?.({ type: "tool_call", toolCall: entry });
            },
          }),
        },
        { maxChatCompletions: MAX_TOOL_ROUNDS },
      );
      let roundCounter = 0;
      let prevCreated: number | undefined;
      runner.on("chatCompletion", (completion) => {
        const round = buildRoundFromCompletion({
          completion,
          round: roundCounter,
          fallbackModel: selectedModel,
          prevCreated,
        });
        trace.rounds.push(round);
        options?.onTraceEvent?.({ type: "round_completed", round });
        roundCounter += 1;
        prevCreated = completion.created;
      });
      content = (await runner.finalContent()) ?? "";
      usage = await runner.totalUsage();
      completions = runner.allChatCompletions();
    }

    finalizeTraceSuccess({
      trace,
      usage,
      content,
      completions,
      selectedModel,
      startedMs: started,
    });
    options?.onTraceEvent?.({ type: "trace_completed", trace: { ...trace } });
    return { content, trace };
  } catch (error) {
    finalizeTraceError({ trace, error, startedMs: started });
    options?.onTraceEvent?.({
      type: "trace_error",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function stuffedChat(
  question: string,
  documentPath: string,
  history: ChatMessage[],
  model?: string,
): Promise<string> {
  "use server";
  const result = await runStuffedChat(question, documentPath, history, { model });
  return result.content;
}

export async function stuffedChatStream(
  question: string,
  documentPath: string,
  history: ChatMessage[],
  onDelta: (delta: string) => void,
  model?: string,
): Promise<string> {
  "use server";
  const result = await runStuffedChat(question, documentPath, history, {
    model,
    onDelta,
  });
  return result.content;
}

export async function stuffedChatWithTrace(
  question: string,
  documentPath: string,
  history: ChatMessage[],
  model?: string,
): Promise<StuffedChatResult> {
  "use server";
  return runStuffedChat(question, documentPath, history, { model });
}

export async function stuffedChatStreamWithTrace(
  question: string,
  documentPath: string,
  history: ChatMessage[],
  onDelta: (delta: string) => void,
  onTraceEvent?: (event: StuffedChatTraceEvent) => void,
  model?: string,
): Promise<StuffedChatResult> {
  "use server";
  return runStuffedChat(question, documentPath, history, {
    model,
    onDelta,
    onTraceEvent,
  });
}
