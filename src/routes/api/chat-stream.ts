import { getRawDocPath } from "~/lib/dataCleaning/convert_to_markdown";
import { stuffedChatStream, type ChatMessage } from "~/lib/chat/stuffed-chat";

type ChatStreamRequest = {
  question?: string;
  history?: ChatMessage[];
  model?: string;
};

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
      try {
        await stuffedChatStream(
          question,
          documentPath,
          history,
          (delta) => controller.enqueue(encoder.encode(delta)),
          model,
        );
      } catch (error) {
        console.error("chat stream failed:", error);
        controller.enqueue(
          encoder.encode("\n\nI hit an error while streaming the response."),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
