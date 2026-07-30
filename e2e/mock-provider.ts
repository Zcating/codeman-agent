
import { TauriPage } from "./cdp-driver";
import { invoke } from "./helpers";

const MOCK_PROVIDER_ID = "mock";
const MOCK_BASE_URL_FALLBACK = "http://127.0.0.1:50000/mock/anthropic";
const MOCK_MODEL = "mock-model";

export async function useMockProvider(page: TauriPage): Promise<void> {
  const current = await invoke<any>(page, "getSettings");
  const mockBaseUrl: string = await page.evaluate(() => {
    const w = window as unknown as { __mockBaseUrl?: string };
    return w.__mockBaseUrl ?? MOCK_BASE_URL_FALLBACK;
  }).catch(() => MOCK_BASE_URL_FALLBACK);
  const mockProvider = {
    id: MOCK_PROVIDER_ID,
    label: "Mock LLM (E2E test)",
    enabled: true,
    apiKey: "mock-key-not-used",
    llm: {
      defaultModel: MOCK_MODEL,
      baseUrl: mockBaseUrl,
      apiType: "anthropic-messages",
      models: [
        {
          id: MOCK_MODEL,
          label: MOCK_MODEL,
          contextWindow: 200_000,
          deprecated: false,
          thinking: false,
        },
      ],
      modelsEndpoint: "",
    },
  };
  const existing = (current.providers ?? []).filter((p: any) => p.id !== MOCK_PROVIDER_ID);
  const newSettings: any = {
    ...current,
    providers: [...existing, mockProvider],
    defaultLlmProviderId: MOCK_PROVIDER_ID,
  };

  await invoke(page, "updateSettings", { newSettings });
  await page.evaluate(async () => {
    const w = window as unknown as {
      __appStore?: { refreshAsync: () => Promise<unknown> };
    };
    if (w.__appStore) {
      await w.__appStore.refreshAsync();
    }
  });
}