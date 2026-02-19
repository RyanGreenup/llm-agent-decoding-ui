import { Suspense } from "solid-js";
import { createAsync, useSubmission, type RouteDefinition } from "@solidjs/router";
import { clientOnly } from "@solidjs/start";
import Card from "~/components/Card";
import { getConvertedDocument, reconvertDocument } from "~/lib/dataCleaning/queries";
import { createProtectedRoute, getUser } from "~/lib/auth";

const MarkdownPreview = clientOnly(() => import("~/components/MarkdownPreview"));

export const route = {
  preload: () => {
    getUser();
    getConvertedDocument();
  },
} satisfies RouteDefinition;

export default function Document() {
  createProtectedRoute();
  const doc = createAsync(() => getConvertedDocument());
  const submission = useSubmission(reconvertDocument);

  return (
    <main class="mx-auto max-w-4xl px-4 py-12 space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-3xl font-bold">Document Preview</h1>
        <form action={reconvertDocument} method="post">
          <button
            type="submit"
            class="btn btn-primary"
            disabled={submission.pending}
          >
            {submission.pending ? "Converting..." : "Re-convert"}
          </button>
        </form>
      </div>
      <Suspense
        fallback={
          <div class="flex items-center gap-3 py-12 justify-center">
            <span class="loading loading-spinner loading-lg" />
            <span>Converting document…</span>
          </div>
        }
      >
        <Card title={doc()?.path}>
          <MarkdownPreview
            markdown={doc()?.markdown ?? ""}
            fallback={<span class="loading loading-spinner loading-sm" />}
          />
        </Card>
      </Suspense>
    </main>
  );
}
