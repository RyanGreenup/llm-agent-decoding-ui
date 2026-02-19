import { getRawDocPath } from "~/lib/dataCleaning/convert_to_markdown";
import {
  extractPdsFromFileEvents,
} from "~/lib/extraction/extract-pds";
import { requireUser } from "~/lib/auth";
import type {
  ExtractStreamRequest,
  ExtractStreamWireEvent,
} from "~/lib/extraction/stream-types";

function writeEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: ExtractStreamWireEvent,
) {
  controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
}

export async function POST(event: any) {
  await requireUser();

  let payload: ExtractStreamRequest = {};
  try {
    payload = (await event.request.json()) as ExtractStreamRequest;
  } catch {
    // Ignore missing/invalid body; runId falls back to timestamp.
  }

  const runId =
    typeof payload.runId === "number" && Number.isFinite(payload.runId)
      ? payload.runId
      : Date.now();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const path = await getRawDocPath();
        for await (const extractionEvent of extractPdsFromFileEvents(path)) {
          if (extractionEvent.type === "pipeline_completed") {
            writeEvent(controller, encoder, {
              type: "pipeline_completed",
              runId,
              path,
              data: extractionEvent.result.data,
              trace: extractionEvent.result.trace,
            });
            continue;
          }

          if (extractionEvent.type === "round_completed") {
            writeEvent(controller, encoder, {
              type: "round_completed",
              runId,
              round: extractionEvent.round,
              trace: extractionEvent.trace,
            });
            continue;
          }

          if (extractionEvent.type === "pipeline_started") {
            writeEvent(controller, encoder, {
              type: "pipeline_started",
              runId,
              maxReflectionRounds: extractionEvent.maxReflectionRounds,
            });
            continue;
          }

          writeEvent(controller, encoder, {
            type: "pipeline_failed",
            runId,
            error: extractionEvent.error,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        writeEvent(controller, encoder, {
          type: "pipeline_failed",
          runId,
          error: message,
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
