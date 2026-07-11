//! Mock LLM provider helper for e2e tests.
//!
//! Registers a Provider record whose `base_url` points at the Electron Main
//! started local mock server (`http://127.0.0.1:50000/mock/anthropic`, per
//! CONTEXT.md 「Fake LLM Provider」). The mock server (`electron/main/mock-server.ts`)
//! reads Q→A entries from the worker's `qa-w{N}.json` file (env var
//! `CODEMAN_TEST_QA_TABLE`, set per-worker in `e2e/fixtures.ts`) and serves
//! Anthropic-format SSE responses. Tests send user messages whose substring
//! matches a `question:` field in the Q→A table.
//!
//! Usage:
//!   await useMockProvider(page);
//!   // user sends a message whose substring is in qa-w{N}.json#question entry
//!
//! Per-Worker Q→A Isolation (per CONTEXT.md): 各 spec 在同一 worker 内共用
//! `qa-w{N}.json`,需保证每个 spec 的 question 字符串在 worker 内 unique,
//! first-wins 命中。e2e/fixtures/qa-w{0..3}.json 由各 spec 协调 question 字串。

import { TauriPage } from "./cdp-driver";
import { invoke } from "./helpers";

const MOCK_PROVIDER_ID = "mock";
const MOCK_BASE_URL = "http://127.0.0.1:50000/mock/anthropic";
const MOCK_MODEL = "mock-model";

/**
 * Switch settings to use the mock provider. Sets the mock provider as the
 * default LLM with baseUrl pointing at the local mock server.
 *
 * The mock provider accepts any non-empty api_key (Authorization header is sent
 * but the local server ignores it; this is real fetch, no JS shim).
 */
export async function useMockProvider(page: TauriPage): Promise<void> {
  const current = await invoke<any>(page, "get_settings");
  const mockProvider = {
    id: MOCK_PROVIDER_ID,
    label: "Mock LLM (E2E test)",
    enabled: true,
    api_key: "mock-key-not-used",
    llm: {
      default_model: MOCK_MODEL,
      base_url: MOCK_BASE_URL,
      api_type: "anthropic-messages",
      llm_api_key_ref: "",
      models: [
        {
          id: MOCK_MODEL,
          label: MOCK_MODEL,
          context_window: 200_000,
          deprecated: false,
          thinking: false,
        },
      ],
      models_endpoint: "",
    },
  };
  // Add mock provider to the list (or replace if already exists), then make it default.
  const existing = (current.providers ?? []).filter((p: any) => p.id !== MOCK_PROVIDER_ID);
  const newSettings: any = {
    ...current,
    providers: [...existing, mockProvider],
    default_llm_provider_id: MOCK_PROVIDER_ID,
  };

  await invoke(page, "update_settings", { newSettings });
  // 关键: update_settings 是 raw IPC,只更新后端。chat-view 的 handleSend 读
  // appStore.state.value(内存 Solid signal),这 signal 不会因为 IPC 而变。
  // 必须显式调 appStore.refreshAsync() 把后端新值拉回前端,否则 send 时还用旧 provider。
  // appStore 通过 window.__appStore 暴露(只在 webview dev 模式有效)。
  await page.evaluate(async () => {
    const w = window as unknown as {
      __appStore?: { refreshAsync: () => Promise<unknown> };
    };
    if (w.__appStore) {
      await w.__appStore.refreshAsync();
    }
  });
}
