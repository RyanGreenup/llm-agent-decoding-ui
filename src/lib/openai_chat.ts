import { Providers } from "./openai_provider";

// --- Chat types ---

interface Message {
  role: "system" | "developer" | "user" | "assistant" | "tool";
  content: string;
}

interface ChatOptions {
  temperature?: number;
  response_format?: {
    type: "text" | "json_object" | "json_schema";
    json_schema?: {
      name: string;
      description?: string;
      schema: Record<string, unknown>;
      strict?: boolean;
    };
  };
}

interface ChatResponse {
  choices: {
    message: {
      content: string | null;
      refusal?: string | null;
    };
    finish_reason: string;
  }[];
}

// --- Chat function ---

export async function chat(
  messages: Message[],
  providerName: string,
  model: string,
  options?: ChatOptions,
): Promise<string> {
  const provider = Providers.get(providerName);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...Providers.authHeaders(providerName),
  };

  const url = `${provider.baseUrl}/v1/chat/completions`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        ...options,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(
        `Cannot connect to ${providerName} at ${provider.baseUrl}`,
      );
    }
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(`Request to ${providerName} timed out`);
    }
    throw err;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `${providerName} returned HTTP ${response.status}: ${body}`,
    );
  }

  const data: ChatResponse = await response.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error(`${providerName} returned no choices`);
  if (choice.finish_reason === "length") {
    throw new Error(
      `${providerName} response was truncated (finish_reason=length)`,
    );
  }
  if (choice.finish_reason === "content_filter") {
    throw new Error(
      `${providerName} response halted by content filter (finish_reason=content_filter)`,
    );
  }
  if (choice.message.refusal) {
    throw new Error(
      `Model refused the request: ${choice.message.refusal}`,
    );
  }
  const content = choice.message.content;
  if (!content) {
    throw new Error(`${providerName} returned no content`);
  }
  return content;
}
