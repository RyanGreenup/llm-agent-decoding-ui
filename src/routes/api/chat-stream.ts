import { getRawDocPath } from "~/lib/dataCleaning/convert_to_markdown";
import {
  stuffedChatStreamWithTrace,
  type ChatMessage,
} from "~/lib/chat/stuffed-chat";
import type { StuffedChatTraceEvent } from "~/lib/chat/stuffed-chat-auditing";

type ChatStreamRequest = {
  question?: string;
  history?: ChatMessage[];
  model?: string;
};

type StreamEvent =
  | { type: "delta"; delta: string }
  | { type: "trace"; event: StuffedChatTraceEvent }
  | { type: "error"; message: string };

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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const writeEvent = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const result = await stuffedChatStreamWithTrace(
          question,
          documentPath,
          history,
          (delta) => writeEvent({ type: "delta", delta }),
          (traceEvent) => writeEvent({ type: "trace", event: traceEvent }),
          model,
        );
        console.info("RAG_CHAT_TRACE", JSON.stringify(result.trace));
      } catch (error) {
        console.error("chat stream failed:", error);
        writeEvent({
          type: "error",
          message: "I hit an error while streaming the response.",
        });
      } finally {
        controller.close();
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
