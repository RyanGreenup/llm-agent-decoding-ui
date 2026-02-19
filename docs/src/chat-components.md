# Chat Components

These components compose the main chat interface on the home page.

## ChatContainer

The message list. Iterates over `messages()` and renders each message as a DaisyUI chat bubble. Handles:

- **User messages** — right-aligned with user avatar image
- **Assistant messages** — left-aligned with `AvatarBadge` (bot icon)
- **Welcome message** — shows `SuggestedQuestions` inside the bubble
- **Reasoning traces** — shows a collapsible `ReasoningTrace` when `message.trace` exists
- **Review badges** — shows `ReviewBadge` when `message.reviewStatus` exists
- **Typing indicator** — shown at the bottom when `isTyping()` is true

**Props:**

```ts
interface ChatContainerProps {
  messages: Accessor<Message[]>;
  isTyping: Accessor<boolean>;
  suggestedQuestions: string[];
  onAskSuggested: (question: string) => void;
}
```

## ChatInput

Fixed-position input bar at the bottom of the viewport. Sends on Enter or button click.

**Props:**

```ts
interface ChatInputProps {
  value: Accessor<string>;
  onInput: (value: string) => void;
  onSend: () => void;
}
```

Uses `splitProps` to separate local props from spread rest. This is a common SolidJS pattern for forwarding HTML attributes.

## ReasoningTrace

Collapsible panel that renders the agent's thought process. Each step has a type (`thought`, `action`, `observation`, `review`) and content string.

**Props:**

```ts
interface ReasoningTraceProps {
  steps: TraceStep[];
}
```

## ReviewBadge

Displays a pass (green check) or warning (yellow triangle) badge. Accepts spread props for caller-controlled layout (e.g., `class="mt-2"`).

**Props:**

```ts
interface ReviewBadgeProps extends JSX.HTMLAttributes<HTMLDivElement> {
  status: "pass" | "warning";
  note?: string;
}
```
