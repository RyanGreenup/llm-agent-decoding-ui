import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { embed } from "./openai_embeddings.ts";

export interface StoredChunk {
  text: string;
  embedding: number[];
  metadata: Record<string, string>;
}

export type ChunkResult = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x) => typeof x === "number" && Number.isFinite(x))
    .map((x) => x as number);
}

function parseMetadata(value: unknown): Record<string, string> {
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export class VectorStore {
  static readonly TABLE_NAME = "chunks";
  static readonly TEXT_COLUMN = "text";

  #dbPromise: Promise<lancedb.Connection>;
  #tablePromise: Promise<lancedb.Table | null>;

  constructor(path?: string) {
    const dbPathPromise = path
      ? Promise.resolve(path)
      : mkdtemp(join(tmpdir(), "lancedb-"));

    this.#dbPromise = dbPathPromise.then((dbPath) => lancedb.connect(dbPath));
    this.#tablePromise = this.#dbPromise.then(async (db) => {
      const tables = await db.tableNames();
      if (tables.includes(VectorStore.TABLE_NAME)) {
        return await db.openTable(VectorStore.TABLE_NAME);
      }
      return null;
    });
  }

  async #ensureFtsIndex(table: lancedb.Table): Promise<void> {
    try {
      await table.createIndex(VectorStore.TEXT_COLUMN, {
        config: lancedb.Index.fts(),
      });
    } catch {
      // Ignore if index already exists or backend doesn't support creation here.
    }
  }

  async add_chunks(chunks: StoredChunk[]): Promise<void> {
    if (chunks.length === 0) return;

    const rows = chunks.map((c) => ({
      text: c.text,
      vector: c.embedding,
      metadata: JSON.stringify(c.metadata ?? {}),
    }));

    const db = await this.#dbPromise;
    const existing = await this.#tablePromise;
    if (existing === null) {
      const created = await db.createTable(VectorStore.TABLE_NAME, rows);
      await this.#ensureFtsIndex(created);
      this.#tablePromise = Promise.resolve(created);
      return;
    }
    await existing.add(rows);
    await this.#ensureFtsIndex(existing);
  }

  async add_texts(
    texts: string[],
    metadatas?: Record<string, string>[],
    provider = "openai",
    model?: string,
  ): Promise<void> {
    const embeddings = await embed(texts, provider, model);
    const chunks: StoredChunk[] = texts.map((text, i) => ({
      text,
      embedding: embeddings[i] ?? [],
      metadata: metadatas?.[i] ?? {},
    }));
    await this.add_chunks(chunks);
  }

  async search(query_embedding: number[], top_k = 3): Promise<StoredChunk[]> {
    const table = await this.#tablePromise;
    if (table === null) return [];

    const results = await table.search(query_embedding).distanceType("cosine")
      .limit(top_k).toArray();

    return results.map((r) => {
      const row = asRecord(r);
      return {
        text: typeof row.text === "string" ? row.text : "",
        embedding: asNumberArray(row.vector),
        metadata: parseMetadata(row.metadata),
      };
    });
  }

  async search_raw(
    query_embedding: number[],
    top_k = 20,
    query_text?: string,
  ): Promise<ChunkResult[]> {
    const table = await this.#tablePromise;
    if (table === null) return [];

    let query = table.search(query_embedding).distanceType("cosine");
    if (query_text && query_text.trim().length > 0) {
      await this.#ensureFtsIndex(table);
      try {
        const reranker = await lancedb.rerankers.RRFReranker.create();
        query = query.fullTextSearch(query_text).rerank(reranker);
      } catch {
        // Fallback to pure vector ranking if reranker or hybrid search is unavailable.
      }
    }

    const results = await query.limit(top_k).toArray();
    return results.map((r) => asRecord(r));
  }

  get is_empty(): Promise<boolean> {
    return this.#tablePromise.then((table) => table === null);
  }
}
