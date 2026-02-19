# State Management

SolidJS uses **signals** for reactive state. No external state library is needed.

## Signals

Create reactive values with `createSignal`:

```tsx
const [messages, setMessages] = createSignal<Message[]>([]);
const [input, setInput] = createSignal("");
const [isTyping, setIsTyping] = createSignal(false);
```

Read a signal by calling it as a function: `messages()`. SolidJS tracks which signals a component reads and re-renders only the affected DOM nodes.

## Passing State to Components

Pass signal **accessors** (the getter function) as props, not the raw value. This preserves reactivity:

```tsx
// Parent
<ChatContainer messages={messages} isTyping={isTyping} />

// Child interface
interface ChatContainerProps {
  messages: Accessor<Message[]>;
  isTyping: Accessor<boolean>;
}

// Child reads the signal
<For each={props.messages()}>
```

For static data (not signals), pass plain values:

```tsx
<ChatNavbar model={activeModelName()} />
```

Here `activeModelName()` is called immediately, so `ChatNavbar` receives a `string | undefined`, not an accessor.

## Derived State

Create derived values with plain functions:

```tsx
const activeModelName = () => {
  const m = models();
  if (!m) return undefined;
  return m.find((model) => model.id === selectedModelId())?.name;
};
```

SolidJS tracks the dependency chain automatically.
