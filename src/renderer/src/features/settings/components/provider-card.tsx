
import { createSignal, Show, For, createMemo } from "solid-js";
import type { Provider } from "@codeman-frontend/shared/lib/types";
import type { ModelMeta } from "@codeman-frontend/shared/lib/types";
import { Button } from "@codeman-frontend/shared/components/ui/button";
import { CodemanInput } from "@codeman-frontend/shared/components/internal/codeman-input";
import {
  BaseUrlSchema,
  ApiKeySchema,
} from "@codeman-frontend/features/settings/lib/schemas";
import { firstErrorMessage, effectSchema } from "@codeman-frontend/shared/lib/effect-schema-adapter";
import { parseModelsApiResponse } from "@codeman-frontend/shared/lib/parse-models-api-response";

export interface ProviderCardProps {
  provider: Provider;
  isExpanded: boolean;
  isDefault: boolean;
  onToggleExpand: () => void;
  onSetDefault: () => void;
  onSave: (provider: Provider) => void;
  onCancel: () => void;
  onDelete: (providerId: string) => void;
}

interface ModelRow {
  id: string;
  label: string;
  contextWindow: string;
  deprecated: boolean;
  thinking: boolean;
}

const emptyModelRow = (): ModelRow => ({
  id: "",
  label: "",
  contextWindow: "",
  deprecated: false,
  thinking: false,
});

