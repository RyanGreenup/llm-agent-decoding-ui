"use server";

import { query } from "@solidjs/router";

export interface Provider {
  id: string;
  name: string;
  modelsAvailable: number;
  avgInputPrice: number;
  avgOutputPrice: number;
  maxContext: number;
  status: "operational" | "degraded" | "down";
}

export const getProviders = query(async (): Promise<Provider[]> => {
  "use server";

  return [
    {
      id: "openai",
      name: "OpenAI",
      modelsAvailable: 2,
      avgInputPrice: 1.33,
      avgOutputPrice: 5.3,
      maxContext: 128_000,
      status: "operational",
    },
    {
      id: "anthropic",
      name: "Anthropic",
      modelsAvailable: 2,
      avgInputPrice: 1.9,
      avgOutputPrice: 9.5,
      maxContext: 200_000,
      status: "operational",
    },
    {
      id: "google",
      name: "Google",
      modelsAvailable: 1,
      avgInputPrice: 0.1,
      avgOutputPrice: 0.4,
      maxContext: 1_000_000,
      status: "degraded",
    },
    {
      id: "meta",
      name: "Meta",
      modelsAvailable: 1,
      avgInputPrice: 0.18,
      avgOutputPrice: 0.18,
      maxContext: 128_000,
      status: "operational",
    },
  ];
}, "providers");
