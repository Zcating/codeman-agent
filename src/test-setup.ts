import "@testing-library/jest-dom";
import { vi } from "vitest";
import { mockState } from "./__mocks__/@tauri-apps/api/core";

if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}

// IPC command handlers (same logic as __mocks__/@tauri-apps/api/core.ts)
type IPCCommand = string;
type IPCArgs = Record<string, unknown> | undefined;

const commandHandlers: Record<IPCCommand, (args?: IPCArgs) => unknown> = {
  get_settings(): unknown {
    if (mockState.v0FixtureActive) {
      const v0Settings = mockState.resolved as any;
      if (v0Settings && !v0Settings.schema_version) {
        // V0.5 detection: both arrays empty → fresh install, pre-fill MiniMax
        const llmProviders = v0Settings.llm_providers ?? [];
        const billingProviders = v0Settings.billing_providers ?? [];
        if (llmProviders.length === 0 && billingProviders.length === 0) {
          mockState.settings = {
            providers: [
              {
                id: "minimax",
                label: "MiniMax",
                enabled: true,
                api_key: "",
                llm: {
                  default_model: "MiniMax-M2.5-highspeed",
                  base_url: "https://api.minimaxi.com/anthropic",
                  api_type: "anthropic-messages",
                  models: [
                    {
                      id: "MiniMax-M2.5-highspeed",
                      label: "MiniMax-M2.5-highspeed",
                      context_window: 200_000,
                      deprecated: false,
                      thinking: false,
                    },
                  ],
                  models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
                },
                billing: {
                  kind: "plan_quota",
                },
              },
            ],
            schema_version: "1.5",
            default_llm_provider_id: "minimax",
            user_language: v0Settings.user_language,
            theme: v0Settings.theme,
            start_at_login: v0Settings.start_at_login,
            window: v0Settings.window,
            system_prompt: v0Settings.system_prompt,
            conversations: v0Settings.conversations,
            llm_providers: [],
            billing_providers: [],
          };
          return { ...mockState.settings };
        }

        // V0 → V1.5 migration
        const providers: any[] = [];
        for (const llm of llmProviders) {
          const billing = billingProviders.find((b: any) => b.id === llm.id);
          // Per ADR-0012: minimax uses plan_quota, deepseek uses balance
          const billingKind = llm.id === "deepseek" ? "balance" : "plan_quota";
          providers.push({
            id: llm.id,
            label: llm.label,
            enabled: llm.enabled,
            llm: {
              default_model: llm.default_model ?? "auto",
              base_url: llm.base_url ?? "",
              api_type: "anthropic-messages",
              llm_api_key_ref: llm.api_key_ref,
              models: [],
              models_endpoint: "",
            },
            billing: billing
              ? { kind: billingKind, billing_api_key_ref: billing.api_key_ref }
              : undefined,
          });
        }
        mockState.settings = {
          providers,
          schema_version: "1.5",
          default_llm_provider_id: v0Settings.default_llm_provider_id,
          user_language: v0Settings.user_language,
          theme: v0Settings.theme,
          start_at_login: v0Settings.start_at_login,
          window: v0Settings.window,
          system_prompt: v0Settings.system_prompt,
          conversations: v0Settings.conversations,
          // V0 legacy fields cleared after migration (mirrors Rust behavior)
          llm_providers: [],
          billing_providers: [],
        };
      }
    }
    return { ...mockState.settings };
  },

  update_settings(args?: IPCArgs): unknown {
    const newSettings = args?.new_settings as any;
    if (newSettings) {
      mockState.settings = {
        ...mockState.settings,
        ...newSettings,
        schema_version: "1.5",
      };
    }
    return { ...mockState.settings };
  },

  list_billing_providers(): unknown {
    return mockState.settings.providers
      .filter((p: any) => p.billing !== undefined)
      .map((p: any) => ({
        id: p.id,
        label: p.label,
        enabled: p.enabled,
      }));
  },

  clear_all_history(): void {
    // No-op in mock
  },

  fetch_models(args?: IPCArgs): unknown {
    const providerId = args?.providerId as string;
    const provider = mockState.settings.providers.find((p: any) => p.id === providerId);
    return provider?.llm.models ?? [];
  },

  // ─── V2 File IO (ADR-0013) ───────────────────────────────────
  // Mirror of __mocks__/@tauri-apps/api/core.ts handlers.
  // test-setup.ts runs at vitest setup phase and intercepts the real
  // @tauri-apps/api/core module via vi.mock, so this is the live command
  // table at test runtime. Tests set mockState.resolved to control return
  // value, or mockState.rejected to simulate SandboxViolation / NotFound.
  read_file(): unknown {
    return mockState.resolved;
  },

  write_file(): unknown {
    return mockState.resolved;
  },

  edit_file(): unknown {
    return mockState.resolved;
  },

  search_files(): unknown {
    return mockState.resolved;
  },

  delete_file(): unknown {
    return mockState.resolved;
  },
};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation((name: string, args?: IPCArgs) => {
    mockState.calls.push(name);
    mockState.callArgs.push({ name, args: args as Record<string, unknown> | undefined });
    // BUG fix: 之前漏 push 到 invokeCalls,导致 test.find((c) => c.name === "read_file") 返回 undefined。
    // 同步 __mocks__/@tauri-apps/api/core.ts 里的行为,所有 IPC 调用都进 invokeCalls 供测试断言。
    mockState.invokeCalls.push({ name, args: args as Record<string, unknown> | undefined });

    if (mockState.rejected) {
      return Promise.reject(mockState.rejected);
    }

    // Backward compatibility: if mockState.resolved is set AND v0FixtureActive is false,
    // return it directly. This preserves existing test behavior where tests set mockState.resolved.
    // But if v0FixtureActive is true, we need to run the handler to apply migration.
    if (mockState.resolved !== undefined && !mockState.v0FixtureActive) {
      return Promise.resolve(mockState.resolved);
    }

    const handler = commandHandlers[name];
    if (!handler) {
      return Promise.reject(
        new Error(
          `[mock] Unknown IPC command: "${name}". Available: ${Object.keys(commandHandlers).join(", ")}`,
        ),
      );
    }

    try {
      return Promise.resolve(handler(args));
    } catch (e) {
      return Promise.reject(e);
    }
  }),
}));
