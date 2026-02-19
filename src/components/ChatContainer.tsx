import { For, Show, type Accessor } from "solid-js";

type TraceStep = {
  type: "thought" | "action" | "observation" | "review";
  content: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: TraceStep[];
  reviewStatus?: "pass" | "warning";
  reviewNote?: string;
};

interface ChatContainerProps {
  messages: Accessor<Message[]>;
  isTyping: Accessor<boolean>;
  suggestedQuestions: string[];
  onAskSuggested: (question: string) => void;
}

export type { Message, TraceStep };

export default function ChatContainer(props: ChatContainerProps) {
  return (
    <div class="flex-1 overflow-y-auto p-6 space-y-4 pb-32">
      <For each={props.messages()}>
        {(message) => (
          <div
            class={`chat ${message.role === "user" ? "chat-end" : "chat-start"}`}
          >
            <Show when={message.role === "assistant"}>
              <div class="chat-image avatar placeholder">
                <div class="bg-primary text-primary-content rounded-full w-10">
                  <span class="text-sm font-bold">AI</span>
                </div>
              </div>
            </Show>
            <div
              class={`chat-bubble ${message.role === "user" ? "chat-bubble-primary" : "bg-base-100 text-base-content shadow-sm border border-base-300"} max-w-2xl`}
            >
              <p>{message.content}</p>

              {/* Suggested Questions (only for welcome message) */}
              <Show when={message.id === "welcome"}>
                <div class="flex gap-2 mt-3 flex-wrap">
                  <For each={props.suggestedQuestions}>
                    {(question) => (
                      <button
                        class="btn btn-xs btn-outline"
                        onClick={() => props.onAskSuggested(question)}
                      >
                        {question}
                      </button>
                    )}
                  </For>
                </div>
              </Show>

              {/* Reasoning Trace */}
              <Show when={message.trace && message.trace.length > 0}>
                <div class="collapse collapse-arrow bg-base-200 rounded-lg mt-3">
                  <input type="checkbox" />
                  <div class="collapse-title text-xs font-semibold py-2 min-h-0">
                    Reasoning trace — {message.trace!.length} steps
                  </div>
                  <div class="collapse-content px-3">
                    <For each={message.trace}>
                      {(step) => (
                        <div
                          class={`trace-step trace-${step.type} font-mono text-xs border-l-3 pl-3 mb-2`}
                        >
                          <span class="font-bold uppercase">{step.type}</span>
                          <br />
                          {step.content}
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              {/* Review Badge */}
              <Show when={message.reviewStatus}>
                <div class="flex items-center gap-2 mt-2">
                  <div
                    class={`badge badge-${message.reviewStatus === "pass" ? "success" : "warning"} badge-sm gap-1`}
                  >
                    <Show when={message.reviewStatus === "pass"}>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="3"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </Show>
                    <Show when={message.reviewStatus === "warning"}>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M12 9v2m0 4h.01"
                        />
                      </svg>
                    </Show>
                    Review: {message.reviewStatus?.toUpperCase()}
                  </div>
                  <Show when={message.reviewNote}>
                    <span class="text-xs opacity-40">{message.reviewNote}</span>
                  </Show>
                </div>
              </Show>
            </div>
          </div>
        )}
      </For>

      {/* Typing Indicator */}
      <Show when={props.isTyping()}>
        <div class="chat chat-start">
          <div class="chat-image avatar placeholder">
            <div class="bg-primary text-primary-content rounded-full w-10">
              <span class="text-sm font-bold">AI</span>
            </div>
          </div>
          <div class="chat-bubble bg-base-100 text-base-content shadow-sm border border-base-300">
            <div class="flex items-center gap-1 py-1">
              <span class="w-1.5 h-1.5 rounded-full bg-current opacity-20 animate-pulse"></span>
              <span
                class="w-1.5 h-1.5 rounded-full bg-current opacity-20 animate-pulse"
                style="animation-delay: 0.2s"
              ></span>
              <span
                class="w-1.5 h-1.5 rounded-full bg-current opacity-20 animate-pulse"
                style="animation-delay: 0.4s"
              ></span>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
