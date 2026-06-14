//! ProviderCard — Settings → LLM 选项卡中的单个 LLM provider 行。

import { createSignal, Show } from "solid-js";
import { Effect } from "effect";
import { Card, CardContent, CardHeader, CardFooter } from "../../../shared/ui/card";
import { LLMProviderService, LLMProviderServiceLive } from "../subsystems/llm_providers";
import { SettingsServiceLive } from "../../../shared/lib/tauri";
import type { LLMProvider } from "../../../shared/types";

export function ProviderCard(props: {
  provider: LLMProvider;
  onChange: (next: LLMProvider) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = createSignal(false);
  const [apiKey, setApiKey] = createSignal("");
  const [testStatus, setTestStatus] = createSignal<"idle" | "testing" | "ok" | "fail">("idle");
  const [testMessage, setTestMessage] = createSignal("");

  const saveApiKey = async () => {
    if (!apiKey()) return;
    try {
      const program = Effect.gen(function* () {
        const svc = yield* LLMProviderService;
        yield* svc.setApiKey(props.provider.id, apiKey());
      }).pipe(Effect.provide(LLMProviderServiceLive), Effect.provide(SettingsServiceLive));
      await Effect.runPromise(program);
      setApiKey("");
      setEditing(false);
    } catch (e) {
      console.error("[ProviderCard] setApiKey 失败：", e);
    }
  };

  const testConnection = async () => {
    setTestStatus("testing");
    try {
      const program = Effect.gen(function* () {
        const svc = yield* LLMProviderService;
        return yield* svc.hasApiKey(props.provider.id);
      }).pipe(Effect.provide(LLMProviderServiceLive), Effect.provide(SettingsServiceLive));
      const hasKey = await Effect.runPromise(program);
      if (!hasKey) {
        setTestStatus("fail");
        setTestMessage("Set API key first");
        return;
      }
      setTestStatus("ok");
      setTestMessage("API key configured");
    } catch (e) {
      console.error("[ProviderCard] hasApiKey 失败：", e);
      setTestStatus("fail");
      setTestMessage("Error checking API key");
    }
  };

  return (
    <Card class="mb-3">
      <CardHeader>
        <div class="flex items-center justify-between gap-2">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={props.provider.enabled}
              onChange={(e) =>
                props.onChange({ ...props.provider, enabled: e.currentTarget.checked })
              }
              class="rounded text-primary-500 focus:ring-primary-500 w-4 h-4"
            />
            <span class="text-base font-medium text-zinc-900 dark:text-zinc-100">
              {props.provider.label}
            </span>
          </label>
          <code class="text-xs text-zinc-500 dark:text-zinc-400 font-mono bg-zinc-100 dark:bg-zinc-900 px-2 py-0.5 rounded">
            {props.provider.id}
          </code>
        </div>
      </CardHeader>
      <CardContent class="space-y-3">
        <Show when={props.provider.default_model !== undefined || editing()}>
          <div class="flex items-center gap-2">
            <label class="w-32 text-sm text-zinc-600 dark:text-zinc-400 flex-shrink-0">Model</label>
            <input
              type="text"
              value={props.provider.default_model ?? ""}
              placeholder="e.g. gpt-4o / claude-3-5-sonnet"
              onInput={(e) =>
                props.onChange({ ...props.provider, default_model: e.currentTarget.value })
              }
              class="flex-1 p-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none"
            />
          </div>
        </Show>
        <Show when={props.provider.base_url !== undefined || editing()}>
          <div class="flex items-center gap-2">
            <label class="w-32 text-sm text-zinc-600 dark:text-zinc-400 flex-shrink-0">
              Base URL (OpenAI-compat only)
            </label>
            <input
              type="text"
              value={props.provider.base_url ?? ""}
              placeholder="https://api.openai.com/v1"
              onInput={(e) =>
                props.onChange({ ...props.provider, base_url: e.currentTarget.value })
              }
              class="flex-1 p-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none"
            />
          </div>
        </Show>
        <div class="flex items-center gap-2">
          <label class="w-32 text-sm text-zinc-600 dark:text-zinc-400 flex-shrink-0">API Key</label>
          <Show
            when={editing()}
            fallback={
              <button
                type="button"
                onClick={() => setEditing(true)}
                class="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
              >
                Set API key…
              </button>
            }
          >
            <input
              type="password"
              autocomplete="off"
              value={apiKey()}
              onInput={(e) => setApiKey(e.currentTarget.value)}
              placeholder="sk-…"
              class="flex-1 p-2 border border-zinc-300 dark:border-zinc-600 rounded-md bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void saveApiKey()}
              disabled={!apiKey()}
              class="px-3 py-1.5 text-sm bg-primary-500 text-white rounded-md font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setApiKey("");
              }}
              class="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
            >
              Cancel
            </button>
          </Show>
        </div>
      </CardContent>
      <CardFooter class="flex justify-between items-center flex-wrap gap-2 mt-3">
        <button
          type="button"
          onClick={() => void testConnection()}
          class="px-3 py-1.5 text-sm bg-primary-500 text-white rounded-md font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Test
        </button>
        <Show when={testStatus() !== "idle"}>
          <span
            class={`ml-2 text-sm font-medium ${
              testStatus() === "ok"
                ? "text-green-600 dark:text-green-400"
                : testStatus() === "fail"
                  ? "text-red-600 dark:text-red-400"
                  : "text-zinc-500 dark:text-zinc-400"
            }`}
          >
            {testStatus() === "testing" ? "Testing…" : testMessage()}
          </span>
        </Show>
        <button
          type="button"
          onClick={() => props.onDelete()}
          class="ml-auto text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:underline transition-colors"
        >
          Delete
        </button>
      </CardFooter>
    </Card>
  );
}
