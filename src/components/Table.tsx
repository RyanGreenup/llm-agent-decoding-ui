import type { JSX } from "solid-js";
import { For, splitProps } from "solid-js";

export interface Column<T> {
  header: string;
  accessor: (row: T) => JSX.Element | string | number;
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  zebra?: boolean;
  pinRows?: boolean;
  pinCols?: boolean;
}

export default function Table<T>(props: TableProps<T>) {
  const [local, rest] = splitProps(props, [
    "columns",
    "rows",
    "zebra",
    "pinRows",
    "pinCols",
  ]);

  const tableClass = () => {
    const classes = ["table"];
    if (local.zebra) classes.push("table-zebra");
    if (local.pinRows) classes.push("table-pin-rows");
    if (local.pinCols) classes.push("table-pin-cols");
    return classes.join(" ");
  };

  return (
    <div class="overflow-x-auto" {...rest}>
      <table class={tableClass()}>
        <thead>
          <tr>
            <For each={local.columns}>
              {(col) => <th>{col.header}</th>}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={local.rows}>
            {(row) => (
              <tr>
                <For each={local.columns}>
                  {(col) => <td>{col.accessor(row)}</td>}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
