
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
import { Checkbox } from "@codeman-frontend/shared/components/ui/checkbox";
import { Dialog } from "@codeman-frontend/shared/components/internal/codeman-dialog";
import type { Provider } from "@codeman-frontend/shared/lib/types";
import { buildMockDevTemplate } from "@codeman-frontend/features/settings/lib/mock-provider-template";

type ProviderType = "real" | "mock";

export function createProviderFormDialog(): Promise<Provider | null> {
  return Dialog.show<Provider>((resolve) => {
    const [type, setType] = createSignal<ProviderType>("real");
    const [label, setLabel] = createSignal("");
    const [baseUrl, setBaseUrl] = createSignal("");
    const [defaultModel, setDefaultModel] = createSignal("");
    const [apiKey, setApiKey] = createSignal("");
    const [enabled, setEnabled] = createSignal(true);

    const handleTypeChange = (newType: ProviderType) => {
      setType(newType);
      if (newType === "mock") {
        const id = `mock-${Date.now().toString(36)}`;
        const tpl = buildMockDevTemplate(id);
        setLabel(tpl.label);
        setBaseUrl(tpl.llm.baseUrl);
        setDefaultModel(tpl.llm.defaultModel);
        setApiKey(tpl.apiKey);
        setEnabled(true);
      } else {
        setLabel("");
        setBaseUrl("");
        setDefaultModel("");
        setApiKey("");
      }
    };

    const handleAdd = () => {
      const id = type() === "mock"
        ? `mock-${Date.now().toString(36)}`
        : `provider-${Date.now().toString(36)}`;
      resolve({
        id,
        label: label(),
        enabled: enabled(),
        apiKey: apiKey(),
        llm: {
          defaultModel: defaultModel(),
          baseUrl: baseUrl(),
          apiType: "anthropic-messages",
          models: defaultModel() ? [{ id: defaultModel(), label: defaultModel(), deprecated: false, thinking: false }] : [],
          modelsEndpoint: "",
        },
      });
    };

    const handleCancel = () => {
      resolve(null as unknown as Provider);
    };

    return (
      <DialogContent data-testid="add-provider-dialog">
        <DialogHeader>
          <DialogTitle>Add provider</DialogTitle>
          <DialogDescription>Choose a provider type</DialogDescription>
        </DialogHeader>

        {}
        <div class="flex flex-col gap-2">
          <label class="flex items-center gap-2 text-sm">
            <input type="radio" name="provider-type" value="real" checked={type() === "real"} onChange={() => handleTypeChange("real")} data-testid="provider-type-real" />
            Real API
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input type="radio" name="provider-type" value="mock" checked={type() === "mock"} onChange={() => handleTypeChange("mock")} data-testid="provider-type-mock" />
            Mock (dev)
          </label>
        </div>

        {}
        <div class="flex flex-col gap-3 mt-4">
          <div><label class="text-xs text-muted-foreground">Label</label>
            <CodemanInput
              data-testid="provider-field-label"
              value={label()}
              onValueChange={setLabel}
            />
          </div>
          <div><label class="text-xs text-muted-foreground">Base URL</label>
            <CodemanInput
              data-testid="provider-field-base-url"
              value={baseUrl()}
              onValueChange={setBaseUrl}
            />
          </div>
          <div><label class="text-xs text-muted-foreground">Default model</label>
            <CodemanInput
              data-testid="provider-field-default-model"
              value={defaultModel()}
              onValueChange={setDefaultModel}
            />
          </div>
          <div><label class="text-xs text-muted-foreground">API key</label>
            <CodemanInput
              type="password"
              data-testid="provider-field-api-key"
              value={apiKey()}
              onValueChange={setApiKey}
            />
          </div>
          <label class="flex items-center gap-2 text-sm">
            <Checkbox checked={enabled()} onChange={(e) => setEnabled(e.currentTarget.checked)} />
            Enabled
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} data-testid="provider-cancel-button">Cancel</Button>
          <Button onClick={handleAdd} data-testid="provider-add-button">Add</Button>
        </DialogFooter>
      </DialogContent>
    );
  });
}
