import type { Settings } from "./settings-schema";


const MINIMAX_BASE_URL = "https://api.minimaxi.com/anthropic";
const MINIMAX_MODELS_ENDPOINT = "https://api.minimaxi.com/v1/models";
const MINIMAX_DEFAULT_MODEL = "MiniMax-M2.5-highspeed";


export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: "1.5",
  providers: [
    {
      id: "minimax",
      label: "MiniMax",
      apiKey: "",
      llm: {
        defaultModel: MINIMAX_DEFAULT_MODEL,
        baseUrl: MINIMAX_BASE_URL,
        apiType: "anthropic-messages",
        contextWindow: 200_000,
        models: [
          {
            id: MINIMAX_DEFAULT_MODEL,
            label: MINIMAX_DEFAULT_MODEL,
            contextWindow: 200_000,
            deprecated: false,
            thinking: false,
          },
        ],
        modelsEndpoint: MINIMAX_MODELS_ENDPOINT,
      },
      billing: { kind: "plan_quota" },
    },
  ],
  defaultLlmProviderId: "minimax",
  userLanguage: "auto",
  theme: "system",
  startAtLogin: false,
  window: {
    rememberPosition: true,
    rememberSize: true,
    defaultSize: { width: 800, height: 600 },
    minSize: { width: 600, height: 400 },
  },
  systemPrompt: { default: "", userCanEdit: true },
  conversations: { autoArchiveAfterDays: 30, maxHistory: 1000 },
  enabledSkills: ["commit-helper", "code-review", "explain-error", "summarize"],
};