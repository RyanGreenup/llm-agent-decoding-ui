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
import {
  startExtraction,
  continueExtraction,
} from "~/lib/extraction/extract-pds";
import { MAX_REFLECTION_ROUNDS } from "~/lib/config";
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

    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });

    const run = async () => {
      try {
        // Round 0: initial extraction
        const r0 = await startExtraction();
        if (cancelled) return;

        setTrace(reconcile(r0.trace));
        setPath(r0.path);

        let latestData = r0.data;

        // Reflection loop — client drives it
        let sessionId = r0.sessionId;
        let latestRound = r0.round;
        let reflectionCount = 0;

        while (!latestRound.passed && reflectionCount < MAX_REFLECTION_ROUNDS) {
          const rN = await continueExtraction(sessionId);
          if (cancelled) return;

          latestData = rN.data;

          // Merge the new round into the cumulative trace
          setTrace("rounds", (prev) => [...prev, rN.round]);
          setTrace("totalUsage", "promptTokens", (p) =>
            p + (rN.round.usage?.promptTokens ?? 0),
          );
          setTrace("totalUsage", "completionTokens", (p) =>
            p + (rN.round.usage?.completionTokens ?? 0),
          );
          setTrace("totalUsage", "totalTokens", (p) =>
            p + (rN.round.usage?.totalTokens ?? 0),
          );
          setTrace("reflectionCount", (c) => c + 1);
          setTrace("finalPassed", rN.round.passed);

          latestRound = rN.round;
          reflectionCount++;
        }

        setData(latestData);

        setTraceStatus("complete");
        props.onStatusChange?.("complete");
      } catch (error) {
        if (cancelled) return;
        setTraceStatus("error");
        setTraceError(error instanceof Error ? error.message : String(error));
        props.onStatusChange?.("error");
      }
    };

    void run();
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
