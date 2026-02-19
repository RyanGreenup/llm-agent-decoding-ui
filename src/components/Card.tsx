import type { JSX, ParentProps } from "solid-js";
import { splitProps } from "solid-js";

interface CardProps {
  title?: string;
  actions?: JSX.Element;
}

export default function Card(props: ParentProps<CardProps>) {
  const [local, rest] = splitProps(props, ["title", "actions", "children"]);

  return (
    <div class="card bg-base-100 shadow-sm" {...rest}>
      <div class="card-body">
        {local.title && <h2 class="card-title">{local.title}</h2>}
        {local.children}
        {local.actions && (
          <div class="card-actions justify-end">{local.actions}</div>
        )}
      </div>
    </div>
  );
}
