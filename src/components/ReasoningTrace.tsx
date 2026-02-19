import { For } from "solid-js";
import type { TraceStep } from "~/lib/types";

interface ReasoningTraceProps {
  steps: TraceStep[];
}

export default function ReasoningTrace(props: ReasoningTraceProps) {
  return (
    <div class="collapse collapse-arrow bg-base-200 rounded-lg mt-3">
      <input type="checkbox" />
      <div class="collapse-title text-xs font-semibold py-2 min-h-0">
        Reasoning trace — {props.steps.length} steps
      </div>
      <div class="collapse-content px-3">
        <For each={props.steps}>
          {(step) => (
            <div
              class={`trace-step trace-${step.type} font-mono text-xs border-l-3 pl-3 mb-2`}
            >
              <span class="font-bold uppercase">{step.type}</span>
              <br />
              {step.content}
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
