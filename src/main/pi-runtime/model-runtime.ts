import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { getAuthJsonPath, getModelsJsonPath } from "./pi-config.js";

export interface PiProvider {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  models: PiModel[];
}

export interface PiModel {
  id: string;
  label: string;
  contextWindow?: number;
  thinking: boolean;
}

export class ModelRuntimeWrapper {
  private runtime: ModelRuntime;

  constructor(runtime: ModelRuntime) {
    this.runtime = runtime;
  }

  async listProviders(): Promise<PiProvider[]> {
    const providers = this.runtime.getProviders();
    return providers.map((p) => ({
      id: p.id,
      label: p.name,
      baseUrl: p.baseUrl ?? "",
      defaultModel: "",
      models: p.getModels().map((m) => ({
        id: m.id,
        label: m.name,
        contextWindow: m.contextWindow,
        thinking: false,
      })),
    }));
  }

  async setApiKey(providerId: string, apiKey: string): Promise<void> {
    return this.runtime.setRuntimeApiKey(providerId, apiKey);
  }

  getConfigPaths(): { authJson: string; modelsJson: string } {
    return {
      authJson: getAuthJsonPath(),
      modelsJson: getModelsJsonPath(),
    };
  }
}
