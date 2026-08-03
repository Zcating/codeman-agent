
import { createSignal } from "solid-js";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@codeman-frontend/shared/components/ui/dialog";
import { Button } from "@codeman-frontend/shared/components/ui/button";
import { CodemanInput } from "@codeman-frontend/shared/components/internal/codeman-input";
import { Dialog } from "@codeman-frontend/shared/components/internal/codeman-dialog";
import type { Provider } from "@codeman-frontend/shared/lib/types";
import { buildMockDevTemplate } from "@codeman-frontend/features/settings/lib/mock-provider-template";
import { enforceDefaultModelInvariant } from "@codeman-frontend/shared/lib/provider-invariant";
import { codemanToast } from "@codeman-frontend/shared/components/internal/codeman-toast";
import { PROVIDER_PRESETS } from "@codeman-frontend/features/settings/lib/provider-presets";

type DialogPhase = "select" | "form";
type ProviderSource = "preset" | "custom" | "mock";

export function createProviderFormDialog(): Promise<Provider | null> {
  return Dialog.show<Provider>((resolve) => {
    const [phase, setPhase] = createSignal<DialogPhase>("select");
    const [source, setSource] = createSignal<ProviderSource>("custom");
    // Form fields
    const [label, setLabel] = createSignal("");
    const [comment, setComment] = createSignal("");
    const [baseUrl, setBaseUrl] = createSignal("");
    const [defaultModel, setDefaultModel] = createSignal("");
    const [modelsEndpoint, setModelsEndpoint] = createSignal("");
    const [apiKey, setApiKey] = createSignal("");
    // Stored models from preset (read-only display)
    const [presetModels, setPresetModels] = createSignal<Provider["llm"]["models"]>([]);

    const enterFormWithPreset = (presetId: string) => {
      const preset = PROVIDER_PRESETS.find((p) => p.id === presetId);
      if (!preset) {return;}
      setSource("preset");
      setLabel(preset.label);
      setBaseUrl(preset.baseUrl);
      setDefaultModel(preset.defaultModel);
      setPresetModels(preset.models);
      setModelsEndpoint(preset.modelsEndpoint ?? "");
      setComment("");
      setApiKey("");
      setPhase("form");
    };

    const enterFormEmpty = () => {
      setSource("custom");
      setLabel("");
      setComment("");
      setBaseUrl("");
      setDefaultModel("");
      setModelsEndpoint("");
      setApiKey("");
      setPresetModels([]);
      setPhase("form");
    };

    const enterFormMock = () => {
      setSource("mock");
      const id = `mock-${Date.now().toString(36)}`;
      const tpl = buildMockDevTemplate(id);
      setLabel(tpl.label);
      setComment("");
      setBaseUrl(tpl.llm.baseUrl);
      setDefaultModel(tpl.llm.defaultModel);
      setPresetModels(tpl.llm.models);
      setModelsEndpoint(tpl.llm.modelsEndpoint);
      setApiKey(tpl.apiKey);
      setPhase("form");
    };

    const handleAdd = () => {
      const prefix = source() === "mock" ? "mock" : "provider";
      const id = `${prefix}-${Date.now().toString(36)}`;
      const llm = {
        defaultModel: defaultModel(),
        baseUrl: baseUrl(),
        apiType: "anthropic-messages" as const,
        models: presetModels().length > 0
          ? presetModels()
          : defaultModel()
            ? [{ id: defaultModel(), label: defaultModel(), deprecated: false, thinking: false }]
            : [],
        modelsEndpoint: modelsEndpoint(),
      };
      const enforced = enforceDefaultModelInvariant(llm);
      if (enforced.defaultModel !== llm.defaultModel) {
        codemanToast.error(`Default model fell back to ${enforced.defaultModel}`);
      }
      resolve({
        id,
        label: label(),
        comment: comment() || undefined,
        apiKey: apiKey(),
        llm: enforced,
      });
    };

    const handleCancel = () => {
      resolve(null as unknown as Provider);
    };

    return (
      <DialogContent data-testid="add-provider-dialog">
        <DialogHeader>
          <DialogTitle>Add provider</DialogTitle>
          <DialogDescription>
            {phase() === "select"
              ? "Select a provider or create a custom one"
              : "Fill in the provider details"}
          </DialogDescription>
        </DialogHeader>

        {phase() === "select" ? (
          <>
            {/* Phase 1: Tag cloud */}
            <div
              data-testid="provider-tag-cloud"
              class="flex flex-wrap gap-2 max-h-60 overflow-y-auto p-1"
            >
              {PROVIDER_PRESETS.map((preset) => (
                <button
                  type="button"
                  data-testid={`provider-tag-${preset.id}`}
                  class="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                  onClick={() => enterFormWithPreset(preset.id)}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom and Mock entries */}
            <div class="flex gap-2 mt-2">
              <button
                type="button"
                data-testid="provider-custom-entry"
                class="inline-flex items-center rounded-full border border-dashed border-muted-foreground/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground cursor-pointer"
                onClick={enterFormEmpty}
              >
                + Custom provider
              </button>
              <button
                type="button"
                data-testid="provider-mock-entry"
                class="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/80 cursor-pointer"
                onClick={enterFormMock}
              >
                Mock (dev)
              </button>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleCancel}
                data-testid="provider-cancel-button"
              >
                Cancel
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {/* Phase 2: Form */}
            <div data-testid="provider-form" class="flex flex-col gap-3">
              <div>
                <label class="text-xs text-muted-foreground">Label</label>
                <CodemanInput
                  data-testid="provider-field-label"
                  value={label()}
                  onValueChange={setLabel}
                />
              </div>
              <div>
                <label class="text-xs text-muted-foreground">Comment (optional)</label>
                <CodemanInput
                  data-testid="provider-field-comment"
                  value={comment()}
                  onValueChange={setComment}
                />
              </div>
              <div>
                <label class="text-xs text-muted-foreground">Base URL</label>
                <CodemanInput
                  data-testid="provider-field-base-url"
                  value={baseUrl()}
                  onValueChange={setBaseUrl}
                />
              </div>
              <div>
                <label class="text-xs text-muted-foreground">Default model</label>
                <CodemanInput
                  data-testid="provider-field-default-model"
                  value={defaultModel()}
                  onValueChange={setDefaultModel}
                />
              </div>
              {presetModels().length > 0 && (
                <div>
                  <label class="text-xs text-muted-foreground">Available models</label>
                  <div class="flex flex-wrap gap-1 mt-1">
                    {presetModels().map((m) => (
                      <span
                        key={m.id}
                        class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {m.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label class="text-xs text-muted-foreground">API key</label>
                <CodemanInput
                  type="password"
                  data-testid="provider-field-api-key"
                  value={apiKey()}
                  onValueChange={setApiKey}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setPhase("select")}
                data-testid="provider-back-button"
              >
                ← Back
              </Button>
              <Button
                variant="outline"
                onClick={handleCancel}
                data-testid="provider-cancel-button"
              >
                Cancel
              </Button>
              <Button onClick={handleAdd} data-testid="provider-add-button">
                Add
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    );
  });
}
