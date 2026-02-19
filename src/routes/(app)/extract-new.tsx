import { createAsync, query, type RouteDefinition } from "@solidjs/router";
import {
  ErrorBoundary,
  For,
  Show,
  createEffect,
  createSignal,
  onCleanup,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { animateMini } from "motion";
import JsonViewer from "~/components/JsonViewer";
import { createProtectedRoute, requireUser } from "~/lib/auth";
import {
  startExtraction,
  continueExtraction,
} from "~/lib/extraction/extract-pds";
import { MAX_REFLECTION_ROUNDS } from "~/lib/config";
import type { ExtractionRound, ExtractionTrace } from "~/lib/types";

// ── Auth ────────────────────────────────────────────────────────

const requireAuthQuery = query(async () => {
  "use server";
  return requireUser();
}, "extract-new-require-auth");

export const route = {
  preload: () => requireAuthQuery(),
} satisfies RouteDefinition;

// ── Helpers ─────────────────────────────────────────────────────

function emptyTrace(): ExtractionTrace {
  return {
    rounds: [],
    totalDurationMs: 0,
    totalUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    finalPassed: false,
    reflectionCount: 0,
    model: "unknown",
  };
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function fmtTokens(n: number): string {
  return n.toLocaleString();
}

type Status = "idle" | "running" | "complete" | "error";

function roleConfig(role: ExtractionRound["role"]) {
  switch (role) {
    case "initial_extraction":
      return { text: "Initial Extraction", badge: "badge-primary", step: "step-primary", border: "border-primary/30" };
    case "reflection":
      return { text: "Reflection", badge: "badge-secondary", step: "step-secondary", border: "border-secondary/30" };
    case "critic":
      return { text: "Critic", badge: "badge-accent", step: "step-accent", border: "border-accent/30" };
    case "tool_call":
      return { text: "Tool Call", badge: "badge-info", step: "step-info", border: "border-info/30" };
    case "agent":
      return { text: "Agent", badge: "badge-warning", step: "step-warning", border: "border-warning/30" };
    default:
      return { text: role, badge: "badge-ghost", step: "", border: "border-base-300" };
  }
}

// ── Section label ───────────────────────────────────────────────

function SectionLabel(props: { children: string; class?: string }) {
  return (
    <p class={`text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1.5 ${props.class ?? ""}`}>
      {props.children}
    </p>
  );
}

// ── Full round trace ────────────────────────────────────────────

function RoundTrace(props: {
  round: ExtractionRound;
  isLast: boolean;
  onElement?: (el: HTMLDivElement) => void;
}) {
  const cfg = () => roleConfig(props.round.role);

  return (
    <div
      ref={(el) => props.onElement?.(el)}
      class={`relative border-l-2 ${cfg().border} pl-5 pb-6 ml-3`}
    >
      {/* Timeline dot */}
      <div
        class={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 ${
          props.round.passed
            ? "bg-success border-success"
            : "bg-warning border-warning"
        }`}
      />

      {/* Round header */}
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <span class={`badge badge-sm font-semibold ${cfg().badge}`}>
          {cfg().text}
        </span>
        <span class="font-mono text-xs opacity-40">Round {props.round.round}</span>
        <span class="font-mono text-xs opacity-40">{props.round.model}</span>
        <div class="ml-auto flex items-center gap-2">
          <Show when={props.round.usage}>
            <span class="text-xs tabular-nums opacity-50">
              {fmtTokens(props.round.usage!.promptTokens)}p + {fmtTokens(props.round.usage!.completionTokens)}c = {fmtTokens(props.round.usage!.totalTokens)} tok
            </span>
          </Show>
          <span class="text-xs tabular-nums opacity-50">{fmtMs(props.round.durationMs)}</span>
          <span
            class={`badge badge-xs ${props.round.passed ? "badge-success" : "badge-warning"}`}
          >
            {props.round.passed ? "PASS" : "FAIL"}
          </span>
        </div>
      </div>

      {/* ① Input: what the model was given (validator feedback from previous round) */}
      <Show when={props.round.input}>
        <div class="mb-4">
          <SectionLabel>Validator feedback sent to model</SectionLabel>
          <pre class="text-xs font-mono bg-base-200 border border-base-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
            {props.round.input}
          </pre>
        </div>
      </Show>

      {/* ② Extracted data snapshot */}
      <Show when={props.round.snapshot}>
        <div class="mb-4">
          <SectionLabel>Extracted data (structured output)</SectionLabel>
          <div class="border border-base-300 rounded-lg overflow-hidden bg-base-100">
            <JsonViewer
              data={props.round.snapshot}
              class="max-h-[50vh] overflow-auto"
            />
          </div>
        </div>
      </Show>

      {/* ③ Deterministic validation result */}
      <Show when={props.round.validationFeedback}>
        <div class="mb-4">
          <SectionLabel>Deterministic validation result</SectionLabel>
          <div class="bg-warning/10 border border-warning/30 rounded-lg p-3">
            <pre class="text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto">
              {props.round.validationFeedback}
            </pre>
          </div>
        </div>
      </Show>

      <Show when={props.round.passed && !props.round.validationFeedback}>
        <div class="mb-4">
          <SectionLabel>Deterministic validation result</SectionLabel>
          <div class="bg-success/10 border border-success/30 rounded-lg px-3 py-2">
            <span class="text-xs font-semibold text-success">All checks passed</span>
          </div>
        </div>
      </Show>

      {/* ④ Raw model output (the actual text returned by the LLM) */}
      <Show when={props.round.rawOutput}>
        <div>
          <SectionLabel>Raw model output</SectionLabel>
          <pre class="text-xs font-mono bg-base-200 border border-base-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
            {props.round.rawOutput}
          </pre>
        </div>
      </Show>
    </div>
  );
}

// ── Pipeline summary bar ────────────────────────────────────────

function PipelineSummary(props: { trace: ExtractionTrace; status: Status }) {
  return (
    <div class="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 bg-base-200/60 rounded-lg text-xs">
      <div>
        <span class="opacity-40 font-semibold uppercase tracking-wide">Model</span>{" "}
        <span class="font-mono">{props.trace.model}</span>
      </div>
      <div>
        <span class="opacity-40 font-semibold uppercase tracking-wide">Rounds</span>{" "}
        <span class="font-mono tabular-nums">{props.trace.rounds.length}</span>
      </div>
      <Show when={props.trace.reflectionCount > 0}>
        <div>
          <span class="opacity-40 font-semibold uppercase tracking-wide">Reflections</span>{" "}
          <span class="font-mono tabular-nums">{props.trace.reflectionCount}</span>
        </div>
      </Show>
      <div>
        <span class="opacity-40 font-semibold uppercase tracking-wide">Tokens</span>{" "}
        <span class="font-mono tabular-nums">
          {fmtTokens(props.trace.totalUsage.promptTokens)}p + {fmtTokens(props.trace.totalUsage.completionTokens)}c = {fmtTokens(props.trace.totalUsage.totalTokens)}
        </span>
      </div>
      <div>
        <span class="opacity-40 font-semibold uppercase tracking-wide">Duration</span>{" "}
        <span class="font-mono tabular-nums">{fmtMs(props.trace.totalDurationMs)}</span>
      </div>
      <div class="ml-auto">
        <Show
          when={props.status !== "running"}
          fallback={
            <span class="badge badge-sm badge-ghost gap-1">
              <span class="loading loading-dots loading-xs" />
              Running
            </span>
          }
        >
          <span
            class={`badge badge-sm ${
              props.trace.finalPassed
                ? "badge-success"
                : props.trace.rounds.length > 0
                  ? "badge-warning"
                  : "badge-ghost"
            }`}
          >
            {props.trace.finalPassed ? "Passed" : props.trace.rounds.length > 0 ? "Failed" : "--"}
          </span>
        </Show>
      </div>
    </div>
  );
}

// ── JSON skeleton ───────────────────────────────────────────────

function JsonSkeleton() {
  return (
    <div class="space-y-3 p-4">
      <div class="flex items-center gap-2">
        <div class="skeleton h-4 w-4 rounded" />
        <div class="skeleton h-4 w-24" />
      </div>
      <div class="pl-6 space-y-2">
        <div class="flex items-center gap-2">
          <div class="skeleton h-3 w-3 rounded" />
          <div class="skeleton h-3 w-32" />
          <div class="skeleton h-3 w-20" />
        </div>
        <div class="flex items-center gap-2">
          <div class="skeleton h-3 w-3 rounded" />
          <div class="skeleton h-3 w-28" />
          <div class="skeleton h-3 w-16" />
        </div>
        <div class="flex items-center gap-2">
          <div class="skeleton h-3 w-3 rounded" />
          <div class="skeleton h-3 w-36" />
          <div class="skeleton h-3 w-12" />
        </div>
        <div class="pl-6 space-y-2">
          <div class="flex items-center gap-2">
            <div class="skeleton h-3 w-3 rounded" />
            <div class="skeleton h-3 w-24" />
            <div class="skeleton h-3 w-20" />
          </div>
          <div class="flex items-center gap-2">
            <div class="skeleton h-3 w-3 rounded" />
            <div class="skeleton h-3 w-30" />
            <div class="skeleton h-3 w-14" />
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div class="skeleton h-3 w-3 rounded" />
          <div class="skeleton h-3 w-20" />
          <div class="skeleton h-3 w-24" />
        </div>
      </div>
      <div class="flex items-center gap-2">
        <div class="skeleton h-4 w-4 rounded" />
        <div class="skeleton h-4 w-28" />
      </div>
      <div class="pl-6 space-y-2">
        <div class="flex items-center gap-2">
          <div class="skeleton h-3 w-3 rounded" />
          <div class="skeleton h-3 w-24" />
          <div class="skeleton h-3 w-16" />
        </div>
        <div class="flex items-center gap-2">
          <div class="skeleton h-3 w-3 rounded" />
          <div class="skeleton h-3 w-32" />
          <div class="skeleton h-3 w-10" />
        </div>
      </div>
    </div>
  );
}

// ── Extraction runner ───────────────────────────────────────────

function ExtractionView(props: {
  runId: number;
  onStatusChange?: (status: Status) => void;
}) {
  const [trace, setTrace] = createStore<ExtractionTrace>(emptyTrace());
  const [status, setStatus] = createSignal<Status>("idle");
  const [error, setError] = createSignal<string>();
  const [path, setPath] = createSignal<string>();
  const [data, setData] = createSignal<unknown>();
  const animatedRounds = new Set<number>();

  createEffect(() => {
    const activeRunId = props.runId;
    if (activeRunId <= 0) return;

    setTrace(reconcile(emptyTrace()));
    setStatus("running");
    props.onStatusChange?.("running");
    setError(undefined);
    setPath(undefined);
    setData(undefined);
    animatedRounds.clear();

    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });

    const run = async () => {
      try {
        const r0 = await startExtraction();
        if (cancelled) return;

        setTrace(reconcile(r0.trace));
        setPath(r0.path);

        let latestData = r0.data;
        let sessionId = r0.sessionId;
        let latestRound = r0.round;
        let reflections = 0;

        while (!latestRound.passed && reflections < MAX_REFLECTION_ROUNDS) {
          const rN = await continueExtraction(sessionId);
          if (cancelled) return;

          latestData = rN.data;

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
          reflections++;
        }

        setData(latestData);
        setStatus("complete");
        props.onStatusChange?.("complete");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
        props.onStatusChange?.("error");
      }
    };

    void run();
  });

  const animateIn = (el: HTMLDivElement, roundNumber: number) => {
    if (animatedRounds.has(roundNumber)) return;
    animatedRounds.add(roundNumber);
    animateMini(
      el,
      { opacity: [0, 1], transform: ["translateY(16px)", "translateY(0px)"] },
      { duration: 0.35, ease: "easeOut" },
    );
  };

  return (
    <div class="flex flex-col xl:flex-row gap-6 items-start">
      {/* ── Left: trace timeline ── */}
      <div class="w-full xl:flex-1 xl:min-w-0">
        <div class="flex items-center gap-2 py-2 mb-4">
          <h2 class="text-base font-semibold">Extraction Trace</h2>
          <Show when={status() === "running"}>
            <span class="loading loading-dots loading-xs opacity-50" />
          </Show>
          <Show when={trace.rounds.length > 0}>
            <span class="badge badge-sm badge-ghost ml-auto tabular-nums">
              {trace.rounds.length} round{trace.rounds.length !== 1 ? "s" : ""}
            </span>
          </Show>
        </div>

        {/* Summary bar */}
        <Show when={trace.rounds.length > 0}>
          <div class="mb-5">
            <PipelineSummary trace={trace} status={status()} />
          </div>
        </Show>

        {/* Timeline */}
        <Show
          when={trace.rounds.length > 0}
          fallback={
            <div class="flex flex-col items-center gap-3 py-12 opacity-40">
              <span class="loading loading-spinner loading-lg" />
              <p class="text-sm">Running initial extraction...</p>
            </div>
          }
        >
          <div>
            <For each={trace.rounds}>
              {(round, i) => (
                <RoundTrace
                  round={round}
                  isLast={i() === trace.rounds.length - 1 && status() !== "running"}
                  onElement={(el) => animateIn(el, round.round)}
                />
              )}
            </For>

            {/* Pending next round indicator */}
            <Show when={status() === "running" && !trace.finalPassed}>
              <div class="relative border-l-2 border-dashed border-base-300 pl-5 pb-4 ml-3">
                <div class="absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-base-300 bg-base-100 flex items-center justify-center">
                  <span class="loading loading-spinner loading-xs" />
                </div>
                <p class="text-sm opacity-40 pt-0.5">Running reflection round...</p>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      {/* ── Right: final JSON result ── */}
      <div class="w-full xl:w-[420px] xl:shrink-0">
        <div class="xl:sticky xl:top-4">
          <div class="flex items-center gap-2 py-2 mb-4">
            <h2 class="text-base font-semibold">Final Result</h2>
            <Show when={path()}>
              <span class="text-xs opacity-30 truncate ml-auto max-w-[60%]" title={path()}>
                {path()}
              </span>
            </Show>
          </div>

          <div class="border border-base-300 rounded-lg bg-base-100 overflow-hidden min-h-[200px]">
            <Show
              when={data()}
              fallback={
                <Show
                  when={status() !== "idle"}
                  fallback={
                    <div class="flex items-center justify-center h-48 opacity-25 text-sm">
                      Run an extraction to see results
                    </div>
                  }
                >
                  <div class="relative">
                    <div class="absolute top-3 right-3 z-10">
                      <span class="badge badge-sm badge-ghost gap-1.5">
                        <span class="loading loading-dots loading-xs" />
                        Processing
                      </span>
                    </div>
                    <JsonSkeleton />
                  </div>
                </Show>
              }
            >
              {(extractedData) => (
                <JsonViewer
                  data={extractedData()}
                  class="max-h-[80vh] overflow-auto"
                />
              )}
            </Show>
          </div>
        </div>
      </div>

      {/* Error toast */}
      <Show when={error()}>
        {(errMsg) => (
          <div class="toast toast-end toast-bottom z-50">
            <div class="alert alert-error shadow-lg">
              <span class="text-sm">{errMsg()}</span>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────

function ExtractNewPage() {
  const [runId, setRunId] = createSignal(0);
  const [runStatus, setRunStatus] = createSignal<Status>("idle");

  return (
    <main class="mx-auto max-w-[1400px] px-4 sm:px-6 py-8 space-y-6">
      {/* DEBUG: bright visible marker */}
      <div style="background:red;color:white;padding:20px;font-size:24px;">DEBUG: extract_new page is rendering</div>
      {/* Header */}
      <div class="flex items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">PDS Extraction</h1>
          <p class="text-sm opacity-50 mt-0.5">
            Extract structured data from Product Disclosure Statements
          </p>
        </div>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          disabled={runStatus() === "running"}
          onClick={() => {
            setRunStatus("running");
            setRunId((id) => id + 1);
          }}
        >
          <Show
            when={runStatus() !== "running"}
            fallback={
              <>
                <span class="loading loading-spinner loading-xs" />
                Running...
              </>
            }
          >
            {runId() === 0 ? "Run Extraction" : "Re-run"}
          </Show>
        </button>
      </div>

      <div class="divider my-0" />

      <ErrorBoundary
        fallback={(err) => (
          <div class="alert alert-error">
            <span>Extraction failed: {err?.message ?? "Unknown error"}</span>
          </div>
        )}
      >
        <Show
          when={runId() > 0}
          fallback={
            <div class="flex flex-col items-center justify-center py-24 opacity-30 gap-3">
              <svg
                class="w-12 h-12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <p class="text-sm font-medium">Click "Run Extraction" to begin</p>
            </div>
          }
        >
          <ExtractionView runId={runId()} onStatusChange={setRunStatus} />
        </Show>
      </ErrorBoundary>
    </main>
  );
}

export default function ExtractNew() {
  createProtectedRoute();
  createAsync(() => requireAuthQuery(), { deferStream: true });
  return <ExtractNewPage />;
}
