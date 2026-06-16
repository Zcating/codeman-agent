// Integration tests for V0 → V1.5 settings migration.
//
// Tests the end-to-end migration flow via the mock Tauri API:
// 1. V0 fixture (llm_providers[] + billing_providers[]) → V1.5 (providers[])
// 2. V0.5 fresh install (empty providers) → pre-filled MiniMax
// 3. Idempotency (re-running migration is no-op)
//
// V0 fixture shape mirrors src-tauri/src/settings.rs::migrate_to_v1_5().
// Mock migration in src/__mocks__/@tauri-apps/api/core.ts::migrateV0toV15.

import { describe, it, expect, beforeEach } from "vitest";
import { Effect } from "effect";
import { mockState } from "../../../__mocks__/@tauri-apps/api/core";
import { ProviderService, ProviderServiceLive } from "../../../shared/lib/tauri";

// ─── V0 Settings Fixture ──────────────────────────────────────────────────────

const V0_FIXTURE = {
  schema_version: undefined as string | undefined,
  llm_providers: [
    {
      id: "minimax",
      label: "MiniMax",
      enabled: true,
      default_model: "MiniMax-M2.5-highspeed",
      base_url: "https://api.minimaxi.com/anthropic",
      api_type: "anthropic-messages" as const,
      api_key_ref: "llm_providers/minimax/api_key",
    },
  ],
  billing_providers: [
    {
      id: "minimax",
      enabled: true,
      refresh_interval_secs: 3600,
      api_key_ref: "billing/minimax/api_key",
    },
  ],
  default_llm_provider_id: "minimax",
  user_language: "en" as const,
  theme: "system" as const,
  start_at_login: true,
  window: {
    remember_position: true,
    remember_size: true,
    default_size: { width: 1280, height: 1280 },
    min_size: { width: 400, height: 300 },
  },
  system_prompt: { default: "You are a helpful assistant.", user_can_edit: true },
  conversations: { auto_archive_after_days: 30, max_history: 1000 },
};

// ─── V0.5 Empty Fixture (fresh install) ──────────────────────────────────────

