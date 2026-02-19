"use server";

import OpenAI from "openai";
import { getUser } from "~/lib/auth";

let cachedClient: OpenAI | undefined;
let cachedKey: string | undefined;

export async function getOpenAIApiKey(): Promise<string> {
  "use server";
  await getUser();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }
  return apiKey;
}

export async function getOpenAIClient(): Promise<OpenAI> {
  "use server";
  const apiKey = await getOpenAIApiKey();
  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new OpenAI({ apiKey });
    cachedKey = apiKey;
  }
  return cachedClient;
}
