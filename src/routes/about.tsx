import { A } from "@solidjs/router";
import Card from "~/components/Card";

export default function About() {
  return (
    <div class="min-h-[calc(100vh-4rem)] bg-base-200 p-8">
      <div class="max-w-2xl mx-auto">
        <h1 class="text-4xl font-bold mb-6">About</h1>
        <Card
          title="LLM Agent UI"
          actions={
            <A href="/" class="btn btn-primary">
              Back Home
            </A>
          }
        >
          <p>Built with SolidJS, Tailwind CSS, and DaisyUI.</p>
        </Card>
      </div>
    </div>
  );
}
