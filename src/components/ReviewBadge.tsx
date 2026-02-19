import { Show, splitProps } from "solid-js";
import Check from "lucide-solid/icons/check";
import TriangleAlert from "lucide-solid/icons/triangle-alert";

interface ReviewBadgeProps {
  status: "pass" | "warning";
  note?: string;
}

export default function ReviewBadge(props: ReviewBadgeProps) {
  const [local, rest] = splitProps(props, ["status", "note"]);

  // NOTE: avoid mt-* here — this component renders inside <td> where top margin causes misalignment
  return (
    <div class="flex items-center gap-2" {...rest}>
      <div
        class={`badge badge-${local.status === "pass" ? "success" : "warning"} badge-sm gap-1`}
      >
        <Show when={local.status === "pass"}>
          <Check class="h-3 w-3" stroke-width={3} />
        </Show>
        <Show when={local.status === "warning"}>
          <TriangleAlert class="h-3 w-3" stroke-width={2} />
        </Show>
        Review: {local.status.toUpperCase()}
      </div>
      <Show when={local.note}>
        <span class="text-xs opacity-40">{local.note}</span>
      </Show>
    </div>
  );
}
