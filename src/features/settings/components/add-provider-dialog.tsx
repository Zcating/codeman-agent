//! createProviderFormDialog() — Settings UI imperative dialog for adding a new Provider.
//!
//! Implementation: thin wrapper around `Dialog.show<Provider>` from
//! `shared/components/internal/codeman-dialog.tsx`.
//! Dismiss path (Cancel / ESC / overlay click) resolves `null`.
//! Form state lives inside renderFn closure; each call opens fresh.
//! Mock (dev) radio pre-fills via buildMockDevTemplate(); Real API clears fields.
//! All IPC + persistence stays outside the dialog — caller owns provider storage.

import { createSignal } from "solid-js";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../../shared/components/ui/dialog";
import { Button } from "../../../shared/components/ui/button";
import { Input } from "../../../shared/components/ui/input";
import { Checkbox } from "../../../shared/components/ui/checkbox";
import { Dialog } from "../../../shared/components/internal/codeman-dialog";
import type { Provider } from "../../../shared/lib/types";
import { buildMockDevTemplate } from "../lib/mock-provider-template";

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
        setBaseUrl(tpl.llm.base_url);
        setDefaultModel(tpl.llm.default_model);
        setApiKey(tpl.api_key);
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
        api_key: apiKey(),
        llm: {
          default_model: defaultModel(),
          base_url: baseUrl(),
          api_type: "anthropic-messages",
          models: defaultModel() ? [{ id: defaultModel(), label: defaultModel(), deprecated: false, thinking: false }] : [],
          models_endpoint: "",
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

        {/* Radio */}
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

        {/* Fields */}
        <div class="flex flex-col gap-3 mt-4">
          <div><label class="text-xs text-muted-foreground">Label</label>
            <Input data-testid="provider-field-label" value={label()} onInput={(e) => setLabel(e.currentTarget.value)} />
          </div>
          <div><label class="text-xs text-muted-foreground">Base URL</label>
            <Input data-testid="provider-field-base-url" value={baseUrl()} onInput={(e) => setBaseUrl(e.currentTarget.value)} />
          </div>
          <div><label class="text-xs text-muted-foreground">Default model</label>
            <Input data-testid="provider-field-default-model" value={defaultModel()} onInput={(e) => setDefaultModel(e.currentTarget.value)} />
          </div>
          <div><label class="text-xs text-muted-foreground">API key</label>
            <Input type="password" data-testid="provider-field-api-key" value={apiKey()} onInput={(e) => setApiKey(e.currentTarget.value)} />
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
