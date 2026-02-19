import type { ParentProps } from "solid-js";
import { Show, splitProps } from "solid-js";

interface HeroProps {
  title: string;
  subtitle?: string;
}

export default function Hero(props: ParentProps<HeroProps>) {
  const [local, rest] = splitProps(props, ["title", "subtitle", "children"]);

  return (
    <div class="hero min-h-[calc(100vh-4rem)] bg-base-200" {...rest}>
      <div class="hero-content text-center">
        <div class="max-w-md">
          <h1 class="text-5xl font-bold">{local.title}</h1>
          <Show when={local.subtitle}>
            <p class="py-6">{local.subtitle}</p>
          </Show>
          {local.children}
        </div>
      </div>
    </div>
  );
}
