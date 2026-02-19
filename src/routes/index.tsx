import { createAsync, type RouteDefinition } from "@solidjs/router";
import { createSignal } from "solid-js";
import ChatContainer, { type Message } from "~/components/ChatContainer";
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
      <div class="fixed bottom-0 left-0 right-0 bg-base-100 border-t border-base-300 p-4">
        <div class="max-w-3xl mx-auto flex gap-3">
          <input
            type="text"
            placeholder="Ask about the PDS..."
            class="input input-bordered flex-1 focus:input-primary"
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          />
          <button class="btn btn-primary" onClick={sendMessage}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
