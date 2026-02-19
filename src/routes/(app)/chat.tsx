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

export default function Chat() {
  createProtectedRoute();
  const [messages, setMessages] = createSignal<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Welcome! I'm your PDS analysis agent. Ask me anything about the NovigiSuper Product Disclosure Statement. I'll search the document, calculate figures like $A = P(1 + r)^n$, and verify my answers against the source.",
    },
  ]);
  const [input, setInput] = createSignal("");
  const [isTyping, setIsTyping] = createSignal(false);
  const [selectedModelId] = createSignal(DEFAULT_MODEL_ID);
  const [shouldAutoScroll, setShouldAutoScroll] = createSignal(true);
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

  const sendMessage = async (override?: string) => {
    if (isTyping()) return;
    const msg = (override ?? input()).trim();
    if (!msg) return;
    const priorMessages = messages();

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: msg,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);
    keepStreamInView(true);
    let assistantId: string | undefined;

    try {
      const history = priorMessages.map(({ role, content }) => ({ role, content }));

      const response = await fetch("/api/chat-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: msg,
          history,
          model: selectedModelId(),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Chat stream failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamed = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const delta = decoder.decode(value, { stream: true });
        if (!delta) continue;
        streamed += delta;
        if (!assistantId) {
          assistantId = `${Date.now()}-assistant`;
          setMessages((prev) => [
            ...prev,
            { id: assistantId!, role: "assistant", content: streamed },
          ]);
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: streamed } : m,
            ),
          );
        }
        keepStreamInView();
        setIsTyping(false);
      }

      const finalDelta = decoder.decode();
      if (finalDelta) {
        streamed += finalDelta;
        if (!assistantId) {
          assistantId = `${Date.now()}-assistant`;
          setMessages((prev) => [
            ...prev,
            { id: assistantId!, role: "assistant", content: streamed },
          ]);
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: streamed } : m,
            ),
          );
        }
      }

      if (!streamed.trim()) {
        if (assistantId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content:
                      "I couldn't generate a response from the document for that question.",
                  }
                : m,
            ),
          );
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `${Date.now()}-assistant`,
              role: "assistant",
              content:
                "I couldn't generate a response from the document for that question.",
            },
          ]);
        }
      }
    } catch (error) {
      console.error("chat failed:", error);
      if (assistantId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    "I hit an error while processing that message. Please try again.",
                }
              : m,
          ),
        );
      } else {
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content:
            "I hit an error while processing that message. Please try again.",
        };
        setMessages((prev) => [...prev, aiMessage]);
      }
    } finally {
      setIsTyping(false);
    }
  };

  const suggestedQuestions = [
    "What's the High Growth return?",
    "Total annual fees on $100k?",
    "Preservation age if born 1962?",
    "Identify the fees from Section 7",
  ];

  const askSuggested = (question: string) => {
    setInput(question);
    void sendMessage(question);
  };

  return (
    <div class="flex flex-col min-h-full">
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
        disableSend={isTyping}
      />
    </div>
  );
}
