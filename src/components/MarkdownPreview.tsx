import { renderMarkdown } from "~/utils/MarkdownRederer";

interface MarkdownPreviewProps {
  markdown: string;
}

export default function MarkdownPreview(props: MarkdownPreviewProps) {
  return (
    <div
      class="prose dark:prose-invert max-w-none bg-base-200 p-4 rounded-lg overflow-auto max-h-[70vh] text-sm"
      innerHTML={renderMarkdown(props.markdown)}
    />
  );
}
