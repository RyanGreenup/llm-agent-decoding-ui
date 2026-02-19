// Imports compatible with Node (Up until CLI)
import { readFile } from "node:fs/promises";
import process from "node:process";
import { Providers } from "../openai_provider.ts";
import { chat } from "../openai_chat.ts";
import { type ChunkResult, select_chunks } from "./chunk_selection.ts";
import { embed } from "./openai_embeddings.ts";
import { VectorStore } from "./vector_store_lancedb.ts";

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export const CONTEXT_THRESHOLD = 0.25;

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
  provider = "openai",
): boolean {
  const window = context_window ?? Providers.get(provider).contextWindow;
  return estimate_tokens(document) > Math.floor(window * CONTEXT_THRESHOLD);
}

function toChunkResult(value: Record<string, unknown>): ChunkResult | null {
  const text = value.text;
  const distance = value._distance;
  if (typeof text !== "string" || typeof distance !== "number") return null;
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
    const mod = await import("./chunk_markdown.ts");
    const chunks = await mod.chunk_markdown(document, {
      chunk_size,
      chunk_overlap,
    });
    const texts = chunks
      .map((c) => c.text)
      .filter((text) => text.trim().length > 0);
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
    chat_model ?? Providers.get(provider).defaultChatModel,
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
  const chunkResults = rawResults
    .map((r) => toChunkResult(r))
    .filter((r) => r !== null);
  const contextWindow = Providers.get(provider).contextWindow;
  const selected = select_chunks(question, chunkResults, {
    context_window: contextWindow,
  });

  const messages: Message[] = [
    { role: "system", content: system_prompt },
    ...prior,
    {
      role: "user",
      content: _build_rag_prompt(
        question,
        selected.map((r) => r.text),
      ),
    },
  ];
  const answer = await chat(
    messages,
    provider,
    chat_model ?? Providers.get(provider).defaultChatModel,
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

// --- CLI --- (Only at this point are Deno-specific imports allowed)

if (import.meta.main) {
  const { Command, EnumType } = await import("@cliffy/command");
  const providerType = new EnumType(Providers.names());

  await new Command()
    .name("openai_rag")
    .description("Ask questions over your documents using RAG.")
    .type("provider", providerType)
    .arguments("<question:string>")
    .option(
      "-d, --doc <path:string>",
      "Text files to use as context. Repeat for multiple docs.",
      { collect: true, default: [] as string[] },
    )
    .option(
      "-s, --store <path:string>",
      "LanceDB directory for the vector store.",
      { default: "" },
    )
    .option("--provider <name:provider>", "API provider.", {
      default: "openai",
    })
    .option("--chat-model <name:string>", "Chat model.", { default: "" })
    .option("--embedding-model <name:string>", "Embedding model.", {
      default: "",
    })
    .option("-k, --top-k <n:number>", "Top-k candidates.", { default: 20 })
    .option("--chunk-size <n:number>", "Max size of indexed text chunks.", {
      default: 512,
    })
    .option("--chunk-overlap <n:number>", "Overlap between adjacent chunks.", {
      default: 64,
    })
    .option("--force-rag", "Always use RAG even for small documents.")
    .option("-i, --interactive", "Continue asking questions.")
    .action(async (options, question: string) => {
      try {
        const docs = options.doc as string[];
        if (docs.length === 0 && !options.store) {
          throw new Error("No documents provided. Use --doc or --store.");
        }

        const parts = await Promise.all(
          docs.map((path) => readFile(path, "utf8")),
        );
        const fullText = parts.join("\n\n");
        const store = new VectorStore(options.store || undefined);

        let [answer, history, usedRag] = await ask(question, fullText, {
          store,
          top_k: options.topK,
          provider: options.provider,
          chat_model: options.chatModel || undefined,
          embedding_model: options.embeddingModel || undefined,
          force_rag: options.forceRag,
          chunk_size: options.chunkSize,
          chunk_overlap: options.chunkOverlap,
        });
        console.log(`[${usedRag ? "RAG" : "full-context"}] ${answer}`);

        if (!options.interactive) return;

        const readline = await import("node:readline/promises");
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        try {
          while (true) {
            const followUp = (await rl.question("> ")).trim();
            if (!followUp || followUp === "exit" || followUp === "quit") break;
            [answer, history, usedRag] = await ask(followUp, fullText, {
              store,
              history,
              top_k: options.topK,
              provider: options.provider,
              chat_model: options.chatModel || undefined,
              embedding_model: options.embeddingModel || undefined,
              force_rag: options.forceRag,
              chunk_size: options.chunkSize,
              chunk_overlap: options.chunkOverlap,
            });
            console.log(`[${usedRag ? "RAG" : "full-context"}] ${answer}`);
          }
        } finally {
          rl.close();
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : err);
        Deno.exit(1);
      }
    })
    .parse(Deno.args);
}
