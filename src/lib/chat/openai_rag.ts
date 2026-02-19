import { DEFAULT_MODEL_ID } from "../config";
import { Providers } from "../openai_provider";
import { chat } from "../openai_chat";
import { type ChunkResult, select_chunks } from "../chunking/chunk_selection";
import { embed } from "../chunking/openai_embeddings";
import { VectorStore } from "../chunking/vector_store_lancedb";

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export const CONTEXT_THRESHOLD = 0.25;
const DEFAULT_CONTEXT_WINDOW = 128_000;

export const SYSTEM_PROMPT = `# Identity
You are a helpful assistant that answers questions based on provided documents.

# Instructions
- Ground every answer in the provided documents. Quote or paraphrase relevant passages.
- Only say the documents don't cover something when they are genuinely silent on the topic.`;

export function estimate_tokens(text: string): number {
  return Math.floor(text.length / 4);
}

export function should_chunk(
  document: string,
  context_window?: number,
  _provider = "openai",
): boolean {
  const window = context_window ?? DEFAULT_CONTEXT_WINDOW;
  return estimate_tokens(document) > Math.floor(window * CONTEXT_THRESHOLD);
}

function toChunkResult(value: Record<string, unknown>): ChunkResult | null {
  const text = value.text;
  if (typeof text !== "string" || text.trim().length === 0) return null;

  const distanceCandidates = [
    value._distance,
    value.distance,
    value._score,
    value.score,
    value.relevance,
    value.relevance_score,
  ];
  let distance: number | undefined;
  for (const candidate of distanceCandidates) {
    if (typeof candidate !== "number" || !Number.isFinite(candidate)) continue;
    // Convert common similarity-like scores to a pseudo distance.
    if (candidate >= 0 && candidate <= 1) {
      distance = 1 - candidate;
    } else {
      distance = candidate;
    }
    break;
  }
  if (typeof distance !== "number" || !Number.isFinite(distance)) {
    // Keep chunk usable even if backend omits ranking metadata.
    distance = 0;
  }
  return { text, _distance: distance };
}

export async function _split_document(
  document: string,
  {
    chunk_size = 512,
    chunk_overlap = 64,
  }: {
    chunk_size?: number;
    chunk_overlap?: number;
  } = {},
): Promise<string[]> {
  try {
    const mod = await import("../chunking/chunk_markdown");
    const chunks = await mod.chunk_markdown(document, {
      chunk_size,
      chunk_overlap,
    });
    const texts = chunks
      .map((c: { text: string }) => c.text)
      .filter((text: string) => text.trim().length > 0);
    return texts.length > 0 ? texts : [document];
  } catch (e) {
    console.warn("_split_document: chunking failed, using whole document:", e);
    return [document];
  }
}

export function _build_rag_prompt(
  question: string,
  context_texts: string[],
): string {
  const docs = context_texts
    .map((text, i) => `<document index="${i + 1}">\n${text}\n</document>`)
    .join("\n");
  return `<documents>
${docs}
</documents>

Question: ${question}

Answer using only the documents above. If the documents do not contain enough information to answer, say so — but first check whether relevant facts are present even if a direct answer is not.`;
}

function _build_stuffed_prompt(question: string, document: string): string {
  return `<document>
${document}
</document>

${question}

Answer using only the document above. If the document does not contain enough information to answer, say so — but first check whether relevant facts are present even if a direct answer is not.`;
}

export async function stuffed_chat(
  question: string,
  document: string,
  {
    history,
    provider = "openai",
    chat_model,
    system_prompt = SYSTEM_PROMPT,
  }: {
    history?: Message[];
    provider?: string;
    chat_model?: string;
    system_prompt?: string;
  } = {},
): Promise<[string, Message[]]> {
  const prior = history ? [...history] : [];
  const messages: Message[] = [
    { role: "system", content: system_prompt },
    ...prior,
    {
      role: "user",
      content: _build_stuffed_prompt(question, document),
    },
  ];
  const answer = await chat(
    messages,
    provider,
    chat_model ?? DEFAULT_MODEL_ID,
    { temperature: 0 },
  );
  const historyOut: Message[] = [
    ...prior,
    { role: "user" as const, content: question },
    {
      role: "assistant" as const,
      content: answer,
    },
  ];
  return [answer, historyOut];
}

export async function rag_chat(
  question: string,
  store: VectorStore,
  {
    history,
    top_k = 20,
    provider = "openai",
    chat_model,
    embedding_model,
    system_prompt = SYSTEM_PROMPT,
  }: {
    history?: Message[];
    top_k?: number;
    provider?: string;
    chat_model?: string;
    embedding_model?: string;
    system_prompt?: string;
  } = {},
): Promise<[string, Message[]]> {
  const prior = history ? [...history] : [];
  const queryEmbedding =
    (await embed([question], provider, embedding_model))[0];
  if (!queryEmbedding?.length) {
    throw new Error("rag_chat: embedding returned no vector for the query");
  }
  const rawResults = await store.search_raw(queryEmbedding, top_k, question);
  const chunkResults: ChunkResult[] = rawResults
    .map((r) => toChunkResult(r))
    .filter((r): r is ChunkResult => r !== null);
  const contextWindow = DEFAULT_CONTEXT_WINDOW;
  const selected = select_chunks(question, chunkResults, {
    context_window: contextWindow,
  });
  const selectedWithFallback = selected.length > 0
    ? selected
    : chunkResults.slice(0, Math.max(1, Math.min(top_k, chunkResults.length)));

  const messages: Message[] = [
    { role: "system", content: system_prompt },
    ...prior,
    {
      role: "user",
      content: _build_rag_prompt(
        question,
        selectedWithFallback.map((r: ChunkResult) => r.text),
      ),
    },
  ];
  const answer = await chat(
    messages,
    provider,
    chat_model ?? DEFAULT_MODEL_ID,
    { temperature: 0 },
  );

  const historyOut: Message[] = [
    ...prior,
    { role: "user" as const, content: question },
    {
      role: "assistant" as const,
      content: answer,
    },
  ];
  return [answer, historyOut];
}

export async function ask(
  question: string,
  document: string,
  {
    store,
    history,
    top_k = 20,
    provider = "openai",
    chat_model,
    embedding_model,
    system_prompt = SYSTEM_PROMPT,
    force_rag = false,
    chunk_size = 512,
    chunk_overlap = 64,
  }: {
    store?: VectorStore;
    history?: Message[];
    top_k?: number;
    provider?: string;
    chat_model?: string;
    embedding_model?: string;
    system_prompt?: string;
    force_rag?: boolean;
    chunk_size?: number;
    chunk_overlap?: number;
  } = {},
): Promise<[string, Message[], boolean]> {
  const useRag = force_rag || should_chunk(document, undefined, provider);
  if (!useRag) {
    const [answer, historyOut] = await stuffed_chat(question, document, {
      history,
      provider,
      chat_model,
      system_prompt,
    });
    return [answer, historyOut, false];
  }

  const storeToUse = store ?? new VectorStore();
  if (await storeToUse.is_empty) {
    const chunks = await _split_document(document, {
      chunk_size,
      chunk_overlap,
    });
    await storeToUse.add_texts(chunks, undefined, provider, embedding_model);
  }

  const [answer, historyOut] = await rag_chat(question, storeToUse, {
    history,
    top_k,
    provider,
    chat_model,
    embedding_model,
    system_prompt,
  });
  return [answer, historyOut, true];
}
