import { type RouteDefinition } from "@solidjs/router";
import { createSignal } from "solid-js";
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

  // #TODO: Connect to actual chat API
  const sendMessage = () => {
    const msg = input().trim();
    if (!msg) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: msg,
    };

    setMessages([...messages(), userMessage]);
    setInput("");
    setIsTyping(true);

    // #TODO: Replace with actual API call
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Connect to /api/chat to see live responses.",
      };
      setMessages([...messages(), aiMessage]);
      setIsTyping(false);
    }, 1500);
  };

  const suggestedQuestions = [
    "What's the High Growth return?",
    "Total annual fees on $100k?",
    "Preservation age if born 1962?",
    "Identify the fees from Section 7",
  ];

  const askSuggested = (question: string) => {
    setInput(question);
    sendMessage();
  };

  return (
    <>
      {/* Chat Container */}
      <ChatContainer
        messages={messages}
        isTyping={isTyping}
        suggestedQuestions={suggestedQuestions}
        onAskSuggested={askSuggested}
      />

      {/* Input Area */}
      <ChatInput value={input} onInput={setInput} onSend={sendMessage} />
    </>
  );
}
