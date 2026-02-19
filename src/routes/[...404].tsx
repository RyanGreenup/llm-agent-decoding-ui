import { A } from "@solidjs/router";
import Hero from "~/components/Hero";

export default function NotFound() {
  return (
    <Hero title="404" subtitle="Page not found.">
      <A href="/" class="btn btn-primary">
        Go Home
      </A>
    </Hero>
  );
}
