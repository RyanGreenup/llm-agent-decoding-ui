"use server";

import type OpenAI from "openai";

type ExtractionSession = {
  markdown: string;
  messages: OpenAI.ChatCompletionMessageParam[];
  createdAt: number;
};

const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

const sessions = new Map<string, ExtractionSession>();

function purgeExpired() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

export function createSession(
  markdown: string,
  messages: OpenAI.ChatCompletionMessageParam[],
): string {
  "use server";
  purgeExpired();
  const id = crypto.randomUUID();
  sessions.set(id, { markdown, messages, createdAt: Date.now() });
  return id;
}

export function getSession(id: string): ExtractionSession {
  "use server";
  purgeExpired();
  const session = sessions.get(id);
  if (!session) {
    throw new Error("Extraction session not found or expired");
  }
  return session;
}

export function deleteSession(id: string): void {
  "use server";
  sessions.delete(id);
}
