//! ProviderCard — V1.8+ ADR-0015/0016 unified provider card.
//! 1 card per provider with LLM subform (always).
//! V1.8+ ADR-0016: all writes go through appStore (debounced 500ms auto-flush);
//! handleRefreshModels + handleDelete 走 appStore.refreshProviderModels / appStore.deleteProvider,
//! 不用 Effect.gen + ProviderService 也不再裸 invoke "delete_provider"。
//! Uses Tailwind v4 utility classes only (ADR-0006). No BEM, no <style> blocks.

import { createSignal, Show, For } from "solid-js";
import { Effect, Exit } from "effect";
import { appStore } from "../../../shared/stores/app.store";
import { settingsSaver } from "../lib/settings-saver";
import { formatAppError } from "../../../shared/lib/format-app-error";
import type { Provider } from "../../../shared/lib/types";
import { Button } from "../../../shared/components/ui/button";
import { Input } from "../../../shared/components/ui/input";
import { Checkbox } from "../../../shared/components/ui/checkbox";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../../../shared/components/ui/card";

export interface ProviderCardProps {
  provider: Provider;
  /** Called after provider is updated in settings */
  onUpdate: (provider: Provider) => void;
  /** Called after provider is deleted from settings */
  onDelete: (providerId: string) => void;
}

export function ProviderCard(props: ProviderCardProps) {
  // Local UI state
  const [selectedModel, setSelectedModel] = createSignal(props.provider.llm.defaultModel);
  const [isRefreshing, setIsRefreshing] = createSignal(false);
  const [refreshMsg, setRefreshMsg] = createSignal<string | null>(null);
  const [isDeleting, setIsDeleting] = createSignal(false);

  // ─── Handlers ──────────────────────────────────────────────────

  const handleEnabledToggle = (enabled: boolean) => {
    const updated: Provider = { ...props.provider, enabled };
    const providers = appStore.state.value.providers!.map((p) =>
      p.id === updated.id ? updated : p,
    );
    appStore.set({ providers });
    settingsSaver.scheduleSave();
    props.onUpdate(updated);
  };

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    const updated: Provider = {
      ...props.provider,
      llm: { ...props.provider.llm, defaultModel: modelId },
    };
    const providers = appStore.state.value.providers!.map((p) =>
      p.id === updated.id ? updated : p,
    );
    appStore.set({ providers });
    settingsSaver.scheduleSave();
    props.onUpdate(updated);
  };

  const handleBaseUrlChange = (baseUrl: string) => {
    const updated: Provider = {
      ...props.provider,
      llm: { ...props.provider.llm, baseUrl },
    };
    const providers = appStore.state.value.providers!.map((p) =>
      p.id === updated.id ? updated : p,
    );
    appStore.set({ providers });
    settingsSaver.scheduleSave();
    props.onUpdate(updated);
  };

  const handleRefreshModels = async () => {
    setIsRefreshing(true);
    setRefreshMsg(null);
    // V1.8+ ADR-0016 D1: store refreshProviderModels 已经写 state + 强制 D2 不变量。
    const exit = await Effect.runPromiseExit(appStore.refreshProviderModels(props.provider.id));
    if (Exit.isSuccess(exit)) {
      settingsSaver.scheduleSave();
      setRefreshMsg(`Loaded ${exit.value.length} model(s)`);
    } else {
      setRefreshMsg(`Refresh failed: ${formatAppError(exit.cause)}`);
    }
    setIsRefreshing(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete provider "${props.provider.label}"?`)) {
      return;
    }
    setIsDeleting(true);
    // V1.8+ ADR-0016 D4: delete 走 appStore (含 state mutation + 后端 delete IPC)。
    const exit = await Effect.runPromiseExit(appStore.deleteProvider(props.provider.id));
    if (Exit.isSuccess(exit)) {
      settingsSaver.scheduleSave();
      props.onDelete(props.provider.id);
    } else {
      setRefreshMsg(`Delete failed: ${formatAppError(exit.cause)}`);
    }
    setIsDeleting(false);
  };

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <Card class="p-0 overflow-hidden">
      {/* ─── Header: label + enabled toggle ─── */}
      <CardHeader class="flex flex-row items-center justify-between p-4 pb-3">
        <div class="flex flex-col gap-0.5">
          <CardTitle class="text-base font-semibold">
            {props.provider.label}
            <Show when={props.provider.llm.baseUrl.startsWith("http://127.0.0.1:")}>
              <span data-testid="provider-dev-badge" class="ml-2 text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">(dev)</span>
            </Show>
          </CardTitle>
          <CardDescription class="text-xs font-mono text-muted-foreground">
            {props.provider.id}
          </CardDescription>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-muted-foreground">
            {props.provider.enabled ? "Enabled" : "Disabled"}
          </span>
          <Checkbox
            checked={props.provider.enabled}
            onChange={(e) => handleEnabledToggle(e.currentTarget.checked)}
          />
        </div>
      </CardHeader>
      <CardContent class="space-y-4 p-4 pt-0">
        {/* ─── LLM Subform (always rendered) ─── */}
        <div class="space-y-3 rounded-md border border-border p-3">
          <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">LLM</p>

          {/* Model dropdown */}
          <div class="flex flex-col gap-1">
            <label class="text-xs text-muted-foreground">Model</label>
            <select
              class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={selectedModel()}
              onChange={(e) => handleModelChange(e.currentTarget.value)}
            >
              <For each={props.provider.llm.models}>
                {(m) => (
                  <option value={m.id}>
                    {m.label}
                    {m.deprecated ? " (deprecated)" : ""}
                  </option>
                )}
              </For>
            </select>
          </div>

          {/* Base URL */}
          <div class="flex flex-col gap-1">
            <label class="text-xs text-muted-foreground">Base URL</label>
            <Input
              type="text"
              value={props.provider.llm.baseUrl}
              onInput={(e) => handleBaseUrlChange(e.currentTarget.value)}
              placeholder="https://api.example.com/v1"
            />
          </div>

          {/* Refresh models */}
          <div class="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshModels}
              disabled={isRefreshing()}
            >
              {isRefreshing() ? "Refreshing…" : "Refresh models"}
            </Button>
            <Show when={refreshMsg()}>
              <span class="text-xs text-muted-foreground">{refreshMsg()}</span>
            </Show>
          </div>

          {/* LLM API Key */}
          <div class="flex flex-col gap-1">
            <label class="text-xs text-muted-foreground">LLM API Key</label>
            <Input
              type="password"
              value={props.provider.apiKey}
              onInput={(e) => {
                const updated: Provider = { ...props.provider, apiKey: e.currentTarget.value };
                const providers = appStore.state.value.providers!.map((p) =>
                  p.id === updated.id ? updated : p,
                );
                appStore.set({ providers });
                // V3 e2e: flushNow immediately (bypass debounce) so the
                // subsequent get_settings IPC in tests sees the new key.
                // Production: footer Save button still does the debounced
                // flow via scheduleSave.
                void settingsSaver.flushNow().catch(() => {});
                props.onUpdate(updated);
              }}
              placeholder="sk-…"
              class="flex-1"
            />
          </div>
        </div>
      </CardContent>

      {/* ─── Footer: delete ─── */}
      <CardFooter class="flex justify-end p-4 pt-0">
        <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting()}>
          {isDeleting() ? "Deleting…" : "Delete provider"}
        </Button>
      </CardFooter>
    </Card>
  );
}
