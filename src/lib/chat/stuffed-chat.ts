"use server";

import OpenAI from "openai";
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

const TOOLS: OpenAI.ChatCompletionTool[] = [
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
    },
  },
];

const MAX_TOOL_ROUNDS = 5;

// Cache extracted PDS data per document path to avoid repeated LLM calls
const _pdsCache = new Map<string, PdsData>();

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

async function executeTool(
  name: string,
  documentText: string,
  documentPath: string,
): Promise<string> {
  switch (name) {
    case "extract_pds_data": {
      let data = _pdsCache.get(documentPath);
      if (!data) {
        data = await extractPdsData(documentText);
        _pdsCache.set(documentPath, data);
      }
      return JSON.stringify(data);
    }
    case "get_models": {
      const models = await getModels();
      return JSON.stringify(models);
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
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

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const completion = await client.chat.completions.create({
      model: model || DEFAULT_MODEL_ID,
      messages,
      tools: TOOLS,
    });

    const choice = completion.choices[0];
    if (!choice) {
      throw new Error("Chat failed: no response returned");
    }

    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    // If the model didn't request any tool calls, return the final text
    if (!assistantMessage.tool_calls?.length) {
      return assistantMessage.content ?? "";
    }

    // Execute each tool call and append results
    for (const toolCall of assistantMessage.tool_calls) {
      if (toolCall.type !== "function") continue;
      const result = await executeTool(
        toolCall.function.name,
        text,
        documentPath,
      );
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }

  // If we exhausted rounds, return whatever the last assistant message said
  const last = messages.findLast((m) => m.role === "assistant");
  if (last && "content" in last && typeof last.content === "string") {
    return last.content;
  }
  throw new Error("Chat failed: tool calling loop exceeded maximum rounds");
}
