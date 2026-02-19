import { Providers } from "../openai_provider.ts";

interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
  }>;
}

async function requestEmbeddings(
  providerName: string,
  path: string,
  body: Record<string, unknown>,
): Promise<EmbeddingResponse> {
  const provider = Providers.get(providerName);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...Providers.authHeaders(providerName),
  };

  const url = `${provider.baseUrl}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(`Could not connect to ${provider.baseUrl}.`);
    }
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(`Request to ${provider.baseUrl} timed out.`);
    }
    throw err;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return await response.json() as EmbeddingResponse;
}

export async function embed(
  texts: string[],
  provider = "openai",
  model?: string,
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  if (texts.some((text) => text.length === 0)) {
    throw new Error("Input texts must not contain empty strings.");
  }

  const selectedProvider = Providers.get(provider);
  const selectedModel = model ?? selectedProvider.defaultEmbeddingModel;
  const data = await requestEmbeddings(provider, "/v1/embeddings", {
    model: selectedModel,
    input: texts,
  });
  return data.data.map((item) => item.embedding);
}
