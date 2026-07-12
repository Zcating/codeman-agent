//! Mock LLM provider helper for e2e tests.
//!
//! Registers a Provider record whose `baseUrl` points at the Electron Main
//! started local mock server (`http://127.0.0.1:50000/mock/anthropic`, per
//! CONTEXT.md 「Fake LLM Provider」). The mock server (`electron/main/mock-server.ts`)
//! reads Q→A entries from the shared dev seed `electron/assets/qa.dev.json`
//! (per ADR-0026) — a single source of truth shared between dev mode and
//! e2e tests. Tests send user messages whose substring matches a `question:`
//! field in that file (e2e spec keys like "04::hello-intro" / "08::sandbox"
//! are positioned before generic dev keys like "hello" so substring
//! first-wins match picks the more specific e2e entry first).
//!
//! Usage:
//!   await useMockProvider(page);
//!   // user sends a message whose substring is in qa.dev.json#question entry
//!
<<<<<<< Updated upstream
//! Per-Worker Q→A Isolation (per CONTEXT.md): 各 spec 在同一 worker 内共用
//! `qa-w{N}.json`,需保证每个 spec 的 question 字符串在 worker 内 unique,
//! first-wins 命中。e2e/fixtures/qa-w{0..3}.json 由各 spec 协调 question 字串。
//!
//! Field-name policy: e2e fixture writes camelCase to match V3.1+ Settings JSON
//! wire format (per ADR-0024 D10). See `electron/main/settings-schema.ts:5`.
=======
//! Per ADR-0026: 4 Playwright workers each load the same `qa.dev.json` in
//! their own mock-server process (port `50000 + parallelIndex` to avoid
//! EADDRINUSE). Workers do NOT need per-worker isolation of the Q→A table —
//! spec keys are uniquely prefixed (`XX::`) so cross-worker substring
//! overlap is impossible by construction.
>>>>>>> Stashed changes

import { TauriPage } from "./cdp-driver";
import { invoke } from "./helpers";

const MOCK_PROVIDER_ID = "mock";
/**
 * Per-worker mock-server URL. `window.__mockBaseUrl` is injected by the
 * per-worker fixture (e2e/fixtures.ts) via `Page.addScriptToEvaluateOnNewDocument`
 * so each worker fetches its own mock-server port (50000 + parallelIndex).
 * Falls back to the legacy hardcoded URL when the global is absent.
 */
const MOCK_BASE_URL_FALLBACK = "http://127.0.0.1:50000/mock/anthropic";
const MOCK_MODEL = "mock-model";

/**
 * Switch settings to use the mock provider. Sets the mock provider as the
 * default LLM with baseUrl pointing at the local mock server.
 *
 * The mock provider accepts any non-empty apiKey (Authorization header is sent
 * but the local server ignores it; this is real fetch, no JS shim).
 *
 * Per-worker mock port: the renderer uses `window.__mockBaseUrl` (injected by
 * the per-worker fixture) so it can fetch the worker-specific mock server.
 */
export async function useMockProvider(page: TauriPage): Promise<void> {
  const current = await invoke<any>(page, "get_settings");
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
<<<<<<< Updated upstream
      defaultModel: MOCK_MODEL,
      baseUrl: MOCK_BASE_URL,
      apiType: "anthropic-messages",
=======
      default_model: MOCK_MODEL,
      base_url: mockBaseUrl,
      api_type: "anthropic-messages",
      llm_api_key_ref: "",
>>>>>>> Stashed changes
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
  // Add mock provider to the list (or replace if already exists), then make it default.
  const existing = (current.providers ?? []).filter((p: any) => p.id !== MOCK_PROVIDER_ID);
  const newSettings: any = {
    ...current,
    providers: [...existing, mockProvider],
    defaultLlmProviderId: MOCK_PROVIDER_ID,
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
