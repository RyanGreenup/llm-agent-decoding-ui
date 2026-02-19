import { For, Show, type Accessor } from "solid-js";
import { USER_LOGO } from "~/lib/config";
import type { Message } from "~/lib/types";
import AvatarBadge from "./AvatarBadge";
import MarkdownPreview from "./MarkdownPreview";
import ReasoningTrace from "./ReasoningTrace";
import ReviewBadge from "./ReviewBadge";
import SuggestedQuestions from "./SuggestedQuestions";
import TypingIndicator from "./TypingIndicator";

interface ChatContainerProps {
  messages: Accessor<Message[]>;
  isTyping: Accessor<boolean>;
  suggestedQuestions: string[];
  onAskSuggested: (question: string) => void;
}

export default function ChatContainer(props: ChatContainerProps) {
  return (
    <div class="p-6 space-y-4">
      <For each={props.messages()}>
        {(message) => (
          <div
            class={`chat ${message.role === "user" ? "chat-end" : "chat-start"}`}
          >
            <Show
              when={message.role === "assistant"}
              fallback={
                <div class="chat-image avatar">
                  <div class="w-10 rounded-full">
                    <img src={USER_LOGO} alt="User" />
                  </div>
                </div>
              }
            >
              <AvatarBadge />
            </Show>
            <div
              class={`chat-bubble ${message.role === "user" ? "chat-bubble-primary" : "bg-base-100 text-base-content shadow-sm border border-base-300"} max-w-2xl`}
            >
              <Show
                when={message.role === "assistant"}
                fallback={<p>{message.content}</p>}
              >
                <MarkdownPreview markdown={message.content} class="prose-sm" />
              </Show>

              {/* Suggested Questions (only for welcome message) */}
              <Show when={message.id === "welcome"}>
                <SuggestedQuestions
                  questions={props.suggestedQuestions}
                  onAsk={props.onAskSuggested}
                />
              </Show>

              {/* Reasoning Trace */}
              <Show when={message.trace && message.trace.length > 0}>
                <ReasoningTrace steps={message.trace!} />
              </Show>

              {/* Review Badge */}
              <Show when={message.reviewStatus}>
                <ReviewBadge status={message.reviewStatus!} note={message.reviewNote} class="mt-2" />
              </Show>
            </div>
          </div>
        )}
      </For>

      {/* Typing Indicator */}
      <Show when={props.isTyping()}>
        <TypingIndicator />
      </Show>
    </div>
  );
}
