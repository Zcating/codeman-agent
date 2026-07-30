import type { Provider } from "@codeman-frontend/shared/lib/types";

export const MOCK_DEV_TEMPLATE_CONSTANTS = {
  baseUrl: "http://127.0.0.1:50000/mock/anthropic",
  defaultModel: "mock-default",
  apiType: "anthropic-messages" as const,
  label: "Mock",
  modelsEndpoint: "",
} as const;


export function buildMockDevTemplate(id: string): Provider {
  return {
    id,
    label: MOCK_DEV_TEMPLATE_CONSTANTS.label,
    enabled: true,
    apiKey: "",
    llm: {
      defaultModel: MOCK_DEV_TEMPLATE_CONSTANTS.defaultModel,
      baseUrl: MOCK_DEV_TEMPLATE_CONSTANTS.baseUrl,
      apiType: MOCK_DEV_TEMPLATE_CONSTANTS.apiType,
      models: [{ id: MOCK_DEV_TEMPLATE_CONSTANTS.defaultModel, label: MOCK_DEV_TEMPLATE_CONSTANTS.label, deprecated: false, thinking: false }],
      modelsEndpoint: MOCK_DEV_TEMPLATE_CONSTANTS.modelsEndpoint,
    },
  };
}
