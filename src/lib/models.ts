import { query } from "@solidjs/router";

export interface Model {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  inputPrice: number;
  outputPrice: number;
  reviewStatus?: "pass" | "warning";
  reviewNote?: string;
}

export const getModels = query(async (): Promise<Model[]> => {
  "use server";

  // Simulate latency from a real data source
  await new Promise((r) => setTimeout(r, 800));

  return [
    { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", contextWindow: 128_000, inputPrice: 2.50, outputPrice: 10.00, reviewStatus: "pass", reviewNote: "Reliable general-purpose model" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", contextWindow: 128_000, inputPrice: 0.15, outputPrice: 0.60, reviewStatus: "pass" },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "Anthropic", contextWindow: 200_000, inputPrice: 3.00, outputPrice: 15.00, reviewStatus: "pass", reviewNote: "Top-tier coding performance" },
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", provider: "Anthropic", contextWindow: 200_000, inputPrice: 0.80, outputPrice: 4.00, reviewStatus: "pass" },
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "Google", contextWindow: 1_000_000, inputPrice: 0.10, outputPrice: 0.40, reviewStatus: "warning", reviewNote: "Rate limits may apply" },
    { id: "llama-3.3-70b", name: "Llama 3.3 70B", provider: "Meta", contextWindow: 128_000, inputPrice: 0.18, outputPrice: 0.18, reviewStatus: "warning", reviewNote: "Self-hosted only" },
  ];
}, "models");
