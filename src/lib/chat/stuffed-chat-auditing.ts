"use server";

import OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";
import type { TokenUsage } from "~/lib/types";

export type StuffedChatToolCallTrace = {
  name: "extract_pds_data" | "get_models";
  startedAt: string;
  durationMs: number;
  arguments: string | null;
  resultPreview: string | null;
  resultSizeBytes: number | null;
  resultTruncated: boolean;
  cached: boolean;
  success: boolean;
  error: string | null;
};

export type StuffedChatRoundTrace = {
  round: number;
  model: string;
  finishReason: string | null;
  durationMs: number;
  usage: TokenUsage | null;
  contentPreview: string;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
};

export type StuffedChatTrace = {
  question: string;
  documentPath: string;
  model: string;
  startedAt: string;
  totalDurationMs: number;
  historyCount: number;
  documentChars: number;
  toolCalls: StuffedChatToolCallTrace[];
  rounds: StuffedChatRoundTrace[];
  totalUsage: TokenUsage;
  finalContentPreview: string;
  errored: boolean;
  error: string | null;
};

export type StuffedChatResult = {
  content: string;
  trace: StuffedChatTrace;
};

export type StuffedChatTraceEvent =
  | { type: "trace_started"; trace: StuffedChatTrace }
  | { type: "tool_call"; toolCall: StuffedChatToolCallTrace }
  | { type: "round_completed"; round: StuffedChatRoundTrace }
  | { type: "trace_completed"; trace: StuffedChatTrace }
  | { type: "trace_error"; error: string };

export type ToolAudit = {
  onToolCall: (entry: StuffedChatToolCallTrace) => void;
};

export function toTokenUsage(
  usage: OpenAI.Completions.CompletionUsage | undefined,
): TokenUsage | null {
  if (!usage) return null;
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

export function emptyUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

export function preview(content: string, max = 240): string {
  if (!content) return "";
  if (content.length <= max) return content;
  return `${content.slice(0, max)}...`;
}

function extractFunctionToolCalls(
  toolCalls: OpenAI.ChatCompletionMessageToolCall[] | undefined,
): Array<{ id: string; name: string; arguments: string }> {
  if (!toolCalls) return [];
  return toolCalls
    .filter((t): t is OpenAI.ChatCompletionMessageFunctionToolCall => t.type === "function")
    .map((t) => ({
      id: t.id,
      name: t.function.name,
      arguments: t.function.arguments,
    }));
}

export function buildRoundTrace(
  completions: ChatCompletion[],
  fallbackModel: string,
): StuffedChatRoundTrace[] {
  return completions.map((completion, i) =>
    buildRoundFromCompletion({
      completion,
      round: i,
      fallbackModel,
      prevCreated: i > 0 ? completions[i - 1]?.created : undefined,
    }),
  );
}

export function buildRoundFromCompletion(params: {
  completion: ChatCompletion;
  round: number;
  fallbackModel: string;
  prevCreated?: number;
}): StuffedChatRoundTrace {
  const message = params.completion.choices[0]?.message;
  const messageContent =
    typeof message?.content === "string" ? message.content : "";
  const prevCreated = params.prevCreated ?? params.completion.created;
  return {
    round: params.round,
    model: params.completion.model || params.fallbackModel,
    finishReason: params.completion.choices[0]?.finish_reason ?? null,
    durationMs: Math.max(0, (params.completion.created - prevCreated) * 1000),
    usage: toTokenUsage(params.completion.usage),
    contentPreview: preview(messageContent),
    toolCalls: extractFunctionToolCalls(message?.tool_calls),
  };
}

export function createTrace(params: {
  question: string;
  documentPath: string;
  model: string;
  historyCount: number;
  documentChars: number;
  startedAt: string;
}): StuffedChatTrace {
  return {
    question: params.question,
    documentPath: params.documentPath,
    model: params.model,
    startedAt: params.startedAt,
    totalDurationMs: 0,
    historyCount: params.historyCount,
    documentChars: params.documentChars,
    toolCalls: [],
    rounds: [],
    totalUsage: emptyUsage(),
    finalContentPreview: "",
    errored: false,
    error: null,
  };
}

export function finalizeTraceSuccess(params: {
  trace: StuffedChatTrace;
  usage: OpenAI.Completions.CompletionUsage | undefined;
  content: string;
  completions: ChatCompletion[];
  selectedModel: string;
  startedMs: number;
}): StuffedChatTrace {
  if (params.trace.rounds.length === 0) {
    params.trace.rounds.push(...buildRoundTrace(params.completions, params.selectedModel));
  }
  params.trace.totalUsage = toTokenUsage(params.usage) ?? emptyUsage();
  params.trace.totalDurationMs = performance.now() - params.startedMs;
  params.trace.finalContentPreview = preview(params.content, 500);
  return params.trace;
}

export function finalizeTraceError(params: {
  trace: StuffedChatTrace;
  error: unknown;
  startedMs: number;
}): StuffedChatTrace {
  params.trace.errored = true;
  params.trace.error =
    params.error instanceof Error ? params.error.message : String(params.error);
  params.trace.totalDurationMs = performance.now() - params.startedMs;
  return params.trace;
}
