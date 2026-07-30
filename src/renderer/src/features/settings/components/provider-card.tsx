

























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
  
  onUpdate: (provider: Provider) => void;
  
  onDelete: (providerId: string) => void;
}

export function ProviderCard(props: ProviderCardProps) {
  
  const [isRefreshing, setIsRefreshing] = createSignal(false);
  const [refreshMsg, setRefreshMsg] = createSignal<string | null>(null);
  const [isDeleting, setIsDeleting] = createSignal(false);

  
  
  
  
  const form = createForm(() => ({
    defaultValues: {
      baseUrl: props.provider.llm.baseUrl,
      apiKey: props.provider.apiKey,
      model: props.provider.llm.defaultModel,
      enabled: props.provider.enabled,
    },
    
    
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
      
      
      
      
      
      
      void settingsSaver.flushNow().catch(() => {});
      props.onUpdate(updated);
    },
  }));

  
  

  const handleRefreshModels = async (): Promise<void> => {
    setIsRefreshing(true);
    setRefreshMsg(null);
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

  

  return (
    <Card class="p-0 overflow-hidden">
      {}
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
                  
                  void form.handleSubmit();
                }}
              />
            )}
          </form.Field>
        </div>
      </CardHeader>
      <CardContent class="space-y-4 p-4 pt-0">
        {}
        <div class="space-y-3 rounded-md border border-border p-3">
          <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            LLM
          </p>

          {}
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

          {}
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

          {}
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

          {}
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

      {}
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