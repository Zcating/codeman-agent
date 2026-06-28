//! Tests for V1.5+ ProviderService + V2 WorkspaceService + FileService + SettingsService.
//! Uses Layer.succeed for mock implementations with it.effect pattern.
//!
//! V2: BillingService removed (ADR-0012 reversed) — no billing tests here.

import { it, expect, beforeEach } from "@effect/vitest";
import { describe } from "vitest";
import { Effect, Layer, Exit } from "effect";
import { mockState } from "../../__mocks__/@tauri-apps/api/core";
import {
  invoke,
  ConversationService,
  MessageService,
  ConversationServiceLive,
  MessageServiceLive,
  SettingsService,
  SettingsServiceImpl,
  ProviderService,
  FileService,
  SettingsServiceLive,
  FileServiceLive,
  TauriError,
  getSettingsBridge,
  updateSettingsBridge,
  clearAllHistoryBridge,
} from "./tauri";
import type { Provider } from "./types";

// ─── Mock Data ────────────────────────────────────────────────

const mockProvider: Provider = {
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
        context_window: 200000,
        deprecated: false,
        thinking: false,
      },
    ],
    models_endpoint: "https://api.minimaxi.com/anthropic/v1/models",
  },
};

const mockProviderList: Provider[] = [mockProvider];

// ─── Mock Layers ──────────────────────────────────────────────

const MockProviderServiceLive = Layer.succeed(ProviderService, {
  list: () => Effect.succeed(mockProviderList.filter((p) => p.enabled)),
  get: (id) => {
    const provider = mockProviderList.find((p) => p.id === id);
    if (!provider) {
      return Effect.fail(TauriError.IPC(`Provider not found: ${id}`));
    }
    return Effect.succeed(provider);
  },
  getModels: (id) => {
    const provider = mockProviderList.find((p) => p.id === id);
    if (!provider) {
      return Effect.fail(TauriError.IPC(`Provider not found: ${id}`));
    }
    return Effect.succeed(provider.llm.models ?? []);
  },
  fetchModels: (id) => {
    const provider = mockProviderList.find((p) => p.id === id);
    if (!provider) {
      return Effect.fail(TauriError.IPC(`Provider not found: ${id}`));
    }
    return Effect.tryPromise({
      try: async () => {
        const res = await fetch(provider.llm.models_endpoint, {
          headers: {
            Authorization: `Bearer ${provider.api_key}`,
            "Content-Type": "application/json",
          },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        }
        const data = (await res.json()) as {
          data: Array<{ id: string; name: string; context_window?: number }>;
        };
        return data.data.map((m) => ({
          id: m.id,
          label: m.name,
          context_window: m.context_window,
          deprecated: false,
          thinking: false,
        }));
      },
      catch: (e) => TauriError.IPC(`fetchModels failed: ${String(e)}`),
    });
  },
  delete: () => Effect.succeed(undefined),
});

const _MockSettingsServiceLive = Layer.succeed(SettingsService, {
  getSettings: () => invoke("get_settings") as Effect.Effect<any, AppError>,
  updateSettings: (patch) => invoke("update_settings", { newSettings: patch }) as Effect.Effect<any, AppError>,
  clearAllHistory: () => Effect.succeed(undefined),
  getActiveLlmProvider: () => Effect.succeed(null),
});
void _MockSettingsServiceLive;

import type { AppError } from "./types";

beforeEach(() => {
  mockState.calls = [];
  mockState.rejected = undefined;
  mockState.settings = {
    providers: [mockProvider],
    schema_version: "1.5",
    default_llm_provider_id: "minimax",
    user_language: "en",
    theme: "system",
    start_at_login: false,
    window: {
      remember_position: true,
      remember_size: true,
      default_size: { width: 1280, height: 1280 },
      min_size: { width: 800, height: 800 },
    },
    system_prompt: { default: "test", user_can_edit: true },
    conversations: { auto_archive_after_days: 30, max_history: 1000 },
    llm_providers: [],
  };
  mockState.v0FixtureActive = false;
});

describe("ProviderService", () => {
  it.effect("list returns enabled providers", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderService;
      const providers = yield* svc.list();
      expect(providers).toHaveLength(1);
      expect(providers[0].id).toBe("minimax");
    }).pipe(Effect.provide(MockProviderServiceLive)),
  );

  it.effect("get returns provider by id", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderService;
      const provider = yield* svc.get("minimax");
      expect(provider.id).toBe("minimax");
    }).pipe(Effect.provide(MockProviderServiceLive)),
  );

  it.effect("get fails for unknown provider", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderService;
      const exit = yield* Effect.exit(svc.get("nonexistent"));
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(MockProviderServiceLive)),
  );

  it.effect("getModels returns provider models", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderService;
      const models = yield* svc.getModels("minimax");
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe("MiniMax-M2.5-highspeed");
    }).pipe(Effect.provide(MockProviderServiceLive)),
  );
});

describe("ConversationService", () => {
  it.effect("list returns array from IPC", () =>
    Effect.gen(function* () {
      const svc = yield* ConversationService;
      const convos = yield* svc.list(false);
      expect(Array.isArray(convos)).toBe(true);
    }).pipe(Effect.provide(ConversationServiceLive)),
  );
});

describe("MessageService", () => {
  it.effect("list returns array from IPC", () =>
    Effect.gen(function* () {
      const svc = yield* MessageService;
      const msgs = yield* svc.list("test-conv");
      expect(Array.isArray(msgs)).toBe(true);
    }).pipe(Effect.provide(MessageServiceLive)),
  );
});

describe("FileService", () => {
  it.effect("readFile is wired to read_file IPC", () =>
    Effect.gen(function* () {
      const svc = yield* FileService;
      const result = yield* svc.readFile("main", "/tmp/x.txt");
      // mockState.resolved is undefined by default, so result is undefined
      expect(result).toBeUndefined();
    }).pipe(Effect.provide(FileServiceLive)),
  );
});

describe("SettingsService", () => {
  it.effect("getSettings reads from IPC", () =>
    Effect.gen(function* () {
      const svc = yield* SettingsService;
      const settings = yield* svc.getSettings();
      expect(settings.schema_version).toBe("1.5");
    }).pipe(Effect.provide(SettingsServiceLive)),
  );
});

describe("Bridge Functions", () => {
  it("getSettingsBridge returns current settings", async () => {
    const settings = await getSettingsBridge();
    expect(settings.schema_version).toBe("1.5");
  });

  it("updateSettingsBridge patches settings", async () => {
    const updated = await updateSettingsBridge({ theme: "dark" });
    expect(updated.theme).toBe("dark");
  });

  it("clearAllHistoryBridge completes", async () => {
    await expect(clearAllHistoryBridge()).resolves.toBeUndefined();
  });
});

describe("SettingsServiceImpl (compat object)", () => {
  it("exposes getSettings", () => {
    expect(typeof SettingsServiceImpl.getSettings).toBe("function");
  });
});
