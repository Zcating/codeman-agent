//! Mock (dev) template — used by createProviderFormDialog() when user picks "Mock (dev)" radio.

import type { Provider } from "../../../shared/lib/types";

export const MOCK_DEV_TEMPLATE_CONSTANTS = {
  baseUrl: "http://127.0.0.1:50000/mock/anthropic",
  defaultModel: "mock-default",
  apiType: "anthropic-messages" as const,
  label: "Mock",
  modelsEndpoint: "",
} as const;

/**
 * Build a Provider record pre-filled for local-dev mock LLM usage.
 * All fields fully editable by the user after prefill (no locking).
 *
 * @param id - unique provider id (caller must ensure uniqueness; format suggestion: "mock-<timestamp>")
 */
export function buildMockDevTemplate(id: string): Provider {
  return {
    id,
    label: MOCK_DEV_TEMPLATE_CONSTANTS.label,
    enabled: true,
    api_key: "",
    llm: {
      default_model: MOCK_DEV_TEMPLATE_CONSTANTS.defaultModel,
      base_url: MOCK_DEV_TEMPLATE_CONSTANTS.baseUrl,
      api_type: MOCK_DEV_TEMPLATE_CONSTANTS.apiType,
      models: [{ id: MOCK_DEV_TEMPLATE_CONSTANTS.defaultModel, label: MOCK_DEV_TEMPLATE_CONSTANTS.label, deprecated: false, thinking: false }],
      models_endpoint: MOCK_DEV_TEMPLATE_CONSTANTS.modelsEndpoint,
    },
  };
}
