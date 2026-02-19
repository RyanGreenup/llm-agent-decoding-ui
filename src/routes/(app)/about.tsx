import { A } from "@solidjs/router";
import Card from "~/components/Card";
import Hero from "~/components/Hero";
import { createProtectedRoute } from "~/lib/auth";

export default function About() {
  createProtectedRoute();
  return (
    <main>
      <Hero title="About" subtitle="A simple interface for comparing and exploring large language models." />
    </main>
  );
}

      // <div class="mx-auto max-w-4xl px-4 py-8 space-y-6">
      //   <Card title="What is LLM Agent?">
      //     <p>
      //       LLM Agent provides a clean overview of available large language models,
      //       their pricing, and context window sizes — helping you pick the right model
      //       for your workload.
      //     </p>
      //   </Card>
      //   <Card title="Features">
      //     <ul class="list-disc list-inside space-y-1">
      //       <li>Compare models across providers at a glance</li>
      //       <li>Up-to-date pricing per million tokens</li>
      //       <li>Context window sizes for each model</li>
      //     </ul>
      //   </Card>
      //   <div class="text-center pt-4">
      //     <A href="/chat" class="btn btn-primary">Go to Chat</A>
      //   </div>
      // </div>