export function ProviderCard(props: ProviderCardProps) {
  // --- Local form state (discarded on cancel) ---
  const [localComment, setLocalComment] = createSignal(props.provider.comment ?? "");
  const [localBaseUrl, setLocalBaseUrl] = createSignal(props.provider.llm.baseUrl);
  const [localApiKey, setLocalApiKey] = createSignal(props.provider.apiKey);
  const [localDefaultModel, setLocalDefaultModel] = createSignal(props.provider.llm.defaultModel);
  const [localModels, setLocalModels] = createSignal<ModelRow[]>(
    props.provider.llm.models.map((m) => ({
      id: m.id,
      label: m.label,
      contextWindow: m.contextWindow != null ? String(m.contextWindow) : "",
      deprecated: m.deprecated,
      thinking: m.thinking ?? false,
    })),
  );

  // Validation errors
  const [baseUrlError, setBaseUrlError] = createSignal<string | undefined>(undefined);
  const [apiKeyError, setApiKeyError] = createSignal<string | undefined>(undefined);

  // Test connection state
  const [testStatus, setTestStatus] = createSignal<{ kind: "idle" } | { kind: "testing" } | { kind: "success" } | { kind: "error"; message: string }>({ kind: "idle" });
  const [isTesting, setIsTesting] = createSignal(false);

  // Delete confirmation
  const [isDeleting, setIsDeleting] = createSignal(false);

  // Hover state for delete button
  const [isHovered, setIsHovered] = createSignal(false);

  const labelDisplay = createMemo(() => {
    const c = props.provider.comment;
    return c ? `${props.provider.label} · ${c}` : props.provider.label;
  });

  const modelCount = createMemo(() => props.provider.llm.models.length);

  const isDev = createMemo(() =>
    props.provider.llm.baseUrl.startsWith("http://127.0.0.1:"),
  );

  // --- Sync local state when provider changes externally ---
  const syncFromProvider = () => {
    setLocalComment(props.provider.comment ?? "");
    setLocalBaseUrl(props.provider.llm.baseUrl);
    setLocalApiKey(props.provider.apiKey);
    setLocalDefaultModel(props.provider.llm.defaultModel);
    setLocalModels(
      props.provider.llm.models.map((m) => ({
        id: m.id,
        label: m.label,
        contextWindow: m.contextWindow != null ? String(m.contextWindow) : "",
        deprecated: m.deprecated,
        thinking: m.thinking ?? false,
      })),
    );
    setTestStatus({ kind: "idle" });
  };

  // When expanded changes to true, sync from current provider (in case it changed while collapsed)
  createMemo(() => {
    if (props.isExpanded) {
      syncFromProvider();
    }
  });

  // --- Validation ---
  const validateBaseUrl = (): boolean => {
    const validator = effectSchema(BaseUrlSchema);
    const result = validator["~standard"].validate(localBaseUrl()) as { issues?: Array<{ message: string }> };
    if (!result.issues || result.issues.length === 0) {
      setBaseUrlError(undefined);
      return true;
    }
    const msg = firstErrorMessage(result.issues);
    setBaseUrlError(msg ?? "Base URL must start with http:// or https://");
    return false;
  };

  const validateApiKey = (): boolean => {
    const validator = effectSchema(ApiKeySchema);
    const result = validator["~standard"].validate(localApiKey()) as { issues?: Array<{ message: string }> };
    if (!result.issues || result.issues.length === 0) {
      setApiKeyError(undefined);
      return true;
    }
    const msg = firstErrorMessage(result.issues);
    setApiKeyError(msg ?? "API Key is required");
    return false;
  };

  // --- Test connection ---
  const handleTestConnection = async () => {
    if (!validateBaseUrl() || !validateApiKey()) return;
    setIsTesting(true);
    setTestStatus({ kind: "testing" });
    // Use localBaseUrl() and localApiKey() directly — NOT store values
    const modelsEndpoint = `${localBaseUrl()}/v1/models`;
    try {
      const res = await fetch(modelsEndpoint, {
        headers: {
          Authorization: `Bearer ${localApiKey()}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setTestStatus({ kind: "error", message: `HTTP ${res.status}: ${text}` });
        return;
      }
      const json = await res.json();
      parseModelsApiResponse(json); // validate response shape; throws on bad format
      setTestStatus({ kind: "success" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestStatus({ kind: "error", message: msg });
    } finally {
      setIsTesting(false);
    }
  };

  // --- Model table helpers ---
  const addModelRow = () => {
    setLocalModels((prev) => [...prev, emptyModelRow()]);
  };

  const deleteModelRow = (index: number) => {
    setLocalModels((prev) => prev.filter((_, i) => i !== index));
  };

  const updateModelRow = (index: number, field: keyof ModelRow, value: string | boolean) => {
    setLocalModels((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  };

  // --- Save ---
  const handleSave = () => {
    if (!validateBaseUrl()) return;
    // apiKey can be empty

    const models: ModelMeta[] = localModels()
      .filter((r) => r.id.trim() !== "" && r.label.trim() !== "")
      .map((r) => ({
        id: r.id.trim(),
        label: r.label.trim(),
        contextWindow: r.contextWindow ? parseInt(r.contextWindow, 10) : undefined,
        deprecated: r.deprecated,
        thinking: r.thinking,
      }));

    let defaultModel = localDefaultModel();
    // Enforce default model invariant
    if (models.length === 0) {
      defaultModel = "";
    } else if (!models.some((m) => m.id === defaultModel)) {
      defaultModel = models[0].id;
    }

    const updated: Provider = {
      ...props.provider,
      comment: localComment() || undefined,
      apiKey: localApiKey(),
      llm: {
        ...props.provider.llm,
        baseUrl: localBaseUrl(),
        defaultModel,
        models,
      },
    };

    props.onSave(updated);
  };

  // --- Delete ---
  const handleDelete = async () => {
    if (!confirm(`Delete provider "${props.provider.label}"?`)) return;
    setIsDeleting(true);
    try {
      props.onDelete(props.provider.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const testStatusColor = createMemo(() => {
    const s = testStatus();
    if (s.kind === "success") return "text-green-600 dark:text-green-400";
    if (s.kind === "error") return "text-red-600 dark:text-red-400";
    return "";
  });

  const testStatusText = createMemo(() => {
    const s = testStatus();
    if (s.kind === "success") return "连接成功";
    if (s.kind === "error") return `连接失败: ${s.message}`;
    if (s.kind === "testing") return "测试中…";
    return null;
  });

  return (
    <div class="flex flex-col gap-0">
      {/* ===== COLLAPSED ROW ===== */}
      <div
        data-testid="provider-row"
        class="flex flex-row items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors rounded-lg"
        onClick={() => props.onToggleExpand()}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div class="flex flex-col gap-0.5 min-w-0">
          <div class="flex flex-row items-center gap-2">
            <span class="text-sm font-medium truncate">{labelDisplay()}</span>
            <Show when={isDev()}>
              <span
                data-testid="provider-dev-badge"
                class="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 shrink-0"
              >
                (dev)
              </span>
            </Show>
          </div>
        </div>

        <div class="flex flex-row items-center gap-3">
          {/* Model count badge */}
          <span class="text-xs text-muted-foreground shrink-0">
            {modelCount()} models
          </span>

          {/* Default star */}
          <Button
            variant="ghost"
            size="icon-xs"
            class={props.isDefault ? "text-yellow-500" : "text-muted-foreground"}
            onClick={(e) => {
              e.stopPropagation();
              props.onSetDefault();
            }}
            aria-label="Set as default provider"
            title={props.isDefault ? "默认 Provider" : "设为默认"}
          >
            <svg
              viewBox="0 0 24 24"
              fill={props.isDefault ? "currentColor" : "none"}
              stroke="currentColor"
              stroke-width="2"
              class="size-4"
            >
              <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
            </svg>
          </Button>

          {/* Hover delete button */}
          <Show when={isHovered}>
            <Button
              variant="ghost"
              size="icon-xs"
              class="text-muted-foreground hover:text-destructive shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete provider "${props.provider.label}"?`)) {
                  props.onDelete(props.provider.id);
                }
              }}
              aria-label="Delete provider"
              title="删除"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4">
                <polyline points="3,6 5,6 21,6" />
                <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6" />
              </svg>
            </Button>
          </Show>
        </div>
      </div>

      {/* ===== EXPANDED EDITOR ===== */}
      <Show when={props.isExpanded}>
        <div class="flex flex-col gap-4 p-4 border border-t-0 rounded-b-lg bg-card">
          {/* --- Basic config section --- */}
          <div class="flex flex-col gap-3">
            <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              基础配置
            </p>

            {/* Comment */}
            <CodemanInput
              label="备注"
              value={localComment()}
              onValueChange={setLocalComment}
              placeholder="可选备注"
            />

            {/* Base URL */}
            <CodemanInput
              label="Base URL"
              value={localBaseUrl()}
              onValueChange={(v) => {
                setLocalBaseUrl(v);
                setBaseUrlError(undefined);
              }}
              onBlur={validateBaseUrl}
              error={baseUrlError()}
              placeholder="https://api.example.com/v1"
            />

            {/* API Key */}
            <CodemanInput
              label="LLM API Key"
              type="password"
              value={localApiKey()}
              onValueChange={(v) => {
                setLocalApiKey(v);
                setApiKeyError(undefined);
              }}
              onBlur={validateApiKey}
              error={apiKeyError()}
              placeholder="sk-…"
            />

            {/* Test connection */}
            <div class="flex flex-row items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={isTesting()}
              >
                {isTesting() ? "测试中…" : "测试连接"}
              </Button>
              <Show when={testStatusText()}>
                <span class={`text-xs ${testStatusColor()}`}>
                  {testStatusText()}
                </span>
              </Show>
            </div>
          </div>

          {/* --- Model section --- */}
          <div class="flex flex-col gap-3">
            <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              模型
            </p>

            {/* Default model dropdown */}
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium">Default Model</label>
              <select
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={localDefaultModel()}
                onChange={(e) => setLocalDefaultModel(e.currentTarget.value)}
              >
                <For each={localModels()}>
                  {(m) => (
                    <option value={m.id}>
                      {m.label}
                      {m.deprecated ? " (deprecated)" : ""}
                    </option>
                  )}
                </For>
              </select>
            </div>

            {/* Model table */}
            <div class="flex flex-col gap-2 border border-border rounded-md p-3">
              {/* Table header */}
              <div class="grid grid-cols-[1fr_1fr_100px_80px_80px_40px] gap-2 text-xs font-medium text-muted-foreground px-1">
                <span>ID</span>
                <span>Label</span>
                <span>Context Window</span>
                <span>Deprecated</span>
                <span>Thinking</span>
                <span />
              </div>

              {/* Model rows */}
              <For each={localModels()}>
                {(row, index) => (
                  <div
                    data-testid={`model-row-${index()}`}
                    class="grid grid-cols-[1fr_1fr_100px_80px_80px_40px] gap-2 items-center"
                  >
                    <input
                      type="text"
                      class="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring"
                      value={row.id}
                      onInput={(e) => updateModelRow(index(), "id", e.currentTarget.value)}
                      placeholder="model-id"
                    />
                    <input
                      type="text"
                      class="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring"
                      value={row.label}
                      onInput={(e) => updateModelRow(index(), "label", e.currentTarget.value)}
                      placeholder="Display Name"
                    />
                    <input
                      type="number"
                      class="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring"
                      value={row.contextWindow}
                      onInput={(e) => updateModelRow(index(), "contextWindow", e.currentTarget.value)}
                      placeholder="100000"
                    />
                    <div class="flex items-center justify-center">
                      <input
                        type="checkbox"
                        class="size-4 rounded border-input"
                        checked={row.deprecated}
                        onChange={(e) => updateModelRow(index(), "deprecated", e.currentTarget.checked)}
                      />
                    </div>
                    <div class="flex items-center justify-center">
                      <input
                        type="checkbox"
                        class="size-4 rounded border-input"
                        checked={row.thinking}
                        onChange={(e) => updateModelRow(index(), "thinking", e.currentTarget.checked)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      class="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => deleteModelRow(index())}
                      aria-label="删除行"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3.5">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </Button>
                  </div>
                )}
              </For>

              {/* Add model row */}
              <Button
                variant="outline"
                size="sm"
                onClick={addModelRow}
                class="self-start mt-1"
              >
                添加模型
              </Button>
            </div>
          </div>

          {/* --- Danger zone --- */}
          <div class="flex flex-col gap-3">
            <p class="text-xs font-medium uppercase tracking-wider text-destructive">
              危险区
            </p>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting()}
            >
              {isDeleting() ? "删除中…" : "删除 provider"}
            </Button>
          </div>

          {/* --- Bottom Save / Cancel --- */}
          <div class="flex flex-row justify-end gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                syncFromProvider();
                props.onCancel();
              }}
            >
              取消
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSave}
            >
              保存
            </Button>
          </div>
        </div>
      </Show>
    </div>
  );
}
