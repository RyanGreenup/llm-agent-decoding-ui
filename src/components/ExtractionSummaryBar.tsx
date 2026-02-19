import { Show } from "solid-js";
import type { ExtractionTrace } from "~/lib/types";
import ReviewBadge from "./ReviewBadge";

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

export default function ExtractionSummaryBar(props: {
  trace: ExtractionTrace;
}) {
  return (
    <div class="stats stats-horizontal shadow-sm bg-base-200 w-full text-sm">
      <div class="stat py-2 px-4">
        <div class="stat-title text-xs">Model</div>
        <div class="stat-value text-sm font-mono">{props.trace.model}</div>
      </div>

      <div class="stat py-2 px-4">
        <div class="stat-title text-xs">Rounds</div>
        <div class="stat-value text-sm">{props.trace.rounds.length}</div>
      </div>

      <Show when={props.trace.reflectionCount > 0}>
        <div class="stat py-2 px-4">
          <div class="stat-title text-xs">Reflections</div>
          <div class="stat-value text-sm">{props.trace.reflectionCount}</div>
        </div>
      </Show>

      <div class="stat py-2 px-4">
        <div class="stat-title text-xs">Tokens</div>
        <div class="stat-value text-sm">
          {props.trace.totalUsage.totalTokens.toLocaleString()}
        </div>
      </div>

      <div class="stat py-2 px-4">
        <div class="stat-title text-xs">Duration</div>
        <div class="stat-value text-sm">
          {formatMs(props.trace.totalDurationMs)}
        </div>
      </div>

      <div class="stat py-2 px-4 flex items-center">
        <ReviewBadge status={props.trace.finalPassed ? "pass" : "warning"} />
      </div>
    </div>
  );
}
