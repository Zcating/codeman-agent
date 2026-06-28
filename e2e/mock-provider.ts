//! Mock LLM provider for e2e tests.
//!
//! Replaces the real MiniMax/DeepSeek provider with a deterministic canned-response
//! provider. Tests enqueue responses into a queue, and the transport pops one per
//! LLM turn, simulating SSE streaming (text chunks + tool_use blocks).
//!
//! Usage:
//!   await useMockProvider(page);
//!   await enqueueMockResponse(page, { text: "Hello!" });
//!   await enqueueMockResponse(page, { toolCalls: [{ name: "read_file", input: {...} }] });
//!   await enqueueMockResponse(page, { text: "Done." });
//!
//! The mock provider has baseUrl "mock://test" which the AnthropicTransport
//! recognizes and dispatches to the mockStreamTurn method (see
//! src/features/chat/lib/anthropic-transport.ts).

import { TauriPage } from "./cdp-driver";
import { invoke } from "./helpers";

/** A single mock LLM turn response. */
export interface MockTurn {
  /** Text content for the assistant. Streamed as text_delta events in 4-char chunks. */
  text?: string;
  /** Tool calls to emit. Each becomes a tool_use block in the assistant message. */
  toolCalls?: Array<{
    name: string;
    /** Tool input. Field names use snake_case to match the Anthropic API contract. */
    input: Record<string, unknown>;
  }>;
  /** Per-chunk delay in ms (default 5). Simulates streaming latency. */
  delayMs?: number;
}

const MOCK_PROVIDER_ID = "mock";
const MOCK_BASE_URL = "mock://test";
const MOCK_MODEL = "mock-model";

/** Enqueue a mock response. Called by tests before sending messages to the LLM. */
export async function enqueueMockResponse(page: TauriPage, turn: MockTurn): Promise<void> {
  await page.evaluate((t: unknown) => {
    const w = window as unknown as {
      __MOCK_LLM_QUEUE__?: MockTurn[];
    };
    if (!w.__MOCK_LLM_QUEUE__) {
      w.__MOCK_LLM_QUEUE__ = [];
    }
    w.__MOCK_LLM_QUEUE__.push(t as MockTurn);
  }, turn);
}

/** Clear all queued mock responses. */
export async function clearMockQueue(page: TauriPage): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __MOCK_LLM_QUEUE__?: MockTurn[] };
    w.__MOCK_LLM_QUEUE__ = [];
  });
}

/**
 * Switch settings to use the mock provider. Sets the mock provider as the
 * default LLM with baseUrl "mock://test" and a default model.
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
  // Add mock provider to the list (or update if already exists), then make it default.
  const existing = (current.providers ?? []).filter((p: any) => p.id !== MOCK_PROVIDER_ID);
  const newSettings: any = {
    ...current,
    providers: [...existing, mockProvider],
    default_llm_provider_id: MOCK_PROVIDER_ID,
  };

  await invoke(page, "update_settings", { newSettings });
  await clearMockQueue(page);
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
