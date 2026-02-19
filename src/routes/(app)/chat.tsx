import { type RouteDefinition } from "@solidjs/router";
import { createSignal } from "solid-js";
import ChatContainer from "~/components/ChatContainer";
import type { Message } from "~/lib/types";
import ChatInput from "~/components/ChatInput";
import { DEFAULT_MODEL_ID } from "~/lib/config";
import { getModels } from "~/lib/models";
import { createProtectedRoute, getUser } from "~/lib/auth";
import { stuffedChat } from "~/lib/chat/stuffed-chat";
import { getRawDocPath } from "~/lib/dataCleaning/convert_to_markdown";

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

  const sendMessage = async (override?: string) => {
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

    try {
      const history = priorMessages.map(({ role, content }) => ({ role, content }));
      const documentPath = await getRawDocPath();
      const response = await stuffedChat(
        msg,
        documentPath,
        history,
        selectedModelId(),
      );

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          response.trim() ||
          "I couldn't generate a response from the document for that question.",
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("chat failed:", error);
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "I hit an error while processing that message. Please try again.",
      };
      setMessages((prev) => [...prev, aiMessage]);
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
      <div class="flex-1 overflow-y-auto">
        <ChatContainer
          messages={messages}
          isTyping={isTyping}
          suggestedQuestions={suggestedQuestions}
          onAskSuggested={askSuggested}
        />
      </div>
      <ChatInput value={input} onInput={setInput} onSend={() => void sendMessage()} />
    </div>
  );
}
