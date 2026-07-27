//! ProviderCard — V1.8+ ADR-0015/0016 unified provider card.
//! 1 card per provider with LLM subform (always).
//! V1.8+ ADR-0016: all writes go through appStore (debounced 500ms auto-flush);
//! handleRefreshModels + handleDelete 走 appStore.refreshProviderModels / appStore.deleteProvider,
//! 不用 Effect.gen + ProviderApi 也不再裸 invoke "delete_provider"。
//! Uses Tailwind v4 utility classes only (ADR-0006). No BEM, no <style> blocks.
//!
//! ## Form 模式 (2026-07, Plan C: @tanstack/solid-form)
//!
//! Bug regression 修复 — ProviderCard 之前在 `handleBaseUrlChange` / `handleApiKeyChange` 里
//! 每次按键都 `appStore.set({providers: array.map(...)})`。`settings.tsx` 的
//! `<For each={providers}>` 用引用相等性 diff,看到 item 引用变化后整张 ProviderCard
//! 被卸载+重建 → 输入框 DOM 元素被替换 → 焦点丢失("每输入一个字符就 blur")。
//!
//! Fix: 接 `@tanstack/solid-form` 的 `createForm` + `form.Field`,4 个字段全部走
//! 受控 + onBlur commit。Typing 期间只更新 form 内部 signal,Solid 不传播到 appStore,
//! `<For>` 看到的 providers 数组引用稳定,DOM 不被替换。
//!
//! Validation 用 effect-schema-adapter (Effect Schema → Standard Schema V1),
//! 把 `features/settings/lib/schemas.ts` 里已有的 `Schema.Struct` 直接喂进
//! `form.Field.validators.onBlur`,字段级错误显示在 `CodemanInput` 的 `error` slot。
//!
//! IME 安全保留在 `CodemanInput` (中文拼音 composition 期间 signal 不更新 →
//! Solid 不重设 el.value → IME 状态机不被打破),`form.Field.handleChange` 接收
//! 的是 IME 完成后的一次性 flush,`field().state.value` 始终是 commit 后的字符串。

import { createSignal, Show, For } from "solid-js";
import { Schema } from "effect";
import { Effect, Exit } from "effect";
import { createForm } from "@tanstack/solid-form";
import { appStore } from "@codeman-frontend/shared/stores/app.store";
import { settingsSaver } from "@codeman-frontend/features/settings/lib/settings-saver";
import {
  effectSchema,
  firstErrorMessage,
} from "@codeman-frontend/shared/lib/effect-schema-adapter";
import { formatAppError } from "@codeman-frontend/shared/lib/format-app-error";
import type { Provider } from "@codeman-frontend/shared/lib/types";
import { Button } from "@codeman-frontend/shared/components/ui/button";
import { CodemanInput } from "@codeman-frontend/shared/components/internal/codeman-input";
import { Checkbox } from "@codeman-frontend/shared/components/ui/checkbox";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@codeman-frontend/shared/components/ui/card";
import {
  BaseUrlSchema,
  ModelSchema,
  ApiKeySchema,
} from "@codeman-frontend/features/settings/lib/schemas";

export interface ProviderCardProps {
  provider: Provider;
  /** Called after provider is updated in settings */
  onUpdate: (provider: Provider) => void;
  /** Called after provider is deleted in settings */
  onDelete: (providerId: string) => void;
}

