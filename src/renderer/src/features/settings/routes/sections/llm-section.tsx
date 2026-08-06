import { For, Show, type JSX, createSignal } from "solid-js";
import { Plus } from "lucide-solid";
import { ProviderCard } from "@codeman-frontend/features/settings/components/provider-card";
import { createProviderFormDialog } from "@codeman-frontend/features/settings/components/add-provider-dialog";
import { appStore } from "@codeman-frontend/shared/stores/app.store";
import { settingsSaver } from "@codeman-frontend/features/settings/lib/settings-saver";
import { ScrollArea } from "@codeman-frontend/shared/components/ui/scrollarea";
import { Separator } from "@codeman-frontend/shared/components/ui/separator";
import { Button } from "@codeman-frontend/shared/components/ui/button";
import type { Provider } from "@codeman-frontend/shared/lib/types";

export function LlmSection(): JSX.Element {
  // Accordion: only one row expanded at a time (UI state, NOT persisted)
  const [expandedId, setExpandedId] = createSignal<string | null>(null);

  const providers = (): Provider[] => appStore.state.value.providers ?? [];

  const defaultId = (): string | undefined =>
    appStore.state.value.defaultLlmProviderId;

  // ── 操作即保存：每次变更直接写入 appStore 并调度防抖落盘 ──────────────

  const persist = (patch: Parameters<typeof appStore.set>[0]): void => {
    appStore.set(patch);
    settingsSaver.scheduleSave();
  };

  // ── Accordion ──────────────────────────────────────────────────────────────

  const handleToggleExpand = (id: string): void => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  // ── Mutations (immediate persist) ──────────────────────────────────────────

  const onSetDefault = (id: string): void => {
    persist({ defaultLlmProviderId: id });
  };

  const onSaveProvider = (updated: Provider): void => {
    persist({
      providers: providers().map((p) => (p.id === updated.id ? updated : p)),
    });
    setExpandedId(null);
  };

  const onCancel = (): void => {
    setExpandedId(null);
  };

  const onDelete = (id: string): void => {
    persist({ providers: providers().filter((p) => p.id !== id) });
    if (expandedId() === id) {
      setExpandedId(null);
    }
  };

  const onAddProvider = async (): Promise<void> => {
    const provider = await createProviderFormDialog();
    if (!provider) {return;}
    persist({ providers: [...providers(), provider] });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div class="flex flex-col flex-1 min-h-0">
      <ScrollArea
        class="flex-1 min-h-0"
        data-scroll-region="true"
        viewportClass="space-y-4 py-4 pl-4 pr-6"
      >
        <h2 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          LLM Providers
        </h2>
        <Show
          when={providers().length > 0}
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
            <For each={providers()}>
              {(p) => (
                <ProviderCard
                  provider={p}
                  isExpanded={expandedId() === p.id}
                  isDefault={defaultId() === p.id}
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
      </ScrollArea>

      {/* 底部固定栏：添加 provider（不随列表滚动） */}
      <Separator />
      <div class="flex justify-end px-4 py-3 bg-background">
        <Button type="button" onClick={() => void onAddProvider()}>
          <Plus aria-hidden="true" />
          Add provider
        </Button>
      </div>
    </div>
  );
}
