import { Suspense } from "solid-js";
import { createAsync, type RouteDefinition } from "@solidjs/router";
import { clientOnly } from "@solidjs/start";
import Card from "~/components/Card";
import { getConvertedDocument } from "~/lib/dataCleaning/queries";

const MarkdownPreview = clientOnly(() => import("~/components/MarkdownPreview"));

export const route = {
  preload: () => {
    getConvertedDocument();
  },
} satisfies RouteDefinition;

export default function Document() {
  const doc = createAsync(() => getConvertedDocument());

  return (
    <main class="mx-auto max-w-4xl px-4 py-12 space-y-6">
      <h1 class="text-3xl font-bold">Document Preview</h1>
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