const V05_FIXTURE = {
  schema_version: undefined as string | undefined,
  llm_providers: [] as typeof V0_FIXTURE.llm_providers,
  billing_providers: [] as typeof V0_FIXTURE.billing_providers,
  default_llm_provider_id: undefined,
  user_language: "auto" as const,
  theme: "system" as const,
  start_at_login: true,
  window: {
    remember_position: true,
    remember_size: true,
    default_size: { width: 1280, height: 1280 },
    min_size: { width: 400, height: 300 },
  },
  system_prompt: { default: "", user_can_edit: true },
  conversations: { auto_archive_after_days: 30, max_history: 1000 },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("V0 → V1.5 migration integration", () => {
  beforeEach(() => {
    // Reset to V1.5 defaults before each test
    mockState.v0FixtureActive = false;
    mockState.resolved = undefined;
    mockState.store = {};
    mockState.calls = [];
    mockState.settings = {
      providers: [
        {
          id: "minimax",
          label: "MiniMax",
          enabled: true,
          llm: {
            default_model: "MiniMax-M2.5-highspeed",
            base_url: "https://api.minimaxi.com/anthropic",
            api_type: "anthropic-messages" as const,
            llm_api_key_ref: "llm_providers/minimax/api_key",
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
            kind: "plan_quota" as const,
            billing_api_key_ref: "billing/minimax/api_key",
          },
        },
      ],
      schema_version: "1.5" as const,
      default_llm_provider_id: "minimax",
      user_language: "en",
      theme: "system",
      start_at_login: false,
      window: {
        remember_position: false,
        remember_size: false,
        default_size: { width: 800, height: 600 },
        min_size: { width: 400, height: 300 },
      },
      system_prompt: { default: "You are a helpful assistant.", user_can_edit: true },
      conversations: { auto_archive_after_days: 30, max_history: 1000 },
      // V0 legacy fields (empty for V1.5 default)
      llm_providers: [],
      billing_providers: [],
    };
  });

  describe("V0 settings → V1.5 migrated (happy path)", () => {
    it("migrates V0 settings to V1.5 with single providers[] entry", async () => {
      // Arrange: Activate V0 fixture
      mockState.v0FixtureActive = true;
      mockState.resolved = V0_FIXTURE;

      // Act: Fetch providers via ProviderService
      const program = Effect.gen(function* () {
        const svc = yield* ProviderService;
        return yield* svc.list();
      }).pipe(Effect.provide(ProviderServiceLive));

      const providers = await Effect.runPromise(program);

      // Assert 1: providers[] has exactly 1 entry
      expect(providers).toHaveLength(1);

      // Assert 2: minimax provider with correct id
      expect(providers[0].id).toBe("minimax");
      expect(providers[0].label).toBe("MiniMax");
      expect(providers[0].enabled).toBe(true);

      // Assert 3: LLM config migrated correctly
      expect(providers[0].llm).toBeDefined();
      expect(providers[0].llm.default_model).toBe("MiniMax-M2.5-highspeed");
      expect(providers[0].llm.base_url).toBe("https://api.minimaxi.com/anthropic");
      expect(providers[0].llm.api_type).toBe("anthropic-messages");

      // Assert 4: Billing config migrated correctly (minimax → plan_quota per ADR-0012)
      expect(providers[0].billing).toBeDefined();
      expect(providers[0].billing!.kind).toBe("plan_quota");
      expect(providers[0].billing!.billing_api_key_ref).toBe("billing/minimax/api_key");
    });

    it("sets schema_version to 1.5 after migration", async () => {
      // Arrange
      mockState.v0FixtureActive = true;
      mockState.resolved = V0_FIXTURE;

      // Act
      const program = Effect.gen(function* () {
        const svc = yield* ProviderService;
        return yield* svc.list();
      }).pipe(Effect.provide(ProviderServiceLive));

      await Effect.runPromise(program);

      // Assert: schema_version is "1.5"
      expect(mockState.settings.schema_version).toBe("1.5");
    });

    it("is idempotent (second call returns same V1.5+ shape)", async () => {
      // Arrange
      mockState.v0FixtureActive = true;
      mockState.resolved = V0_FIXTURE;

      // Act: Call twice
      const program = Effect.gen(function* () {
        const svc = yield* ProviderService;
        const first = yield* svc.list();
        const second = yield* svc.list();
        return { first, second };
      }).pipe(Effect.provide(ProviderServiceLive));

      const { first, second } = await Effect.runPromise(program);

      // Assert: Both calls return same result
      expect(first).toEqual(second);
      expect(first).toHaveLength(1);
      expect(first[0].id).toBe("minimax");
      expect(second[0].id).toBe("minimax");

      // Assert: schema_version still "1.5" (not re-migrated)
      expect(mockState.settings.schema_version).toBe("1.5");
    });

    it("V0 legacy fields cleared after migration (llm_providers, billing_providers)", async () => {
      // Arrange
      mockState.v0FixtureActive = true;
      mockState.resolved = V0_FIXTURE;

      // Act: Trigger migration
      const program = Effect.gen(function* () {
        const svc = yield* ProviderService;
        return yield* svc.list();
      }).pipe(Effect.provide(ProviderServiceLive));

      await Effect.runPromise(program);

      // Assert: V0 legacy fields are cleared in the migrated settings
      expect(mockState.settings.llm_providers).toHaveLength(0);
      expect(mockState.settings.billing_providers).toHaveLength(0);
    });
  });

  describe("V0.5 (empty providers) → V1.5 fresh install", () => {
    it("treats V0.5 (no keyring) as fresh install with MiniMax pre-fill", async () => {
      // Arrange: V0.5 fixture - empty llm_providers and billing_providers
      // V0.5 is detected by the migration: if llm_providers AND billing_providers
      // are both empty, migrateV0toV15 treats it as fresh install and pre-fills MiniMax.
      // So we need v0FixtureActive = true to trigger the migration check.
      mockState.v0FixtureActive = true;
      mockState.resolved = V05_FIXTURE;

      // Act
      const program = Effect.gen(function* () {
        const svc = yield* ProviderService;
        return yield* svc.list();
      }).pipe(Effect.provide(ProviderServiceLive));

      const providers = await Effect.runPromise(program);

      // Assert: V0.5 treated as fresh install → MiniMax pre-fill returned
      expect(providers.length).toBeGreaterThanOrEqual(1);
      expect(providers[0].id).toBe("minimax");
      expect(providers[0].llm.default_model).toBe("MiniMax-M2.5-highspeed");
      expect(providers[0].billing).toBeDefined();
      expect(providers[0].billing!.kind).toBe("plan_quota");
    });
  });

  describe("get_settings IPC command tracking", () => {
    it("records get_settings in mockState.calls", async () => {
      // Arrange
      mockState.v0FixtureActive = true;
      mockState.resolved = V0_FIXTURE;

      // Act
      const program = Effect.gen(function* () {
        const svc = yield* ProviderService;
        return yield* svc.list();
      }).pipe(Effect.provide(ProviderServiceLive));

      await Effect.runPromise(program);

      // Assert: get_settings was called
      expect(mockState.calls).toContain("get_settings");
    });
  });
});
