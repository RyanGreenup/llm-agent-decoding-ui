import { type RouteDefinition } from "@solidjs/router";
import { createAsync } from "@solidjs/router";
import {
  For,
  Show,
  Suspense,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  type Accessor,
} from "solid-js";
import { Portal } from "solid-js/web";
import ChatContainer from "~/components/ChatContainer";
import type { Message } from "~/lib/types";
import ChatInput from "~/components/ChatInput";
import { DEFAULT_MODEL_ID } from "~/lib/config";
import { getModels } from "~/lib/models";
import { createProtectedRoute, getUser } from "~/lib/auth";
import { getConvertedDocument } from "~/lib/dataCleaning/queries";
import DocumentPreviewPanel, {
  DocumentPreviewLoading,
} from "~/components/DocumentPreviewPanel";
import X from "lucide-solid/icons/x";

export const route = {
  preload: () => {
    getUser();
    getModels();
    getConvertedDocument();
  },
} satisfies RouteDefinition;

type ChatTraceToolCall = {
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

type ChatTraceRound = {
  round: number;
  model: string;
  finishReason: string | null;
  durationMs: number;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
  contentPreview: string;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
};

type ChatTrace = {
  question: string;
  documentPath: string;
  model: string;
  startedAt: string;
  totalDurationMs: number;
  historyCount: number;
  documentChars: number;
  toolCalls: ChatTraceToolCall[];
  rounds: ChatTraceRound[];
  totalUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finalContentPreview: string;
  errored: boolean;
  error: string | null;
};

type TraceEvent =
  | { type: "trace_started"; trace: ChatTrace }
  | { type: "tool_call"; toolCall: ChatTraceToolCall }
  | { type: "round_completed"; round: ChatTraceRound }
  | { type: "trace_completed"; trace: ChatTrace }
  | { type: "trace_error"; error: string };

type StreamEvent =
  | { type: "delta"; delta: string }
  | { type: "trace"; event: TraceEvent }
  | { type: "error"; message: string };

type AuditFeedItem = {
  id: string;
  kind: "tool" | "round";
  at: string;
  title: string;
  detail: string;
  tone: "info" | "success" | "warning" | "error";
};

type AuditStatus = "idle" | "running" | "complete" | "error";

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function fmtTokens(n: number): string {
  return n.toLocaleString();
}

function addOrReplaceRound(rounds: ChatTraceRound[], next: ChatTraceRound): ChatTraceRound[] {
  const idx = rounds.findIndex((r) => r.round === next.round);
  if (idx === -1) return [...rounds, next];
  const copy = rounds.slice();
  copy[idx] = next;
  return copy;
}

export default function Chat() {
  createProtectedRoute();
  const [messages, setMessages] = createSignal<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Welcome! I'm your PDS analysis agent. Ask me anything about the NovigiSuper Product Disclosure Statement. I'll search the document, calculate figures like $A = P(1 + r)^n$, and verify my answers against the source.",
    },
  ]);
  const [input, setInput] = createSignal("");
  const [isTyping, setIsTyping] = createSignal(false);
  const [selectedModelId] = createSignal(DEFAULT_MODEL_ID);
  const [shouldAutoScroll, setShouldAutoScroll] = createSignal(true);
  const [auditStatus, setAuditStatus] = createSignal<AuditStatus>("idle");
  const [auditTrace, setAuditTrace] = createSignal<ChatTrace>();
  const [auditRounds, setAuditRounds] = createSignal<ChatTraceRound[]>([]);
  const [auditToolCalls, setAuditToolCalls] = createSignal<ChatTraceToolCall[]>([]);
  const [auditFeed, setAuditFeed] = createSignal<AuditFeedItem[]>([]);
  const [auditError, setAuditError] = createSignal<string>();

  const doc = createAsync(() => getConvertedDocument());
  let scrollViewportRef: HTMLDivElement | undefined;
  let scrollContentRef: HTMLDivElement | undefined;
  let streamAnchorRef: HTMLDivElement | undefined;
  let docPreviewDialogRef: HTMLDialogElement | undefined;
  const BOTTOM_THRESHOLD_PX = 96;

  const isNearBottom = (el: HTMLDivElement): boolean =>
    el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD_PX;

  const keepStreamInView = (force = false) => {
    const viewport = scrollViewportRef;
    if (!viewport) return;
    if (!force && !shouldAutoScroll()) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
    streamAnchorRef?.scrollIntoView({ behavior: "auto", block: "end" });
    requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
    });
  };

  onMount(() => {
    const viewport = scrollViewportRef;
    if (!viewport) return;
    const onScroll = () => setShouldAutoScroll(isNearBottom(viewport));
    viewport.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const observer = new ResizeObserver(() => {
      if (isTyping()) keepStreamInView();
    });
    if (scrollContentRef) observer.observe(scrollContentRef);

    onCleanup(() => {
      viewport.removeEventListener("scroll", onScroll);
      observer.disconnect();
    });
  });

  createEffect(() => {
    messages();
    if (!isTyping()) return;
    keepStreamInView();
  });

  const resetAuditForRun = () => {
    setAuditStatus("running");
    setAuditTrace(undefined);
    setAuditRounds([]);
    setAuditToolCalls([]);
    setAuditFeed([]);
    setAuditError(undefined);
  };

  const applyTraceEvent = (event: TraceEvent) => {
    switch (event.type) {
      case "trace_started": {
        setAuditStatus("running");
        setAuditTrace(event.trace);
        setAuditRounds(event.trace.rounds ?? []);
        setAuditToolCalls(event.trace.toolCalls ?? []);
        break;
      }
      case "tool_call": {
        setAuditToolCalls((prev) => [...prev, event.toolCall]);
        setAuditFeed((prev) => [
          ...prev,
          {
            id: `${event.toolCall.name}-${event.toolCall.startedAt}-${prev.length}`,
            kind: "tool",
            at: event.toolCall.startedAt,
            title: `Tool: \`${event.toolCall.name}\``,
            detail: event.toolCall.success
              ? `${fmtMs(event.toolCall.durationMs)}${event.toolCall.cached ? " · cache hit" : ""}${event.toolCall.resultSizeBytes != null ? ` · ${fmtTokens(event.toolCall.resultSizeBytes)} bytes` : ""}`
              : event.toolCall.error ?? "Tool call failed",
            tone: event.toolCall.success ? "info" : "error",
          },
        ]);
        break;
      }
      case "round_completed": {
        setAuditRounds((prev) => addOrReplaceRound(prev, event.round));
        setAuditFeed((prev) => [
          ...prev,
          {
            id: `round-${event.round.round}-${prev.length}`,
            kind: "round",
            at: new Date().toISOString(),
            title: `Round ${event.round.round}`,
            detail: `${event.round.model} · ${event.round.finishReason ?? "complete"} · ${fmtMs(event.round.durationMs)}`,
            tone: event.round.finishReason === "stop" ? "success" : "warning",
          },
        ]);
        break;
      }
      case "trace_completed": {
        setAuditStatus("complete");
        setAuditTrace(event.trace);
        setAuditRounds(event.trace.rounds);
        setAuditToolCalls(event.trace.toolCalls);
        break;
      }
      case "trace_error": {
        setAuditStatus("error");
        setAuditError(event.error);
        break;
      }
    }
  };

  const appendAssistantDelta = (assistantIdRef: { value?: string }, streamed: string) => {
    if (!assistantIdRef.value) {
      assistantIdRef.value = `${Date.now()}-assistant`;
      setMessages((prev) => [
        ...prev,
        { id: assistantIdRef.value!, role: "assistant", content: streamed },
      ]);
      return;
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantIdRef.value ? { ...m, content: streamed } : m,
      ),
    );
  };

  const sendMessage = async (override?: string) => {
    if (isTyping()) return;
    const msg = (override ?? input()).trim();
    if (!msg) return;
    const priorMessages = messages();

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: msg,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);
    resetAuditForRun();
    keepStreamInView(true);

    const assistantIdRef: { value?: string } = {};

    try {
      const history = priorMessages.map(({ role, content }) => ({ role, content }));

      const response = await fetch("/api/chat-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: msg,
          history,
          model: selectedModelId(),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Chat stream failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamed = "";
      let pending = "";

      const processLine = (line: string) => {
        let parsed: StreamEvent | undefined;
        try {
          parsed = JSON.parse(line) as StreamEvent;
        } catch {
          // Backward compatibility if the endpoint returns plain text chunks.
          streamed += line;
          appendAssistantDelta(assistantIdRef, streamed);
          return;
        }

        if (parsed.type === "delta") {
          streamed += parsed.delta;
          appendAssistantDelta(assistantIdRef, streamed);
          keepStreamInView();
          return;
        }

        if (parsed.type === "trace") {
          applyTraceEvent(parsed.event);
          return;
        }

        if (parsed.type === "error") {
          setAuditStatus("error");
          setAuditError(parsed.message);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });

        let idx = pending.indexOf("\n");
        while (idx >= 0) {
          const line = pending.slice(0, idx).trim();
          pending = pending.slice(idx + 1);
          if (line) processLine(line);
          idx = pending.indexOf("\n");
        }
      }

      pending += decoder.decode();
      if (pending.trim()) {
        processLine(pending.trim());
      }

      if (!streamed.trim()) {
        const fallback = "I couldn't generate a response from the document for that question.";
        if (assistantIdRef.value) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantIdRef.value ? { ...m, content: fallback } : m,
            ),
          );
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `${Date.now()}-assistant`,
              role: "assistant",
              content: fallback,
            },
          ]);
        }
      }
    } catch (error) {
      console.error("chat failed:", error);
      setAuditStatus("error");
      setAuditError(error instanceof Error ? error.message : String(error));
      const fallback = "I hit an error while processing that message. Please try again.";
      if (assistantIdRef.value) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantIdRef.value ? { ...m, content: fallback } : m,
          ),
        );
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: fallback,
          },
        ]);
      }
    } finally {
      setIsTyping(false);
    }
  };

  const suggestedQuestions = [
    "What's the High Growth return?",
    "Total annual fees on $100k?",
    "Preservation age if born 1962?",
    "Identify the fees from Section 7",
  ];

  const askSuggested = (question: string) => {
    setInput(question);
    void sendMessage(question);
  };

  const openDocumentPreview = () => {
    if (!docPreviewDialogRef || docPreviewDialogRef.open) return;
    docPreviewDialogRef.showModal();
  };

  return (
    <div class="flex min-h-full flex-col">
      <div class="flex min-h-0 flex-1 flex-col xl:flex-row">
        <section class="flex min-h-0 flex-1 flex-col">
          <div class="flex items-center justify-between border-b border-base-300 px-4 py-3 sm:px-6">
            <div>
              <h1 class="text-base font-semibold">RAG Chat</h1>
              <p class="text-xs opacity-50">Grounded responses with live audit trace</p>
            </div>
            <button
              type="button"
              class="btn btn-sm btn-outline"
              onClick={openDocumentPreview}
            >
              Preview Document
            </button>
          </div>
          <div class="flex-1 overflow-y-auto" ref={scrollViewportRef}>
            <div ref={scrollContentRef} class="pb-24">
              <ChatContainer
                messages={messages}
                isTyping={isTyping}
                suggestedQuestions={suggestedQuestions}
                onAskSuggested={askSuggested}
              />
              <div ref={streamAnchorRef} class="h-px scroll-mb-24" />
            </div>
          </div>
          <ChatInput
            value={input}
            onInput={setInput}
            onSend={() => void sendMessage()}
            disableSend={isTyping}
          />
        </section>

        <aside class="w-full border-t border-base-300 bg-base-100 xl:w-[430px] xl:border-l xl:border-t-0">
          <AuditPanel
            status={auditStatus}
            trace={auditTrace}
            rounds={auditRounds}
            toolCalls={auditToolCalls}
            feed={auditFeed}
            error={auditError}
          />
        </aside>
      </div>

      <Portal>
        <DocumentPreview
          dialogRef={(el) => {
            docPreviewDialogRef = el;
          }}
          doc={doc}
        />
      </Portal>
    </div>
  );
}