export function ProviderCard(props: ProviderCardProps) {
  // ─── Ephemeral UI state (not committed to form) ───
  const [isRefreshing, setIsRefreshing] = createSignal(false);
  const [refreshMsg, setRefreshMsg] = createSignal<string | null>(null);
  const [isDeleting, setIsDeleting] = createSignal(false);

  // ─── Form (tanstack/solid-form) ────────────────────────────────────────────
  // defaultValues 从 props.provider 初始化 (mount 时一次性)。
  // 每次 `<For>` remount (e.g. parent appStore 变化导致本组件 unmount/remount) 都会
  // 重新创建 form — 这是有意的,因为我们不希望 form 持有与 props 矛盾的"陈旧"值。
  const form = createForm(() => ({
    defaultValues: {
      baseUrl: props.provider.llm.baseUrl,
      apiKey: props.provider.apiKey,
      model: props.provider.llm.defaultModel,
      enabled: props.provider.enabled,
    },
    // Form-level validation (onChange): aggregate 全部 field 的错误。
    // Field-level validation (onBlur): 写在每个 form.Field 上,只有对应 field 出错才显示。
    validators: {
      onChange: effectSchema(
        Schema.Struct({
          baseUrl: BaseUrlSchema,
          apiKey: ApiKeySchema,
          model: ModelSchema,
          enabled: Schema.Boolean,
        }),
      ),
    },
    onSubmit: async ({ value }) => {
      const updated: Provider = {
        ...props.provider,
        enabled: value.enabled,
        apiKey: value.apiKey,
        llm: {
          ...props.provider.llm,
          baseUrl: value.baseUrl,
          defaultModel: value.model,
        },
      };
      const providers = appStore.state.value.providers!.map((p) =>
        p.id === updated.id ? updated : p,
      );
      appStore.set({ providers });
      // V3 e2e: flushNow immediately (bypass debounce) so the
      // subsequent get_settings IPC in tests sees the new key.
      // Production: footer Save button still does the debounced
      // flow via scheduleSave.
      // 这里统一用 flushNow,代价是少一些 debounce 优化,但消除"哪个字段该走哪条
      // 路径"的复杂度。Settings 写入不频繁,这是合理 trade-off。
      void settingsSaver.flushNow().catch(() => {});
      props.onUpdate(updated);
    },
  }));

  // ─── Async handlers (Refresh models / Delete) ───
  // 这两个不归 form 管 — 它们有自己的按钮,无 IME 问题,无 per-keystroke 写 store。

  const handleRefreshModels = async (): Promise<void> => {
    setIsRefreshing(true);
    setRefreshMsg(null);
    // V1.8+ ADR-0016 D1: store refreshProviderModels 已经写 state + 强制 D2 不变量。
    const exit = await Effect.runPromiseExit(
      appStore.refreshProviderModels(props.provider.id),
    );
    if (Exit.isSuccess(exit)) {
      settingsSaver.scheduleSave();
      setRefreshMsg(`Loaded ${exit.value.length} model(s)`);
    } else {
      setRefreshMsg(`Refresh failed: ${formatAppError(exit.cause)}`);
    }
    setIsRefreshing(false);
  };

  const handleDelete = async (): Promise<void> => {
    if (!confirm(`Delete provider "${props.provider.label}"?`)) {
      return;
    }
    setIsDeleting(true);
    // V1.8+ ADR-0016 D4: delete 走 appStore (含 state mutation + 后端 delete IPC)。
    const exit = await Effect.runPromiseExit(
      appStore.deleteProvider(props.provider.id),
    );
    if (Exit.isSuccess(exit)) {
      settingsSaver.scheduleSave();
      props.onDelete(props.provider.id);
    } else {
      setRefreshMsg(`Delete failed: ${formatAppError(exit.cause)}`);
    }
    setIsDeleting(false);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Card class="p-0 overflow-hidden">
      {/* ─── Header: label + enabled toggle ─── */}
      <CardHeader class="flex flex-row items-center justify-between p-4 pb-3">
        <div class="flex flex-col gap-0.5">
          <CardTitle class="text-base font-semibold">
            {props.provider.label}
            <Show
              when={props.provider.llm.baseUrl.startsWith("http://127.0.0.1:")}
            >
              <span
                data-testid="provider-dev-badge"
                class="ml-2 text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              >
                (dev)
              </span>
            </Show>
          </CardTitle>
          <CardDescription class="text-xs font-mono text-muted-foreground">
            {props.provider.id}
          </CardDescription>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-muted-foreground">
            {form.useStore((s) => s.values.enabled) ? "Enabled" : "Disabled"}
          </span>
          <form.Field name="enabled">
            {(field) => (
              <Checkbox
                checked={field().state.value}
                onChange={(e) => {
                  field().handleChange(e.currentTarget.checked);
                  // select 立即 commit (单次操作,无 per-keystroke 写 store 问题)。
                  void form.handleSubmit();
                }}
              />
            )}
          </form.Field>
        </div>
      </CardHeader>
      <CardContent class="space-y-4 p-4 pt-0">
        {/* ─── LLM Subform (always rendered) ─── */}
        <div class="space-y-3 rounded-md border border-border p-3">
          <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            LLM
          </p>

          {/* Model dropdown — commit on change */}
          <div class="flex flex-col gap-1">
            <label class="text-xs text-muted-foreground">Model</label>
            <form.Field
              name="model"
              validators={{ onBlur: effectSchema(ModelSchema) }}
            >
              {(field) => (
                <select
                  class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={field().state.value}
                  onChange={(e) => {
                    field().handleChange(e.currentTarget.value);
                    void form.handleSubmit();
                  }}
                  onBlur={field().handleBlur}
                  data-testid="provider-field-model"
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
              )}
            </form.Field>
          </div>

          {/* Base URL — commit on blur */}
          <div class="flex flex-col gap-1">
            <label class="text-xs text-muted-foreground">Base URL</label>
            <form.Field
              name="baseUrl"
              validators={{ onBlur: effectSchema(BaseUrlSchema) }}
            >
              {(field) => (
                <CodemanInput
                  type="text"
                  value={field().state.value}
                  onValueChange={field().handleChange}
                  onBlur={async () => {
                    field().handleBlur();
                    await form.handleSubmit();
                  }}
                  error={firstErrorMessage(field().state.meta.errors)}
                  placeholder="https://api.example.com/v1"
                />
              )}
            </form.Field>
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
              <span class="text-xs text-muted-foreground">
                {refreshMsg()}
              </span>
            </Show>
          </div>

          {/* LLM API Key — commit on blur (with flushNow) */}
          <div class="flex flex-col gap-1">
            <label class="text-xs text-muted-foreground">LLM API Key</label>
            <form.Field
              name="apiKey"
              validators={{ onBlur: effectSchema(ApiKeySchema) }}
            >
              {(field) => (
                <CodemanInput
                  type="password"
                  value={field().state.value}
                  onValueChange={(v) => {
                    field().handleChange(v);
                    void form.handleSubmit();
                  }}
                  onBlur={async () => {
                    field().handleBlur();
                    await form.handleSubmit();
                  }}
                  error={firstErrorMessage(field().state.meta.errors)}
                  placeholder="sk-…"
                  inputClass="flex-1"
                />
              )}
            </form.Field>
          </div>
        </div>
      </CardContent>

      {/* ─── Footer: delete ─── */}
      <CardFooter class="flex justify-end p-4 pt-0">
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={isDeleting()}
        >
          {isDeleting() ? "Deleting…" : "Delete provider"}
        </Button>
      </CardFooter>
    </Card>
  );
}