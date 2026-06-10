//! Snapshot store. Wires the `snapshot-updated` / `refresh-failed` events
//! to Solid signals so widgets and settings re-render automatically.

import { createMemo, createSignal, onCleanup } from "solid-js";
import {
  getActiveProvider,
  latestSnapshot,
  onEvent,
  setActiveProvider as apiSetActive,
} from "../lib/tauri";
import {
  ALL_PROVIDERS,
  type ProviderId,
  type Snapshot,
  type SnapshotEnvelope,
} from "../lib/types";

const empty: SnapshotEnvelope = {
  provider: "deepseek",
  snapshot: null,
  fetched_at: "",
};

const [envelopes, setEnvelopes] = createSignal<Record<ProviderId, SnapshotEnvelope>>({
  deepseek: { ...empty, provider: "deepseek" },
  minimax: { ...empty, provider: "minimax" },
});

const [activeId, setActiveId] = createSignal<ProviderId>("deepseek");
const [isRefreshing, setIsRefreshing] = createSignal(false);

export { envelopes, activeId, setActiveId, isRefreshing, setIsRefreshing };

let started = false;
export async function startSnapshotStore(): Promise<void> {
  if (started) return;
  started = true;

  try {
    const id = await getActiveProvider();
    setActiveId(id);
  } catch {
    // ignore
  }

  try {
    for (const id of ALL_PROVIDERS) {
      const env = await latestSnapshot(id);
      if (env) {
        setEnvelopes((prev) => ({ ...prev, [id]: env }));
      }
    }
  } catch {
    // ignore
  }

  onEvent("snapshot-updated", (env) => {
    setEnvelopes((prev) => ({ ...prev, [env.provider]: env }));
  });
  onEvent("refresh-failed", ({ provider, error }) => {
    setEnvelopes((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], error },
    }));
  });
}

export function currentEnvelope(): SnapshotEnvelope {
  return envelopes()[activeId()];
}

export function currentSnapshot(): Snapshot | null {
  return currentEnvelope().snapshot ?? null;
}

export function currentFetchedAt(): string | null {
  return currentEnvelope().fetched_at || null;
}

export const currentSnapshotMemo = createMemo(currentSnapshot);
export const currentFetchedAtMemo = createMemo(currentFetchedAt);

export async function switchActive(): Promise<ProviderId> {
  const next = activeId() === "deepseek" ? "minimax" : "deepseek";
  setActiveId(next);
  await apiSetActive(next);
  return next;
}

export function useSnapshotEventsCleanup(): void {
  onCleanup(() => {
    // Listeners live for the app lifetime in v1; nothing to clean up.
  });
}
