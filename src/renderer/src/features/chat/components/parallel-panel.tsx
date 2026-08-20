import { For, Show, createMemo, type JSX } from "solid-js";
import { SubAgentStream } from "./sub-agent-stream";
import type { DelegateStreamEntry } from "../stores/delegate-streams.store";

interface ParallelPanelProps {
  entries: DelegateStreamEntry[];
}

export function ParallelPanel(props: ParallelPanelProps): JSX.Element {
  const gridColsClass = createMemo(() => {
    const count = props.entries.length;
    if (count <= 1) {return "grid-cols-1";}
    if (count === 2) {return "grid-cols-1 sm:grid-cols-2";}
    return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
  });

  return (
    <Show
      when={props.entries.length > 0}
      fallback={null}
    >
      <div
        class={`grid ${gridColsClass()} gap-4 my-3`}
        data-testid="parallel-panel"
      >
        <For each={props.entries}>
          {(entry) => <SubAgentStream entry={entry} />}
        </For>
      </div>
    </Show>
  );
}
