import { onMount, onCleanup, createEffect } from "solid-js";
import { createJSONEditor, type JSONEditorPropsOptional } from "vanilla-jsoneditor";
import "vanilla-jsoneditor/themes/jse-theme-dark.css";

interface JsonViewerProps {
  data: unknown;
  class?: string;
}

export default function JsonViewer(props: JsonViewerProps) {
  let container!: HTMLDivElement;
  let editor: ReturnType<typeof createJSONEditor> | undefined;

  onMount(() => {
    editor = createJSONEditor({
      target: container,
      props: {
        content: { json: props.data },
        readOnly: true,
        mode: "tree" as JSONEditorPropsOptional["mode"],
        mainMenuBar: false,
      },
    });
  });

  createEffect(() => {
    editor?.set({ json: props.data });
  });

  onCleanup(() => {
    editor?.destroy();
  });

  return <div ref={container} class={`jse-theme-dark ${props.class ?? ""}`} />;
}
