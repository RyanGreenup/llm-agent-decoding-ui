import type { RouteSectionProps } from "@solidjs/router";
import { Suspense } from "solid-js";
import { createProtectedRoute } from "~/lib/auth";
import Nav from "~/components/Nav";

export default function AppLayout(props: RouteSectionProps) {
  createProtectedRoute();

  return (
    <div class="min-h-screen bg-base-200 flex flex-col">
      <Nav />
      <Suspense>{props.children}</Suspense>
    </div>
  );
}
