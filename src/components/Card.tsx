import type { JSX, ParentProps } from "solid-js";
import { Show, splitProps } from "solid-js";

interface CardProps {
  title?: string;
  actions?: JSX.Element;
}

export default function Card(props: ParentProps<CardProps>) {
  const [local, rest] = splitProps(props, ["title", "actions", "children"]);

  return (
    <div class="card bg-base-100 shadow-sm" {...rest}>
      <div class="card-body">
        <Show when={local.title}>
          <h2 class="card-title">{local.title}</h2>
        </Show>
        {local.children}
        <Show when={local.actions}>
          <div class="card-actions justify-end">{local.actions}</div>
        </Show>
      </div>
    </div>
  );
}
