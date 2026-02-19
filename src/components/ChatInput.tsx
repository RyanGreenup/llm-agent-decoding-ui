import Send from "lucide-solid/icons/send";
import { type Accessor, splitProps } from "solid-js";

interface ChatInputProps {
  value: Accessor<string>;
  onInput: (value: string) => void;
  onSend: () => void;
}

export default function ChatInput(props: ChatInputProps) {
  const [local] = splitProps(props, ["value", "onInput", "onSend"]);

  return (
    <div class="fixed bottom-0 left-0 right-0 bg-base-100 border-t border-base-300 p-4">
      <div class="max-w-3xl mx-auto flex gap-3">
        <input
          type="text"
          placeholder="Ask about the PDS..."
          class="input input-bordered flex-1 focus:input-primary"
          value={local.value()}
          onInput={(e) => local.onInput(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && local.onSend()}
        />
        <button class="btn btn-primary" onClick={local.onSend}>
          <Send class="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
