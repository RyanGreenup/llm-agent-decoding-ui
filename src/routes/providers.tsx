import { Suspense } from "solid-js";
import { createAsync, type RouteDefinition } from "@solidjs/router";
import Table, { type Column } from "~/components/Table";
import { getProviders, type Provider } from "~/lib/providers";

export const route = {
  preload: () => getProviders(),
} satisfies RouteDefinition;

const columns: Column<Provider>[] = [
  { header: "Provider", accessor: (r) => r.name },
  { header: "Models", accessor: (r) => r.modelsAvailable },
  {
    header: "Avg Input $/M",
    accessor: (r) => `$${r.avgInputPrice.toFixed(2)}`,
  },
  {
    header: "Avg Output $/M",
    accessor: (r) => `$${r.avgOutputPrice.toFixed(2)}`,
  },
  { header: "Max Context", accessor: (r) => r.maxContext.toLocaleString() },
  { header: "Status", accessor: (r) => r.status },
];

export default function Providers() {
  const providers = createAsync(() => getProviders());

  return (
    <main class="mx-auto max-w-4xl px-4 py-12 space-y-6">
      <h1 class="text-3xl font-bold">Provider Comparison</h1>
      <Suspense
        fallback={
          <div class="flex items-center gap-3 py-12 justify-center">
            <span class="loading loading-spinner loading-lg" />
            <span>Loading providers…</span>
          </div>
        }
      >
        <Table columns={columns} rows={providers() ?? []} zebra />
      </Suspense>
    </main>
  );
}
