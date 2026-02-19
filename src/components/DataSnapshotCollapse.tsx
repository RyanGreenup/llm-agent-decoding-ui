import { mergeProps } from "solid-js";
import JsonViewer from "./JsonViewer";

interface DataSnapshotCollapseProps {
  data: unknown;
  title?: string;
}

export default function DataSnapshotCollapse(
  props: DataSnapshotCollapseProps,
) {
  const merged = mergeProps({ title: "Extracted Data" }, props);

  return (
    <details class="collapse bg-base-100 border border-base-300 rounded-lg">
      <summary class="collapse-title text-xs font-bold uppercase opacity-50 min-h-0 py-2">
        {merged.title}
      </summary>
      <div class="collapse-content">
        <JsonViewer
          data={merged.data}
          class="max-h-[40vh] overflow-auto rounded-lg"
        />
      </div>
    </details>
  );
}
