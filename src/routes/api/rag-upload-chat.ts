import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { Message } from "~/lib/chat/openai_rag";
import { _split_document, rag_chat } from "~/lib/chat/openai_rag";
import { VectorStore } from "~/lib/chunking/vector_store_lancedb";
import { readDocument } from "~/lib/dataCleaning/convert_to_markdown";
import { requireUser } from "~/lib/auth";

type RagSession = {
  id: string;
  userId: string;
  store: VectorStore;
  documentCount: number;
  updatedAt: number;
};

type ChatResponse = {
  sessionId: string;
  documentCount: number;
  answer?: string;
};

const MAX_SESSION_AGE_MS = 2 * 60 * 60 * 1000;
const sessions = new Map<string, RagSession>();

function json(data: ChatResponse, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...init?.headers,
    },
  });
}

function cleanExpiredSessions(now = Date.now()): void {
  for (const [id, session] of sessions) {
    if (now - session.updatedAt > MAX_SESSION_AGE_MS) {
      sessions.delete(id);
    }
  }
}

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    (row.role === "user" || row.role === "assistant")
    && typeof row.content === "string"
  );
}

function parseHistory(raw: FormDataEntryValue | null): Message[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMessage);
  } catch {
    return [];
  }
}

function normalizeFilename(name: string): string {
  return basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function readUploadedFile(file: File): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "rag-upload-"));
  const fileName = normalizeFilename(file.name || "upload.txt");
  const tempPath = join(tempDir, fileName);

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(tempPath, bytes);
    return await readDocument(tempPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function indexFiles(
  session: RagSession,
  files: File[],
): Promise<void> {
  for (const file of files) {
    if (file.size === 0) continue;
    const text = (await readUploadedFile(file)).trim();
    if (!text) continue;
    const chunks = await _split_document(text, {
      chunk_size: 512,
      chunk_overlap: 64,
    });
    const metadatas = chunks.map(() => ({ source: file.name }));
    await session.store.add_texts(chunks, metadatas, "openai");
    session.documentCount += 1;
  }
}

function getOrCreateSession(sessionId: string | undefined, userId: string): RagSession {
  if (sessionId) {
    const existing = sessions.get(sessionId);
    if (!existing) {
      throw new Error("Session not found. Upload documents again.");
    }
    if (existing.userId !== userId) {
      throw new Error("Session does not belong to the current user.");
    }
    existing.updatedAt = Date.now();
    return existing;
  }

  const id = randomUUID();
  const created: RagSession = {
    id,
    userId,
    store: new VectorStore(),
    documentCount: 0,
    updatedAt: Date.now(),
  };
  sessions.set(id, created);
  return created;
}

export async function POST(event: any) {
  cleanExpiredSessions();

  try {
    const user = await requireUser();
    const form = await event.request.formData();

    const question = String(form.get("question") ?? "").trim();
    const sessionIdRaw = String(form.get("sessionId") ?? "").trim();
    const model = String(form.get("model") ?? "").trim() || undefined;
    const history = parseHistory(form.get("history"));
    const files = form
      .getAll("documents")
      .filter((entry: FormDataEntryValue): entry is File => entry instanceof File);

    const session = getOrCreateSession(sessionIdRaw || undefined, user.id);

    if (files.length > 0) {
      await indexFiles(session, files);
      session.updatedAt = Date.now();
    }

    if (session.documentCount === 0) {
      return new Response("Upload at least one document.", { status: 400 });
    }

    if (!question) {
      return json({
        sessionId: session.id,
        documentCount: session.documentCount,
      });
    }

    const [answer] = await rag_chat(question, session.store, {
      history,
      provider: "openai",
      chat_model: model,
      top_k: 20,
    });

    session.updatedAt = Date.now();

    return json({
      sessionId: session.id,
      documentCount: session.documentCount,
      answer,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(message, { status: 400 });
  }
}
