import { createAsync, type RouteDefinition } from "@solidjs/router";
import { ErrorBoundary, Suspense } from "solid-js";
import Hero from "~/components/Hero";
import Table, { type Column } from "~/components/Table";
import { getModels, type Model } from "~/lib/models";

export const route = {
  preload: () => {
    getModels();
  },
} satisfies RouteDefinition;

const columns: Column<Model>[] = [
  { header: "Name", accessor: (row) => row.name },
  { header: "Provider", accessor: (row) => row.provider },
  { header: "Context Window", accessor: (row) => row.contextWindow.toLocaleString() },
  { header: "Input ($/M tokens)", accessor: (row) => `$${row.inputPrice.toFixed(2)}` },
  { header: "Output ($/M tokens)", accessor: (row) => `$${row.outputPrice.toFixed(2)}` },
];

export default function Home() {
  const models = createAsync(() => getModels(), { deferStream: true });

  return (
    <main>
      <Hero title="LLM Agent" subtitle="A simple interface for interacting with large language models." />
      <div class="mx-auto max-w-4xl px-4 py-8">
        <h2 class="text-2xl font-bold mb-4">Available Models</h2>
        <ErrorBoundary fallback={<div class="alert alert-error">Failed to load models.</div>}>
          <Suspense fallback={<div class="flex justify-center py-12"><span class="loading loading-spinner loading-lg" /></div>}>
            <Table columns={columns} rows={models() ?? []} zebra />
          </Suspense>
        </ErrorBoundary>
      </div>
    </main>
  );
}
