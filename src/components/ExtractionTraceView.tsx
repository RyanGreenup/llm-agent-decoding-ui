import { For, Show } from "solid-js";
import type { ExtractionTrace } from "~/lib/types";
import Card from "./Card";
import DataSnapshotCollapse from "./DataSnapshotCollapse";
import ExtractionSummaryBar from "./ExtractionSummaryBar";
import FeedbackBlock from "./FeedbackBlock";
import RoundHeader from "./RoundHeader";
import TokenBreakdown from "./TokenBreakdown";

export default function ExtractionTraceView(props: {
  trace: ExtractionTrace;
  onRoundElement?: (el: HTMLDivElement, roundNumber: number) => void;
}) {
  return (
    <Card title="Extraction Trace">
      <ExtractionSummaryBar trace={props.trace} />

      {/* Per-round collapsibles */}
      <div class="mt-4 space-y-2">
        <For each={props.trace.rounds}>
          {(round) => (
            <div
              class="collapse collapse-arrow bg-base-200 rounded-lg"
              ref={(el) => props.onRoundElement?.(el, round.round)}
            >
              <input type="checkbox" />
              <RoundHeader
                role={round.role}
                round={round.round}
                passed={round.passed}
                durationMs={round.durationMs}
                usage={round.usage}
              />
              <div class="collapse-content space-y-3 px-3">
                {/* Token breakdown */}
                <Show when={round.usage}>
                  <TokenBreakdown usage={round.usage!} />
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
          )}
        </For>
      </div>
    </Card>
  );
}
