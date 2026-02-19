import { For, Show } from "solid-js";
import type { ExtractionTrace } from "~/lib/types";
import Card from "./Card";
import DataSnapshotCollapse from "./DataSnapshotCollapse";
import ExtractionSummaryBar from "./ExtractionSummaryBar";
import FeedbackBlock from "./FeedbackBlock";
import ReviewBadge from "./ReviewBadge";

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function roleLabel(
  role: string,
): { text: string; class: string } {
  switch (role) {
    case "initial_extraction":
      return { text: "Initial", class: "badge-primary" };
    case "reflection":
      return { text: "Reflection", class: "badge-secondary" };
    case "critic":
      return { text: "Critic", class: "badge-accent" };
    case "tool_call":
      return { text: "Tool Call", class: "badge-info" };
    case "agent":
      return { text: "Agent", class: "badge-warning" };
    default:
      return { text: role, class: "badge-ghost" };
  }
}

export default function ExtractionTraceView(props: {
  trace: ExtractionTrace;
}) {
  return (
    <Card title="Extraction Trace">
      <ExtractionSummaryBar trace={props.trace} />

      {/* Per-round collapsibles */}
      <div class="mt-4 space-y-2">
        <For each={props.trace.rounds}>
          {(round) => {
            const rl = () => roleLabel(round.role);
            return (
              <div class="collapse collapse-arrow bg-base-200 rounded-lg">
                <input type="checkbox" />
                <div class="collapse-title text-sm font-semibold py-2 min-h-0 flex items-center gap-2">
                  <span class={`badge badge-sm ${rl().class}`}>
                    {rl().text}
                  </span>
                  <span class="font-mono text-xs opacity-60">
                    Round {round.round}
                  </span>
                  <ReviewBadge
                    status={round.passed ? "pass" : "warning"}
                  />
                  <span class="ml-auto text-xs opacity-50">
                    {formatMs(round.durationMs)}
                    <Show when={round.usage}>
                      {" "}· {round.usage!.totalTokens.toLocaleString()} tok
                    </Show>
                  </span>
                </div>
                <div class="collapse-content space-y-3 px-3">
                  {/* Token breakdown */}
                  <Show when={round.usage}>
                    <div class="text-xs opacity-60 font-mono">
                      prompt: {round.usage!.promptTokens.toLocaleString()} ·
                      completion: {round.usage!.completionTokens.toLocaleString()} ·
                      total: {round.usage!.totalTokens.toLocaleString()}
                    </div>
                  </Show>

                  {/* Validator feedback (what the model was told to fix) */}
                  <Show when={round.input}>
                    <FeedbackBlock
                      title="Validator Feedback (input)"
                      content={round.input!}
                    />
                  </Show>

                  {/* Extracted data snapshot */}
                  <Show when={round.snapshot}>
                    <DataSnapshotCollapse data={round.snapshot} />
                  </Show>

                  {/* Validation issues for this round */}
                  <Show when={round.validationFeedback}>
                    <FeedbackBlock
                      title="Validation Issues"
                      content={round.validationFeedback!}
                    />
                  </Show>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </Card>
  );
}
