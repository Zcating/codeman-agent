//! Stale indicator. Renders nothing when the snapshot is fresh.

import { createMemo, createSignal, onCleanup, Show } from "solid-js";
import { isStale } from "../lib/format";

interface Props {
  fetchedAt: string | null | undefined;
  staleAfterSecs: number;
}

export function StaleBadge(props: Props) {
  const [now, setNow] = createSignal(new Date());
  const timer = setInterval(() => setNow(new Date()), 1000);
  onCleanup(() => clearInterval(timer));

  const stale = createMemo(() => isStale(props.fetchedAt, props.staleAfterSecs, now()));

  return (
    <Show when={stale()}>
      <span class="stale-badge" title="Snapshot is older than the stale threshold">
        stale
      </span>
    </Show>
  );
}
