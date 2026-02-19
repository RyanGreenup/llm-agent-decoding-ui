import { Show } from "solid-js";
import type { TokenUsage } from "~/lib/types";
import ReviewBadge from "./ReviewBadge";

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function roleLabel(role: string): { text: string; class: string } {
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

interface RoundHeaderProps {
  role: string;
  round: number;
  passed: boolean;
  durationMs: number;
  usage: TokenUsage | null;
}

export default function RoundHeader(props: RoundHeaderProps) {
  const rl = () => roleLabel(props.role);

  return (
    <div class="collapse-title text-sm font-semibold py-2 min-h-0 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span class={`badge badge-sm ${rl().class}`}>
        {rl().text}
      </span>
      <span class="font-mono text-xs opacity-60">
        Round {props.round}
      </span>
      <span class="ml-auto text-xs opacity-50">
        {formatMs(props.durationMs)}
        <Show when={props.usage}>
          {" "}
          · {props.usage!.totalTokens.toLocaleString()} tok
        </Show>
      </span>
      <ReviewBadge class="basis-full sm:basis-auto sm:order-none" status={props.passed ? "pass" : "warning"} />
    </div>
  );
}
