//! ProviderCard — V1.7+ ADR-0015 unified provider card.
//! 1 card per provider with LLM subform (always) + Billing subform (if provider.billing).
//! All writes go through appStore (debounced 500ms auto-flush); no direct invoke for settings.
//! LLM API Key + Billing API Key collapsed to single Provider.api_key field.
//! Uses Tailwind v4 utility classes only (ADR-0006). No BEM, no <style> blocks.

import { createSignal, Show, For } from "solid-js";
import { Effect } from "effect";
import { invoke } from "../../../shared/lib/tauri";
import { appStore } from "../../../shared/stores/app.store";
import { settingsSaver } from "../lib/settings-saver";
import type { Provider, ModelMeta } from "../../../shared/lib/types";
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
  const [selectedModel, setSelectedModel] = createSignal(props.provider.llm.default_model);
  const [isRefreshing, setIsRefreshing] = createSignal(false);
  const [refreshMsg, setRefreshMsg] = createSignal<string | null>(null);
  const [isDeleting, setIsDeleting] = createSignal(false);

  // ─── Handlers ───────────────────────────────────────────────

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
      llm: { ...props.provider.llm, default_model: modelId },
    };
    const providers = appStore.state.value.providers!.map((p) =>
      p.id === updated.id ? updated : p,
    );
    appStore.set({ providers });
    settingsSaver.scheduleSave();
    props.onUpdate(updated);
  };

  const handleBaseUrlChange = (base_url: string) => {
    const updated: Provider = {
      ...props.provider,
      llm: { ...props.provider.llm, base_url },
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
    try {
      const models = await Effect.runPromise(
        invoke<ModelMeta[]>("fetch_models", { providerId: props.provider.id }),
      );
      const updated: Provider = {
        ...props.provider,
        llm: { ...props.provider.llm, models },
      };
      const providers = appStore.state.value.providers!.map((p) =>
        p.id === updated.id ? updated : p,
      );
      appStore.set({ providers });
      settingsSaver.scheduleSave();
      props.onUpdate(updated);
      setRefreshMsg(`Loaded ${models.length} model(s)`);
    } catch (e) {
      setRefreshMsg(`Refresh failed: ${e}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleBillingKindChange = (kind: "balance" | "plan_quota") => {
    if (!props.provider.billing) return;
    const updated: Provider = {
      ...props.provider,
      billing: { ...props.provider.billing, kind },
    };
    const providers = appStore.state.value.providers!.map((p) =>
      p.id === updated.id ? updated : p,
    );
    appStore.set({ providers });
    settingsSaver.scheduleSave();
    props.onUpdate(updated);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete provider "${props.provider.label}"?`)) return;
    setIsDeleting(true);
    try {
      const providers = appStore.state.value.providers!.filter((p) => p.id !== props.provider.id);
      appStore.set({ providers });
      settingsSaver.scheduleSave();
      props.onDelete(props.provider.id);
    } finally {
      setIsDeleting(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────

  return (
    <Card class="p-0 overflow-hidden">
      {/* ── Header: label + enabled toggle ── */}
      <CardHeader class="flex flex-row items-center justify-between p-4 pb-3">
        <div class="flex flex-col gap-0.5">
          <CardTitle class="text-base font-semibold">{props.provider.label}</CardTitle>
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
        {/* ── LLM Subform (always rendered) ── */}
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
              value={props.provider.llm.base_url}
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
              value={props.provider.api_key}
              onInput={(e) => {
                const updated: Provider = { ...props.provider, api_key: e.currentTarget.value };
                const providers = appStore.state.value.providers!.map((p) =>
                  p.id === updated.id ? updated : p,
                );
                appStore.set({ providers });
                settingsSaver.scheduleSave();
                props.onUpdate(updated);
              }}
              placeholder="sk-…"
              class="flex-1"
            />
          </div>
        </div>

        {/* ── Billing Subform (only if provider.billing exists) ── */}
        <Show when={props.provider.billing}>
          <div class="space-y-3 rounded-md border border-border p-3">
            <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Billing
            </p>

            {/* Billing kind */}
            <div class="flex flex-col gap-1">
              <label class="text-xs text-muted-foreground">Kind</label>
              <select
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={props.provider.billing!.kind}
                onChange={(e) =>
                  handleBillingKindChange(e.currentTarget.value as "balance" | "plan_quota")
                }
              >
                <option value="balance">Balance</option>
                <option value="plan_quota">Plan Quota</option>
              </select>
            </div>

            {/* Billing API Key */}
            <div class="flex flex-col gap-1">
              <label class="text-xs text-muted-foreground">Billing API Key</label>
              <Input
                type="password"
                value={props.provider.api_key}
                onInput={(e) => {
                  const updated: Provider = { ...props.provider, api_key: e.currentTarget.value };
                  const providers = appStore.state.value.providers!.map((p) =>
                    p.id === updated.id ? updated : p,
                  );
                  appStore.set({ providers });
                  settingsSaver.scheduleSave();
                  props.onUpdate(updated);
                }}
                placeholder="sk-…"
                class="flex-1"
              />
              <p class="text-xs text-muted-foreground">
                Same key used for LLM and billing (ADR-0015)
              </p>
            </div>
          </div>
        </Show>
      </CardContent>

      {/* ── Footer: delete ── */}
      <CardFooter class="flex justify-end p-4 pt-0">
        <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting()}>
          {isDeleting() ? "Deleting…" : "Delete provider"}
        </Button>
      </CardFooter>
    </Card>
  );
}
