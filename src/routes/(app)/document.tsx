import { Suspense, createSignal } from "solid-js";
import { createAsync, useSubmission, type RouteDefinition } from "@solidjs/router";
import Card from "~/components/Card";
import MarkdownPreview from "~/components/MarkdownPreview";
import {
  downloadDocument,
  getConvertedDocument,
  reconvertDocument,
} from "~/lib/dataCleaning/queries";
import { createProtectedRoute, getUser } from "~/lib/auth";

export const route = {
  preload: () => {
    getUser();
    getConvertedDocument();
  },
} satisfies RouteDefinition;

export default function Document() {
  createProtectedRoute();
  const doc = createAsync(() => getConvertedDocument());
  const submission = useSubmission(reconvertDocument);
  const [downloadPending, setDownloadPending] = createSignal<"docx" | "markdown" | null>(
    null,
  );
  const [downloadError, setDownloadError] = createSignal<string | null>(null);

  function base64ToBlob(base64: string, mimeType: string): Blob {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    return new Blob([bytes], { type: mimeType });
  }

  function triggerFileDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function handleDownload(format: "docx" | "markdown") {
    setDownloadError(null);
    setDownloadPending(format);
    try {
      const file = await downloadDocument(format);
      const blob = base64ToBlob(file.dataBase64, file.mimeType);
      triggerFileDownload(blob, file.filename);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : String(error));
    } finally {
      setDownloadPending(null);
    }
  }

  return (
    <main class="mx-auto max-w-4xl px-4 py-12 space-y-6">
      <div class="flex flex-col gap-4">
        <h1 class="text-3xl font-bold">Document Preview</h1>
        <div class="w-full flex flex-col gap-2 lg:flex-row lg:items-center">
          <div class="join join-vertical w-full lg:w-auto lg:join-horizontal">
            <button
              type="button"
              class="btn btn-outline btn-sm sm:btn-md join-item w-full lg:w-auto"
              disabled={downloadPending() !== null}
              onClick={() => void handleDownload("docx")}
            >
              {downloadPending() === "docx" ? "Downloading DOCX..." : "Download DOCX"}
            </button>
            <button
              type="button"
              class="btn btn-outline btn-sm sm:btn-md join-item w-full lg:w-auto"
              disabled={downloadPending() !== null}
              onClick={() => void handleDownload("markdown")}
            >
              {downloadPending() === "markdown" ? "Downloading Markdown..." : "Download Markdown"}
            </button>
          </div>
          <form class="w-full lg:w-auto" action={reconvertDocument} method="post">
            <button
              type="submit"
              class="btn btn-primary btn-sm sm:btn-md btn-block lg:w-auto"
              disabled={submission.pending}
            >
              {submission.pending ? "Converting..." : "Re-convert"}
            </button>
          </form>
        </div>
      </div>
      {downloadError() && (
        <div class="alert alert-error">
          <span>{downloadError()}</span>
        </div>
      )}
      <Suspense
        fallback={
          <div class="flex items-center gap-3 py-12 justify-center">
            <span class="loading loading-spinner loading-lg" />
            <span>Converting document…</span>
          </div>
        }
      >
        <Card title={doc()?.path}>
          <MarkdownPreview
            markdown={doc()?.markdown ?? ""}
            class="bg-base-200 p-4 rounded-lg overflow-auto max-h-[70vh] text-sm"
            fallback={<span class="loading loading-spinner loading-sm" />}
          />
        </Card>
      </Suspense>
    </main>
  );
}
