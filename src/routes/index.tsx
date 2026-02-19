import { createAsync, type RouteDefinition } from "@solidjs/router";
import { createSignal } from "solid-js";
import ChatContainer, { type Message } from "~/components/ChatContainer";
import ChatInput from "~/components/ChatInput";
import ChatNavbar from "~/components/ChatNavbar";
import { DEFAULT_MODEL_ID } from "~/lib/config";
import { getModels } from "~/lib/models";

export const route = {
  preload: () => {
    getModels();
  },
} satisfies RouteDefinition;

export default function Home() {
  const models = createAsync(() => getModels());

  const [messages, setMessages] = createSignal<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Welcome! I'm your PDS analysis agent. Ask me anything about the NovigiSuper Product Disclosure Statement. I'll search the document, calculate figures, and verify my answers against the source.",
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
  ];

  const askSuggested = (question: string) => {
    setInput(question);
    sendMessage();
  };

  const activeModelName = () => {
    const m = models();
    if (!m) return undefined;
    return m.find((model) => model.id === selectedModelId())?.name;
  };

  return (
    <div class="min-h-screen bg-base-200 flex flex-col">
      {/* Navbar */}
      <ChatNavbar model={activeModelName()} />

      {/* Chat Container */}
      <ChatContainer
        messages={messages}
        isTyping={isTyping}
        suggestedQuestions={suggestedQuestions}
        onAskSuggested={askSuggested}
      />

      {/* Input Area */}
      <ChatInput value={input} onInput={setInput} onSend={sendMessage} />
    </div>
  );
}
