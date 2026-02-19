import Card from "~/components/Card";
import MarkdownPreview from "~/components/MarkdownPreview";

interface DocumentPreviewPanelProps {
  path?: string;
  markdown: string;
  markdownClass?: string;
}

interface DocumentPreviewLoadingProps {
  message: string;
  spinnerClass?: string;
  class?: string;
}

export function DocumentPreviewLoading(props: DocumentPreviewLoadingProps) {
  return (
    <div class={`flex items-center justify-center gap-3 py-12 ${props.class ?? ""}`}>
      <span class={`loading loading-spinner ${props.spinnerClass ?? "loading-lg"}`} />
      <span>{props.message}</span>
    </div>
  );
}

export default function DocumentPreviewPanel(props: DocumentPreviewPanelProps) {
  return (
    <Card title={props.path ?? "Document"}>
      <MarkdownPreview
        markdown={props.markdown}
        class={`bg-base-200 p-4 rounded-lg overflow-auto text-sm ${props.markdownClass ?? "max-h-[70vh]"}`}
        fallback={<span class="loading loading-spinner loading-sm" />}
      />
    </Card>
  );
}
