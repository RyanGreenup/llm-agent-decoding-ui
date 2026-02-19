import { createAsync, query, type RouteDefinition } from "@solidjs/router";
import {
  ErrorBoundary,
  Show,
  createEffect,
  createSignal,
  onCleanup,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { animateMini } from "motion";
import ExtractionTraceView from "~/components/ExtractionTraceView";
import JsonViewer from "~/components/JsonViewer";
import { createProtectedRoute, requireUser } from "~/lib/auth";
import type { ExtractStreamWireEvent } from "~/lib/extraction/stream-types";
import type { ExtractionTrace } from "~/lib/types";

const requireAuthQuery = query(async () => {
  "use server";
  return requireUser();
}, "extract-require-auth");

function emptyTrace(model = "unknown"): ExtractionTrace {
  return {
    rounds: [],
    totalDurationMs: 0,
    totalUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    finalPassed: false,
    reflectionCount: 0,
    model,
  };
}

async function* parseNdjsonEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ExtractStreamWireEvent> {
  const textStream = (
    body as ReadableStream<BufferSource>
  ).pipeThrough(new TextDecoderStream());
  const reader = textStream.getReader();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value ?? "";
      let lineBreakIndex = buffer.indexOf("\n");
      while (lineBreakIndex >= 0) {
        const line = buffer.slice(0, lineBreakIndex).trim();
        buffer = buffer.slice(lineBreakIndex + 1);
        lineBreakIndex = buffer.indexOf("\n");
        if (!line) continue;

        try {
          yield JSON.parse(line) as ExtractStreamWireEvent;
        } catch {
          console.warn("Malformed NDJSON line:", line);
        }
      }
    }

    const finalLine = buffer.trim();
    if (!finalLine) return;

    try {
      yield JSON.parse(finalLine) as ExtractStreamWireEvent;
    } catch {
      console.warn("Malformed final NDJSON line:", finalLine);
    }
  } finally {
    reader.releaseLock();
  }
}

export const route = {
  preload: () => requireAuthQuery(),
} satisfies RouteDefinition;

function ExtractionErrorFallback() {
  return <p class="text-error">Extraction failed.</p>;
}

function TraceStatusBar(props: { status: string; roundsLoaded: number }) {
  return (
    <div class="text-xs opacity-70">
      Status: {props.status} · Rounds loaded: {props.roundsLoaded}
    </div>
  );
}

function RunningTraceNotice() {
  return (
    <div class="alert alert-info py-2 text-sm">
      More trace updates are coming as extraction continues.
    </div>
  );
}

function TraceErrorNotice(props: { error: string }) {
  return <div class="alert alert-error">{props.error}</div>;
}

function ExtractedDataPanel(props: { data: unknown; path: string }) {
  return (
    <div class="space-y-2">
      <h2 class="text-sm font-semibold opacity-80">Extracted Data</h2>
      <JsonViewer
        data={props.data}
        class="max-h-[70vh] overflow-auto rounded-lg"
      />
      <p class="text-xs opacity-60 break-all">Source: {props.path}</p>
    </div>
  );
}

function WaitingForTraceFallback() {
  return <p class="text-sm opacity-70">Waiting for first trace chunk...</p>;
}

