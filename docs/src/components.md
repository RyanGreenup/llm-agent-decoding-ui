# Components

All components live in `src/components/`. They are pure UI — they receive data via props and emit events via callbacks.

## Component Inventory

### Chat

| Component            | File                    | Purpose                                    |
|----------------------|-------------------------|--------------------------------------------|
| `ChatNavbar`         | `ChatNavbar.tsx`        | Top bar: model name, strategy badge        |
| `ChatContainer`      | `ChatContainer.tsx`     | Message list with traces and review badges |
| `ChatInput`          | `ChatInput.tsx`         | Fixed-bottom text input + send button      |
| `SuggestedQuestions`  | `SuggestedQuestions.tsx` | Clickable question buttons                 |

### Message Decorations

| Component          | File                  | Purpose                                      |
|--------------------|-----------------------|----------------------------------------------|
| `AvatarBadge`      | `AvatarBadge.tsx`     | Bot avatar icon                              |
| `ReasoningTrace`   | `ReasoningTrace.tsx`  | Collapsible thought/action/observation steps |
| `ReviewBadge`      | `ReviewBadge.tsx`     | Pass/warning badge with optional note        |
| `TypingIndicator`  | `TypingIndicator.tsx` | Animated three-dot "typing..." indicator     |

### General UI

| Component | File          | Purpose                              |
|-----------|---------------|--------------------------------------|
| `Nav`     | `Nav.tsx`     | Top navigation bar with router links |
| `Hero`    | `Hero.tsx`    | Centered hero banner                 |
| `Card`    | `Card.tsx`    | Generic card wrapper                 |
| `Table`   | `Table.tsx`   | Data table with zebra striping       |
| `Counter` | `Counter.tsx` | Demo counter                         |

See [Chat Components](./chat-components.md) and [UI Components](./ui-components.md) for details.
