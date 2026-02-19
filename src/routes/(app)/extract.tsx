import { Show } from "solid-js";
import { useSubmission, type RouteDefinition } from "@solidjs/router";
import Card from "~/components/Card";
import { extractPds } from "~/lib/extraction/queries";
import { createProtectedRoute, getUser } from "~/lib/auth";

export const route = {
  preload: () => {
    getUser();
  },
} satisfies RouteDefinition;

export default function Extract() {
  createProtectedRoute();
  const submission = useSubmission(extractPds);

  return (
    <main class="mx-auto max-w-4xl px-4 py-12 space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-3xl font-bold">PDS Extraction</h1>
        <form action={extractPds} method="post">
          <button
            type="submit"
            class="btn btn-primary"
            disabled={submission.pending}
          >
            {submission.pending ? "Extracting..." : "Extract"}
          </button>
        </form>
      </div>
      <Show when={submission.error}>
        <div class="alert alert-error">{submission.error!.message}</div>
      </Show>
      <Show when={submission.pending}>
        <div class="flex items-center gap-3 py-12 justify-center">
          <span class="loading loading-spinner loading-lg" />
          <span>Extracting PDS data…</span>
        </div>
      </Show>
      <Show when={submission.result}>
        <Card title={submission.result!.path}>
          <pre class="bg-base-200 p-4 rounded-lg overflow-auto max-h-[70vh] text-sm">
            {JSON.stringify(submission.result!.data, null, 2)}
          </pre>
        </Card>
      </Show>
    </main>
  );
}
