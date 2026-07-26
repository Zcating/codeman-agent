//! LlmSection — `/settings/llm` route component.
//!
//! Migrated from settings.tsx (lines 117-153). Renders ProviderCard list +
//! Add provider button + Footer Save button (force flush). The Save button
//! is LLM-specific in the new design since it only persists provider edits.

import { For, Show, type JSX } from "solid-js";
import { Plus } from "lucide-solid";
import { ProviderCard } from "@codeman-frontend/features/settings/components/provider-card";
import { createProviderFormDialog } from "@codeman-frontend/features/settings/components/add-provider-dialog";
import { appStore } from "@codeman-frontend/shared/stores/app.store";
import { settingsSaver } from "@codeman-frontend/features/settings/lib/settings-saver";
import { logger } from "@codeman-frontend/shared/lib/logger";
import type { Provider } from "@codeman-frontend/shared/lib/types";

export function LlmSection(): JSX.Element {
  const onProviderDelete = (id: string): void => {
    const providers =
      appStore.state.value.providers!.filter((p) => p.id !== id);
    appStore.set({ providers });
  };

  const onProviderChange = (next: Provider): void => {
    const providers = appStore.state.value.providers!.map((p) =>
      p.id === next.id ? next : p,
    );
    appStore.set({ providers });
  };

  const onAddProvider = async (): Promise<void> => {
    const provider = await createProviderFormDialog();
    if (!provider) {return;}
    const current = appStore.state.value.providers ?? [];
    appStore.set({ providers: [...current, provider] });
    settingsSaver.scheduleSave();
  };

  const save = async (): Promise<void> => {
    await settingsSaver.flushNow().catch((e: unknown) => {
      logger.error("[LlmSection] flushNow failed:", e);
    });
  };

  return (
    <section class="space-y-4">
      <h2 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        LLM Providers
      </h2>
      <Show
        when={(appStore.state.value.providers ?? []).length > 0}
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
        <For each={appStore.state.value.providers ?? []}>
          {(p) => (
            <ProviderCard
              provider={p}
              onUpdate={onProviderChange}
              onDelete={() => onProviderDelete(p.id)}
            />
          )}
        </For>
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
          onClick={() => void save()}
          class="px-4 py-2 text-sm bg-primary-500 text-white rounded-md font-medium hover:bg-primary-600 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          Save
        </button>
      </div>
    </section>
  );
}