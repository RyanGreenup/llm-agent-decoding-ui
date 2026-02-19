"use server";

import OpenAI from "openai";
import type { RunnableToolFunctionWithoutParse } from "openai/lib/RunnableFunction";
import { DEFAULT_MODEL_ID } from "~/lib/config";
import { readDocument } from "~/lib/dataCleaning/convert_to_markdown";
import { extractPdsData } from "~/lib/extraction/extract-pds";
import type { PdsData } from "~/lib/extraction/pds-schema";
import { getModels } from "~/lib/models";

let _client: OpenAI | undefined;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI();
  }
  return _client;
}

const BASE_SYSTEM_PROMPT = `# Identity
You are a precise document analyst helping a user understand a document.

# Instructions
- Ground every answer in the document. Quote or paraphrase the relevant passage.
- When asked for a recommendation, surface the facts the document provides — fees, risks, options, conditions — so the user can form their own view.
- If the document contains a general-advice disclaimer, note it briefly but still present the relevant facts.
- Only say the document doesn't cover something when it is genuinely silent on the topic.

# Tools
You have access to tools. Use them when appropriate:
- **extract_pds_data**: Call this when you need precise structured data — specific fee amounts, preservation ages, investment option details, or current-vs-legacy comparisons. Returns a structured JSON object with clearly separated current and legacy product data.
- **get_models**: Call this when the user asks about available LLM models, their pricing, or capabilities.

Prefer using extract_pds_data over manually scanning the raw document when answering questions about specific fees, numbers, or product comparisons.`;

const MAX_TOOL_ROUNDS = 5;

// Cache extracted PDS data per document path to avoid repeated LLM calls.
// Bounded FIFO: evicts the oldest entry when the limit is reached.
const PDS_CACHE_MAX = 20;
const _pdsCache = new Map<string, PdsData>();

function pdsCacheSet(key: string, value: PdsData): void {
  if (_pdsCache.size >= PDS_CACHE_MAX && !_pdsCache.has(key)) {
    const oldest = _pdsCache.keys().next().value!;
    _pdsCache.delete(oldest);
  }
  _pdsCache.set(key, value);
}

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function buildTools(
  documentText: string,
  documentPath: string,
): RunnableToolFunctionWithoutParse[] {
  return [
    {
      type: "function",
      function: {
        name: "extract_pds_data",
        description:
          "Extract structured data from the PDS document. Returns fees, products (current vs legacy), investment options, preservation ages, insurance, and taxation as structured JSON. Use this for precise numeric lookups and current-vs-legacy comparisons.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
          additionalProperties: false,
        },
        function: async () => {
          try {
            let data = _pdsCache.get(documentPath);
            if (!data) {
              const result = await extractPdsData(documentText);
              data = result.data;
              pdsCacheSet(documentPath, data);
            }
            return JSON.stringify(data);
          } catch (e) {
            console.error("extract_pds_data failed:", e);
            return JSON.stringify({ error: "Failed to extract document data." });
          }
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_models",
        description:
          "Get the list of available LLM models with their provider, context window size, pricing, and review status.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
          additionalProperties: false,
        },
        function: async () => {
          try {
            const models = await getModels();
            return JSON.stringify(models);
          } catch (e) {
            console.error("get_models failed:", e);
            return JSON.stringify({ error: "Failed to retrieve models." });
          }
        },
      },
    },
  ];
}

export async function stuffedChat(
  question: string,
  documentPath: string,
  history: ChatMessage[],
  model?: string,
): Promise<string> {
  "use server";
  const client = getClient();
  const text = await readDocument(documentPath);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: BASE_SYSTEM_PROMPT },
    {
      role: "user",
      content: `<document>\n${text}\n</document>`,
    },
    ...history.map(
      (m): OpenAI.ChatCompletionMessageParam => ({
        role: m.role,
        content: m.content,
      }),
    ),
    { role: "user", content: question },
  ];

  const runner = client.chat.completions.runTools(
    {
      model: model || DEFAULT_MODEL_ID,
      messages,
      tools: buildTools(text, documentPath),
    },
    { maxChatCompletions: MAX_TOOL_ROUNDS },
  );

  const content = await runner.finalContent();
  return content ?? "";
}

export async function stuffedChatStream(
  question: string,
  documentPath: string,
  history: ChatMessage[],
  onDelta: (delta: string) => void,
  model?: string,
): Promise<string> {
  "use server";
  const client = getClient();
  const text = await readDocument(documentPath);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: BASE_SYSTEM_PROMPT },
    {
      role: "user",
      content: `<document>\n${text}\n</document>`,
    },
    ...history.map(
      (m): OpenAI.ChatCompletionMessageParam => ({
        role: m.role,
        content: m.content,
      }),
    ),
    { role: "user", content: question },
  ];

  const runner = client.chat.completions.runTools(
    {
      model: model || DEFAULT_MODEL_ID,
      stream: true,
      messages,
      tools: buildTools(text, documentPath),
    },
    { maxChatCompletions: MAX_TOOL_ROUNDS },
  );

  runner.on("content", (delta) => {
    if (delta) onDelta(delta);
  });

  const content = await runner.finalContent();
  return content ?? "";
}
