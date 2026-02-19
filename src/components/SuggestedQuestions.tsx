import { For } from "solid-js";

interface SuggestedQuestionsProps {
  questions: string[];
  onAsk: (question: string) => void;
}

export default function SuggestedQuestions(props: SuggestedQuestionsProps) {
  return (
    <div class="flex gap-2 mt-3 flex-wrap">
      <For each={props.questions}>
        {(question) => (
          <button
            class="btn btn-xs btn-outline"
            onClick={() => props.onAsk(question)}
          >
            {question}
          </button>
        )}
      </For>
    </div>
  );
}
