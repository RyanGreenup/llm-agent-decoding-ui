import { type RouteDefinition } from "@solidjs/router";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import ChatContainer from "~/components/ChatContainer";
import type { Message } from "~/lib/types";
import ChatInput from "~/components/ChatInput";
import { DEFAULT_MODEL_ID } from "~/lib/config";
import { getModels } from "~/lib/models";
import { createProtectedRoute, getUser } from "~/lib/auth";

export const route = {
  preload: () => {
    getUser();
    getModels();
  },
} satisfies RouteDefinition;

type RagApiResponse = {
  sessionId: string;
  documentCount: number;
  answer?: string;
};

export default function RagChat() {
  createProtectedRoute();
  const [messages, setMessages] = createSignal<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Upload one or more documents, then ask questions. I will answer using only the uploaded content.",
    },
  ]);
  const [input, setInput] = createSignal("");
  const [isTyping, setIsTyping] = createSignal(false);
  const [isIndexing, setIsIndexing] = createSignal(false);
  const [selectedModelId] = createSignal(DEFAULT_MODEL_ID);
  const [shouldAutoScroll, setShouldAutoScroll] = createSignal(true);
  const [selectedFiles, setSelectedFiles] = createSignal<File[]>([]);
  const [indexedDocCount, setIndexedDocCount] = createSignal(0);
  const [sessionId, setSessionId] = createSignal<string | undefined>(undefined);

  let scrollViewportRef: HTMLDivElement | undefined;
  let scrollContentRef: HTMLDivElement | undefined;
  let streamAnchorRef: HTMLDivElement | undefined;

  const BOTTOM_THRESHOLD_PX = 96;

  const isNearBottom = (el: HTMLDivElement): boolean =>
    el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD_PX;

  const keepStreamInView = (force = false) => {
    const viewport = scrollViewportRef;
    if (!viewport) return;
    if (!force && !shouldAutoScroll()) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
    streamAnchorRef?.scrollIntoView({ behavior: "auto", block: "end" });
    requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
    });
  };

  onMount(() => {
    const viewport = scrollViewportRef;
    if (!viewport) return;
    const onScroll = () => setShouldAutoScroll(isNearBottom(viewport));
    viewport.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const observer = new ResizeObserver(() => {
      if (isTyping()) keepStreamInView();
    });
    if (scrollContentRef) observer.observe(scrollContentRef);

    onCleanup(() => {
      viewport.removeEventListener("scroll", onScroll);
      observer.disconnect();
    });
  });

  createEffect(() => {
    messages();
    if (!isTyping()) return;
    keepStreamInView();
  });

  const pushAssistantMessage = (content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        content,
      },
    ]);
  };

  const indexDocuments = async () => {
    if (isIndexing() || isTyping()) return;
    const files = selectedFiles();
    if (files.length === 0) return;

    setIsIndexing(true);
    try {
      const form = new FormData();
      if (sessionId()) form.append("sessionId", sessionId()!);
      for (const file of files) {
        form.append("documents", file);
      }

      const response = await fetch("/api/rag-upload-chat", {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = (await response.json()) as RagApiResponse;
      setSessionId(data.sessionId);
      setIndexedDocCount(data.documentCount);
      setSelectedFiles([]);
      pushAssistantMessage(`Indexed ${data.documentCount} document(s). Ask your question.`);
    } catch (error) {
      console.error("document indexing failed:", error);
      pushAssistantMessage("I couldn't index those documents. Try again with text-based or office/PDF files.");
    } finally {
      setIsIndexing(false);
    }
  };

  const sendMessage = async (override?: string) => {
    if (isTyping() || isIndexing()) return;
    const msg = (override ?? input()).trim();
    if (!msg) return;

    if (!sessionId() && selectedFiles().length === 0 && indexedDocCount() === 0) {
      pushAssistantMessage("Upload at least one document before asking a question.");
      return;
    }

    const priorMessages = messages().filter((m) => m.id !== "welcome");
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: msg,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);
    keepStreamInView(true);

    try {
      const history = priorMessages.map(({ role, content }) => ({ role, content }));
      const hadSession = Boolean(sessionId());
      const form = new FormData();
      form.append("question", msg);
      form.append("history", JSON.stringify(history));
      form.append("model", selectedModelId());
      if (hadSession) form.append("sessionId", sessionId()!);

      if (!hadSession) {
        for (const file of selectedFiles()) {
          form.append("documents", file);
        }
      }

      const response = await fetch("/api/rag-upload-chat", {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = (await response.json()) as RagApiResponse;
      setSessionId(data.sessionId);
      setIndexedDocCount(data.documentCount);
      if (!hadSession) setSelectedFiles([]);

      pushAssistantMessage(
        data.answer?.trim()
          ? data.answer
          : "I couldn't generate a grounded answer from the uploaded documents.",
      );
    } catch (error) {
      console.error("chat failed:", error);
      pushAssistantMessage("I hit an error while processing that message. Please try again.");
    } finally {
      setIsTyping(false);
    }
  };

  const suggestedQuestions = [
    "Summarize the key points across all uploaded documents.",
    "List the main risks or caveats mentioned.",
    "What exact numbers or dates are stated in these documents?",
    "Show conflicting statements between documents, if any.",
  ];

  const askSuggested = (question: string) => {
    setInput(question);
    void sendMessage(question);
  };

  return (
    <div class="flex flex-col min-h-full">
      <div class="border-b border-base-300 bg-base-100/80 px-4 py-3">
        <div class="mx-auto max-w-4xl flex flex-col gap-3 md:flex-row md:items-center">
          <input
            type="file"
            multiple
            class="file-input file-input-bordered w-full md:max-w-md"
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              setSelectedFiles(files);
            }}
          />
          <button
            type="button"
            class="btn btn-outline"
            disabled={selectedFiles().length === 0 || isIndexing() || isTyping()}
            onClick={() => void indexDocuments()}
          >
            {isIndexing() ? "Indexing..." : "Index Documents"}
          </button>
          <div class="text-xs opacity-70">
            Indexed: {indexedDocCount()} document(s)
            {selectedFiles().length > 0 ? ` · Pending: ${selectedFiles().length}` : ""}
          </div>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto" ref={scrollViewportRef}>
        <div ref={scrollContentRef} class="pb-24">
          <ChatContainer
            messages={messages}
            isTyping={isTyping}
            suggestedQuestions={suggestedQuestions}
            onAskSuggested={askSuggested}
          />
          <div ref={streamAnchorRef} class="h-px scroll-mb-24" />
        </div>
      </div>
      <ChatInput
        value={input}
        onInput={setInput}
        onSend={() => void sendMessage()}
        disableSend={() => isTyping() || isIndexing()}
      />
    </div>
  );
}
