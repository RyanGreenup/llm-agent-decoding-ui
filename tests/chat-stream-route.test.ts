import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const stuffedChat = vi.fn();
const fakeResult = {
  trace: { model: "m", totalDurationMs: 1, totalUsage: { totalTokens: 1 }, toolCalls: [], rounds: [] },
};

vi.mock("~/lib/auth", () => ({ requireUser: () => requireUser() }));
vi.mock("~/lib/chat/stuffed-chat", () => ({
  stuffedChatStreamWithTrace: (...args: unknown[]) => stuffedChat(...args),
}));
vi.mock("~/lib/dataCleaning/convert_to_markdown", () => ({
  getRawDocPath: async () => "/tmp/doc.md",
}));

import { POST } from "../src/routes/api/chat-stream";

function post(body: unknown) {
  return POST({
    request: new Request("http://localhost/api/chat-stream", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  });
}

describe("POST /api/chat-stream", () => {
  beforeEach(() => {
    requireUser.mockReset().mockResolvedValue({ id: "u1", username: "u" });
    stuffedChat.mockReset().mockResolvedValue(fakeResult);
  });

  it("rejects anonymous callers without calling the LLM", async () => {
    requireUser.mockRejectedValue(new Response(null, { status: 302 }));
    const res = await post({ question: "hi" });
    expect(res.status).toBe(401);
    expect(stuffedChat).not.toHaveBeenCalled();
  });

  it("streams an answer for an authenticated caller", async () => {
    const res = await post({ question: "hi" });
    expect(res.status).toBe(200);
    await res.text();
    expect(stuffedChat).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized question without calling the LLM", async () => {
    const res = await post({ question: "x".repeat(20_000) });
    expect(res.status).toBe(413);
    expect(stuffedChat).not.toHaveBeenCalled();
  });

  it("rejects an oversized history without calling the LLM", async () => {
    const history = Array.from({ length: 500 }, () => ({ role: "user", content: "hello" }));
    const res = await post({ question: "hi", history });
    expect(res.status).toBe(413);
    expect(stuffedChat).not.toHaveBeenCalled();
  });

  it("rejects an oversized model name without calling the LLM", async () => {
    const res = await post({ question: "hi", model: "m".repeat(500) });
    expect(res.status).toBe(400);
    expect(stuffedChat).not.toHaveBeenCalled();
  });
});
