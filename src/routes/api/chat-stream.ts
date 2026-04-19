import { getRawDocPath } from "~/lib/dataCleaning/convert_to_markdown";
import {
  stuffedChatStreamWithTrace,
  type ChatMessage,
} from "~/lib/chat/stuffed-chat";
import type { StuffedChatTraceEvent } from "~/lib/chat/stuffed-chat-auditing";
import { chatLog } from "~/lib/logger";

type ChatStreamRequest = {
  question?: string;
  history?: ChatMessage[];
  model?: string;
};

type StreamEvent =
  | { type: "delta"; delta: string }
  | { type: "trace"; event: StuffedChatTraceEvent }
  | { type: "error"; message: string }
  | { type: "ping" };

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  const role = entry.role;
  const content = entry.content;
  return (
    (role === "user" || role === "assistant") &&
    typeof content === "string"
  );
}

export async function POST(event: any) {
  let payload: ChatStreamRequest;
  try {
    payload = (await event.request.json()) as ChatStreamRequest;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const question = payload.question?.trim();
  if (!question) {
    return new Response("Missing question", { status: 400 });
  }

  const history = Array.isArray(payload.history)
    ? payload.history.filter(isChatMessage)
    : [];
  const model = typeof payload.model === "string" ? payload.model : undefined;
  const documentPath = await getRawDocPath();
  chatLog.info("chat_stream.request", { question: question.slice(0, 120), historyCount: history.length, model: model ?? "default" });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const writeEvent = (event: StreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };
      // Prime the HTTP/2 stream immediately so Traefik doesn't reset it
      // during the latency before the first token arrives from OpenAI.
      writeEvent({ type: "ping" });
      try {
        const result = await stuffedChatStreamWithTrace(
          question,
          documentPath,
          history,
          (delta) => writeEvent({ type: "delta", delta }),
          (traceEvent) => writeEvent({ type: "trace", event: traceEvent }),
          model,
        );
        chatLog.info("chat_stream.trace", {
          model: result.trace.model,
          durationMs: Math.round(result.trace.totalDurationMs),
          totalTokens: result.trace.totalUsage.totalTokens,
          toolCalls: result.trace.toolCalls.length,
          rounds: result.trace.rounds.length,
        });
      } catch (error) {
        chatLog.error("chat_stream.error", { err: error instanceof Error ? error.message : String(error) });
        writeEvent({
          type: "error",
          message: "I hit an error while streaming the response.",
        });
      } finally {
        closed = true;
        try { controller.close(); } catch { /* already closed by client disconnect */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