function ExtractionStreamView(props: {
  runId: number;
  onStatusChange?: (
    status: "idle" | "running" | "complete" | "error",
  ) => void;
}) {
  const [trace, setTrace] = createStore<ExtractionTrace>(emptyTrace());
  const [traceStatus, setTraceStatus] = createSignal<
    "idle" | "running" | "complete" | "error"
  >("idle");
  const [traceError, setTraceError] = createSignal<string | undefined>(undefined);
  const [path, setPath] = createSignal<string | undefined>(undefined);
  const [data, setData] = createSignal<unknown | undefined>(undefined);
  const animatedRounds = new Set<number>();

  createEffect(() => {
    const activeRunId = props.runId;
    if (activeRunId <= 0) return;

    setTrace(reconcile(emptyTrace()));
    setTraceStatus("running");
    props.onStatusChange?.("running");
    setTraceError(undefined);
    setPath(undefined);
    setData(undefined);
    animatedRounds.clear();

    const abort = new AbortController();

    const readStream = async () => {
      const handleStreamEvent = (event: ExtractStreamWireEvent) => {
        if (event.runId !== activeRunId) return;

        switch (event.type) {
          case "pipeline_started":
            setTraceStatus("running");
            props.onStatusChange?.("running");
            break;
          case "round_completed":
            setTrace(reconcile(event.trace));
            break;
          case "pipeline_completed":
            setPath(event.path);
            setData(event.data);
            setTrace(reconcile(event.trace));
            setTraceStatus("complete");
            props.onStatusChange?.("complete");
            break;
          case "pipeline_failed":
            setTraceStatus("error");
            setTraceError(event.error);
            props.onStatusChange?.("error");
            break;
        }
      };

      try {
        const response = await fetch("/api/extract-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: activeRunId }),
          signal: abort.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to start extraction stream (${response.status})`);
        }

        if (!response.body) {
          throw new Error("Extraction stream did not return a body");
        }

        for await (const streamEvent of parseNdjsonEvents(response.body)) {
          // AbortController cancels prior runs; keep runId filtering as a
          // defensive guard against any late buffered chunks.
          handleStreamEvent(streamEvent);
        }
      } catch (error) {
        if (abort.signal.aborted) return;
        setTraceStatus("error");
        setTraceError(error instanceof Error ? error.message : String(error));
        props.onStatusChange?.("error");
      }
    };

    void readStream();
    onCleanup(() => abort.abort());
  });

  const handleRoundElement = (el: HTMLDivElement, roundNumber: number) => {
    if (animatedRounds.has(roundNumber)) return;
    animatedRounds.add(roundNumber);
    animateMini(
      el,
      {
        opacity: [0, 1],
        transform: ["translateY(10px)", "translateY(0px)"],
      },
      { duration: 0.28, ease: "easeOut" },
    );
  };

  return (
    <ErrorBoundary fallback={<ExtractionErrorFallback />}>
      <div class="space-y-4">
        <TraceStatusBar status={traceStatus()} roundsLoaded={trace.rounds.length} />

        <Show when={traceStatus() === "running" && trace.rounds.length > 0}>
          <RunningTraceNotice />
        </Show>

        <Show when={traceError()}>
          {(error) => <TraceErrorNotice error={error()} />}
        </Show>

        <Show when={data()}>
          {(extractedData) => (
            <Show when={path()}>
              {(sourcePath) => (
                <ExtractedDataPanel
                  data={extractedData()}
                  path={sourcePath()}
                />
              )}
            </Show>
          )}
        </Show>

        <Show
          when={trace.rounds.length > 0}
          fallback={<WaitingForTraceFallback />}
        >
          <ExtractionTraceView
            trace={trace}
            onRoundElement={handleRoundElement}
          />
        </Show>
      </div>
    </ErrorBoundary>
  );
}

function ExtractPageContent() {
  const [runId, setRunId] = createSignal(0);
  const [runStatus, setRunStatus] = createSignal<
    "idle" | "running" | "complete" | "error"
  >("idle");

  return (
    <main class="mx-auto max-w-4xl px-4 py-12 space-y-6">
      <div class="flex items-center justify-between gap-3">
        <h1 class="text-3xl font-bold">PDS Extraction</h1>
        <button
          type="button"
          class="btn btn-primary"
          disabled={runStatus() === "running"}
          onClick={() => {
            setRunStatus("running");
            setRunId((id) => id + 1);
          }}
        >
          {runStatus() === "running" ? "Running..." : "Run extraction"}
        </button>
      </div>

      <Show when={runId() > 0}>
        <ExtractionStreamView runId={runId()} onStatusChange={setRunStatus} />
      </Show>
    </main>
  );
}

export default function Extract() {
  createProtectedRoute();
  createAsync(() => requireAuthQuery(), { deferStream: true });
  return <ExtractPageContent />;
}
