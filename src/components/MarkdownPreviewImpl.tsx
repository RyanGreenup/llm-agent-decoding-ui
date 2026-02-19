import { renderMarkdown } from "~/utils/MarkdownRederer";

interface MarkdownPreviewImplProps {
  markdown: string;
  class?: string;
}

export default function MarkdownPreviewImpl(props: MarkdownPreviewImplProps) {
  return (
    <div
      class={`prose dark:prose-invert max-w-none ${props.class ?? ""}`}
      innerHTML={renderMarkdown(props.markdown)}
    />
  );
}