function AuditPanel(props: {
  status: Accessor<AuditStatus>;
  trace: Accessor<ChatTrace | undefined>;
  rounds: Accessor<ChatTraceRound[]>;
  toolCalls: Accessor<ChatTraceToolCall[]>;
  feed: Accessor<AuditFeedItem[]>;
  error: Accessor<string | undefined>;
}) {
  const statusBadge = () => {
    switch (props.status()) {
      case "running":
        return "badge-info";
      case "complete":
        return "badge-success";
      case "error":
        return "badge-error";
      default:
        return "badge-ghost";
    }
  };

  return (
    <div class="h-full overflow-y-auto p-4 sm:p-5">
      <div class="mb-4 flex items-center gap-2">
        <h2 class="text-base font-semibold">Trace Audit</h2>
        <span class={`badge badge-sm ${statusBadge()}`}>{props.status()}</span>
        <Show when={props.status() === "running"}>
          <span class="loading loading-dots loading-xs opacity-60" />
        </Show>
      </div>

      <div class="stats stats-vertical w-full bg-base-200/60 shadow-sm">
        <div class="stat py-3">
          <div class="stat-title">Model</div>
          <div class="stat-value text-sm font-mono">{props.trace()?.model ?? "--"}</div>
        </div>
        <div class="stat py-3">
          <div class="stat-title">Rounds</div>
          <div class="stat-value text-sm font-mono">{props.rounds().length}</div>
          <div class="stat-desc">Tool calls: {props.toolCalls().length}</div>
        </div>
        <div class="stat py-3">
          <div class="stat-title">Usage</div>
          <div class="stat-value text-sm font-mono">
            {fmtTokens(props.trace()?.totalUsage.totalTokens ?? 0)} tok
          </div>
          <div class="stat-desc">
            {fmtTokens(props.trace()?.totalUsage.promptTokens ?? 0)}p + {fmtTokens(props.trace()?.totalUsage.completionTokens ?? 0)}c
          </div>
        </div>
        <div class="stat py-3">
          <div class="stat-title">Duration</div>
          <div class="stat-value text-sm font-mono">
            {fmtMs(props.trace()?.totalDurationMs ?? 0)}
          </div>
        </div>
      </div>

      <Show when={props.error()}>
        {(err) => (
          <div role="alert" class="alert alert-error alert-soft mt-4">
            <span class="text-xs">{err()}</span>
          </div>
        )}
      </Show>

      <details class="collapse collapse-arrow mt-4 border border-base-300 bg-base-100" open>
        <summary class="collapse-title text-sm font-semibold">
          Live Event Timeline
          <span class="badge badge-sm badge-ghost ml-2">{props.feed().length}</span>
        </summary>
        <div class="collapse-content pt-0">
          <Show
            when={props.feed().length > 0}
            fallback={<p class="py-4 text-xs opacity-50">Run a question to start live tracing.</p>}
          >
            <ul class="timeline timeline-vertical">
              <For each={props.feed()}>
                {(item, i) => (
                  <li>
                    <Show when={i() > 0}>
                      <hr />
                    </Show>
                    <div class="timeline-start text-[10px] font-mono opacity-50">
                      {i() + 1}
                    </div>
                    <div class="timeline-middle">
                      <span
                        class={`h-2.5 w-2.5 rounded-full inline-block ${
                          item.tone === "success"
                            ? "bg-success"
                            : item.tone === "warning"
                              ? "bg-warning"
                              : item.tone === "error"
                                ? "bg-error"
                                : "bg-info"
                        }`}
                      />
                    </div>
                    <div class="timeline-end timeline-box w-full">
                      <div class="flex items-center gap-2">
                        <span class="text-xs font-semibold">{item.title}</span>
                        <span class="text-[10px] font-mono opacity-45 ml-auto">
                          {new Date(item.at).toLocaleTimeString()}
                        </span>
                      </div>
                      <p class="mt-1 text-xs opacity-70">{item.detail}</p>
                    </div>
                    <hr />
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </details>

      <details class="collapse collapse-arrow mt-3 border border-base-300 bg-base-100">
        <summary class="collapse-title text-sm font-semibold">Tool Call Payloads</summary>
        <div class="collapse-content pt-0 space-y-3">
          <Show
            when={props.toolCalls().length > 0}
            fallback={<p class="py-2 text-xs opacity-50">No tool calls yet.</p>}
          >
            <For each={props.toolCalls()}>
              {(call, i) => (
                <details class="collapse collapse-arrow border border-base-300 bg-base-200/40">
                  <summary class="collapse-title py-2 pr-10 min-h-0">
                    <div class="flex items-center gap-2">
                      <span class="badge badge-xs badge-info">Tool {i() + 1}</span>
                      <span class="font-mono text-xs">{call.name}</span>
                      <span class="text-[10px] opacity-60 ml-auto">{fmtMs(call.durationMs)}</span>
                    </div>
                  </summary>
                  <div class="collapse-content pt-0 space-y-2">
                    <div>
                      <p class="text-[10px] font-semibold uppercase tracking-wide opacity-50 mb-1">Arguments</p>
                      <pre class="max-h-24 overflow-auto whitespace-pre-wrap text-xs font-mono bg-base-100 border border-base-300 rounded p-2">{call.arguments ?? "(none)"}</pre>
                    </div>
                    <div>
                      <p class="text-[10px] font-semibold uppercase tracking-wide opacity-50 mb-1">Result Preview</p>
                      <pre class="max-h-32 overflow-auto whitespace-pre-wrap text-xs font-mono bg-base-100 border border-base-300 rounded p-2">{call.resultPreview ?? "(none)"}</pre>
                      <p class="mt-1 text-[10px] opacity-60">
                        {call.resultSizeBytes != null ? `${fmtTokens(call.resultSizeBytes)} bytes` : "--"}
                        {call.resultTruncated ? " · truncated" : ""}
                      </p>
                    </div>
                  </div>
                </details>
              )}
            </For>
          </Show>
        </div>
      </details>

      <details class="collapse collapse-arrow mt-3 border border-base-300 bg-base-100">
        <summary class="collapse-title text-sm font-semibold">Round Outputs</summary>
        <div class="collapse-content pt-0 space-y-3">
          <Show
            when={props.rounds().length > 0}
            fallback={<p class="py-2 text-xs opacity-50">No rounds completed yet.</p>}
          >
            <For each={props.rounds()}>
              {(round) => (
                <div class="rounded-lg border border-base-300 bg-base-200/40 p-3">
                  <div class="mb-2 flex items-center gap-2">
                    <span class="badge badge-xs badge-primary">Round {round.round}</span>
                    <span class="text-[10px] font-mono opacity-60">{round.model}</span>
                    <span class="text-[10px] font-mono opacity-60 ml-auto">{fmtMs(round.durationMs)}</span>
                  </div>
                  <pre class="max-h-28 overflow-auto whitespace-pre-wrap text-xs font-mono opacity-80">
                    {round.contentPreview || "(no preview)"}
                  </pre>
                </div>
              )}
            </For>
          </Show>
        </div>
      </details>
    </div>
  );
}

const DocumentPreview = (props: {
  dialogRef: (el: HTMLDialogElement) => void;
  doc: Accessor<{ path: string; markdown: string } | undefined>;
}) => {
  return (
    <dialog ref={props.dialogRef} class="modal modal-bottom sm:modal-middle">
      <div class="modal-box w-11/12 max-w-5xl p-0">
        <div class="flex items-center justify-between border-b border-base-300 px-5 py-4">
          <h2 class="text-lg font-semibold">Document Preview</h2>
          <form method="dialog">
            <button
              type="submit"
              class="btn btn-circle btn-ghost btn-sm"
              aria-label="Close"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </form>
        </div>
        <div class="max-h-[75vh] overflow-y-auto px-5 py-4">
          <Suspense
            fallback={
              <DocumentPreviewLoading
                message="Loading document preview..."
                spinnerClass="loading-md"
              />
            }
          >
            <DocumentPreviewPanel
              path={props.doc()?.path}
              markdown={props.doc()?.markdown ?? ""}
              markdownClass="max-h-[60vh]"
            />
          </Suspense>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button type="submit" aria-label="Close document preview">
          close
        </button>
      </form>
    </dialog>
  );
};
