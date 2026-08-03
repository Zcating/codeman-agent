import { For, Show, type JSX, createSignal, onMount, onCleanup } from "solid-js";
import { Plus } from "lucide-solid";
import { ProviderCard } from "@codeman-frontend/features/settings/components/provider-card";
import { createProviderFormDialog } from "@codeman-frontend/features/settings/components/add-provider-dialog";
import { appStore } from "@codeman-frontend/shared/stores/app.store";
import { settingsSaver } from "@codeman-frontend/features/settings/lib/settings-saver";
import { logger } from "@codeman-frontend/shared/lib/logger";
import type { Provider } from "@codeman-frontend/shared/lib/types";

type Pending = {
  providers: Provider[];
  defaultLlmProviderId: string | undefined;
};

export function LlmSection(): JSX.Element {
  // null = no pending changes (read from appStore directly)
  // non-null = pending state (has unsaved data changes)
  const [draft, setDraft] = createSignal<Pending | null>(null);

  // Accordion: only one row expanded at a time (UI state, NOT dirty)
  const [expandedId, setExpandedId] = createSignal<string | null>(null);

  // beforeunload guard handler — kept as ref so we can remove it
  const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
    if (draft() !== null) {
      e.preventDefault();
      e.returnValue = "";
    }
  };

  onMount(() => {
    window.addEventListener("beforeunload", beforeUnloadHandler);
  });

  onCleanup(() => {
    window.removeEventListener("beforeunload", beforeUnloadHandler);
  });

  const displayProviders = (): Provider[] =>
    draft()?.providers ?? appStore.state.value.providers ?? [];

  const displayDefault = (): string | undefined =>
    draft()?.defaultLlmProviderId ?? appStore.state.value.defaultLlmProviderId;

  const isDirty = (): boolean => draft() !== null;

  // ── Accordion ──────────────────────────────────────────────────────────────

  const handleToggleExpand = (id: string): void => {
    if (expandedId() === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
    }
  };

  // ── Pending mutations ───────────────────────────────────────────────────────

  const applyDraft = (updater: (prev: Pending) => Pending): void => {
    const current = appStore.state.value;
    const base: Pending = {
      providers: current.providers ?? [],
      defaultLlmProviderId: current.defaultLlmProviderId,
    };
    setDraft((prev) => (prev === null ? updater(base) : updater(prev)));
  };

  const onSetDefault = (id: string): void => {
    applyDraft((prev) => ({ ...prev, defaultLlmProviderId: id }));
  };

  const onSaveProvider = (updated: Provider): void => {
    applyDraft((prev) => ({
      ...prev,
      providers: prev.providers.map((p) => (p.id === updated.id ? updated : p)),
    }));
    setExpandedId(null);
  };

  const onCancel = (): void => {
    setExpandedId(null);
  };

  const onDelete = (id: string): void => {
    applyDraft((prev) => {
      const remaining = prev.providers.filter((p) => p.id !== id);
      let newDefault = prev.defaultLlmProviderId;
      if (newDefault === id) {
        newDefault = remaining.length > 0 ? remaining[0].id : undefined;
      }
      return { ...prev, providers: remaining, defaultLlmProviderId: newDefault };
    });
    if (expandedId() === id) {
      setExpandedId(null);
    }
  };

  const onAddProvider = async (): Promise<void> => {
    const provider = await createProviderFormDialog();
    if (!provider) {return;}
    applyDraft((prev) => ({
      ...prev,
      providers: [...prev.providers, provider],
    }));
  };

  // ── Page-level Save ────────────────────────────────────────────────────────

  const handleSave = async (): Promise<void> => {
    const d = draft();
    if (!d) {return;}
    appStore.set({
      providers: d.providers,
      defaultLlmProviderId: d.defaultLlmProviderId,
    });
    setDraft(null);
    // flush after appStore.set to persist
    try {
      await settingsSaver.flushNow();
    } catch (e) {
      logger.error("[LlmSection] flushNow failed:", e);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section class="space-y-4">
      <h2 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        LLM Providers
      </h2>
      <Show
        when={displayProviders().length > 0}
        fallback={
          <div class="text-center py-12 space-y-2 border border-dashed border-zinc-300 dark:border-zinc-600 rounded-lg">
            <p class="text-zinc-500 dark:text-zinc-400">
              No providers configured.
            </p>
            <p class="text-zinc-400 dark:text-zinc-500 text-sm">
              Add your first provider to get started.
            </p>
          </div>
        }
      >
        <div class="flex flex-col gap-2">
          <For each={displayProviders()}>
            {(p) => (
              <ProviderCard
                provider={p}
                isExpanded={expandedId() === p.id}
                isDefault={displayDefault() === p.id}
                onToggleExpand={() => handleToggleExpand(p.id)}
                onSetDefault={() => onSetDefault(p.id)}
                onSave={onSaveProvider}
                onCancel={onCancel}
                onDelete={onDelete}
              />
            )}
          </For>
        </div>
      </Show>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => void onAddProvider()}
          class="px-3 py-1.5 text-sm bg-primary-500 text-white rounded-md hover:bg-primary-600"
        >
          <Plus class="h-4 w-4 inline mr-1" />
          Add provider
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          class={isDirty()
            ? "px-4 py-2 text-sm bg-primary-500 text-white rounded-md font-medium hover:bg-primary-600 focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 ring-2 ring-yellow-400"
            : "px-4 py-2 text-sm bg-primary-500 text-white rounded-md font-medium hover:bg-primary-600 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          }
        >
          {isDirty() ? "未保存" : "Save"}
        </button>
      </div>
    </section>
  );
}
