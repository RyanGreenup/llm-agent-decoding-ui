import type { TokenUsage } from "~/lib/types";

interface TokenBreakdownProps {
  usage: TokenUsage;
}

export default function TokenBreakdown(props: TokenBreakdownProps) {
  return (
    <div class="text-xs opacity-60 font-mono">
      prompt: {props.usage.promptTokens.toLocaleString()} ·
      completion: {props.usage.completionTokens.toLocaleString()} ·
      total: {props.usage.totalTokens.toLocaleString()}
    </div>
  );
}
