//! Tests for V1.5 ProviderService + BillingService + V2 WorkspaceService + FileService
//! Uses Layer.succeed for mock implementations with it.effect pattern

import { it, expect } from "@effect/vitest";
import { describe } from "vitest";
import { Effect, Layer, Exit } from "effect";
import { mockState } from "../../__mocks__/@tauri-apps/api/core";
import {
  ProviderService,
  BillingService,
  WorkspaceService,
  FileService,
  WorkspaceServiceLive,
  FileServiceLive,
  TauriError,
  BillingError,
} from "./tauri";
import type { Provider, Snapshot, Workspace } from "./types";

// ─── Mock Data ────────────────────────────────────────────────

const mockProvider: Provider = {
  id: "minimax",
  label: "MiniMax",
  enabled: true,
  llm: {
    default_model: "MiniMax-M2.5-highspeed",
    base_url: "https://api.minimaxi.com/anthropic",
    api_type: "anthropic-messages",
    llm_api_key_ref: "llm_providers/minimax/api_key",
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
  billing: {
    kind: "plan_quota",
    billing_api_key_ref: "billing/minimax/api_key",
  },
};

const mockProviderList: Provider[] = [mockProvider];

// ─── Mock Layers ──────────────────────────────────────────────

const MockProviderServiceLive = Layer.succeed(ProviderService, {
  list: () => Effect.succeed(mockProviderList.filter((p) => p.enabled)),
  listByKind: (kind) =>
    Effect.succeed(
      mockProviderList.filter((p) => p.enabled && (kind === "llm" ? p.llm : p.billing)),
    ),
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
    if (!provider.llm.models_endpoint) {
      return Effect.fail(TauriError.IPC(`No models_endpoint for provider: ${id}`));
    }
    return Effect.succeed(provider.llm.models ?? []);
  },
});

const MockBillingServiceLive = Layer.succeed(BillingService, {
  list: () => Effect.succeed(mockProviderList.filter((p) => p.enabled && p.billing)),
  fetchSnapshot: (providerId) => {
    const provider = mockProviderList.find((p) => p.id === providerId && p.enabled && p.billing);
    if (!provider || !provider.billing) {
      return Effect.fail({
        kind: "NotFound" as const,
        message: `Billing provider not found: ${providerId}`,
      } satisfies BillingError);
    }
    if (provider.billing.kind === "balance") {
      return Effect.succeed({
        kind: "balance" as const,
        amount: 100.5,
        currency: "USD",
        auto_recharge: null,
      } satisfies Snapshot);
    }
    return Effect.succeed({
      kind: "plan_quota" as const,
      remaining: 1000,
      total: 5000,
      expires_at: null,
      daily_avg: null,
    } satisfies Snapshot);
  },
});

// ─── ProviderService Tests ────────────────────────────────────

describe("ProviderService.list", () => {
  it.effect("returns enabled providers", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderService;
      const providers = yield* svc.list();
      expect(providers.length).toBeGreaterThan(0);
      expect(providers.every((p) => p.enabled)).toBe(true);
    }).pipe(Effect.provide(MockProviderServiceLive), Effect.provide(MockBillingServiceLive)),
  );

  it.effect("returns minimax provider from mock", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderService;
      const providers = yield* svc.list();
      expect(providers).toHaveLength(1);
      expect(providers[0].id).toBe("minimax");
    }).pipe(Effect.provide(MockProviderServiceLive), Effect.provide(MockBillingServiceLive)),
  );
});

describe("ProviderService.listByKind", () => {
  it.effect("returns llm providers when kind is 'llm'", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderService;
      const providers = yield* svc.listByKind("llm");
      expect(providers.length).toBeGreaterThan(0);
      providers.forEach((p) => expect(p.llm).toBeDefined());
    }).pipe(Effect.provide(MockProviderServiceLive), Effect.provide(MockBillingServiceLive)),
  );

  it.effect("returns billing providers when kind is 'billing'", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderService;
      const providers = yield* svc.listByKind("billing");
      providers.forEach((p) => expect(p.billing).toBeDefined());
    }).pipe(Effect.provide(MockProviderServiceLive), Effect.provide(MockBillingServiceLive)),
  );
});

describe("ProviderService.get", () => {
  it.effect("returns provider by id", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderService;
      const provider = yield* svc.get("minimax");
      expect(provider.id).toBe("minimax");
      expect(provider.llm).toBeDefined();
    }).pipe(Effect.provide(MockProviderServiceLive), Effect.provide(MockBillingServiceLive)),
  );

  it.effect("fails with TauriError for unknown provider", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderService;
      const exit = yield* Effect.exit(svc.get("nonexistent"));
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(MockProviderServiceLive), Effect.provide(MockBillingServiceLive)),
  );
});

describe("ProviderService.getModels", () => {
  it.effect("returns models from provider settings", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderService;
      const models = yield* svc.getModels("minimax");
      expect(models.length).toBeGreaterThan(0);
      expect(models[0].id).toBe("MiniMax-M2.5-highspeed");
    }).pipe(Effect.provide(MockProviderServiceLive), Effect.provide(MockBillingServiceLive)),
  );

  it.effect("fails for unknown provider", () =>
    Effect.gen(function* () {
      const svc = yield* ProviderService;
      const exit = yield* Effect.exit(svc.getModels("nonexistent"));
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(MockProviderServiceLive), Effect.provide(MockBillingServiceLive)),
  );
});

// ─── BillingService Tests ─────────────────────────────────────

describe("BillingService.list", () => {
  it.effect("returns providers with billing configured", () =>
    Effect.gen(function* () {
      const svc = yield* BillingService;
      const providers = yield* svc.list();
      providers.forEach((p) => expect(p.billing).toBeDefined());
    }).pipe(Effect.provide(MockProviderServiceLive), Effect.provide(MockBillingServiceLive)),
  );
});

describe("BillingService.fetchSnapshot", () => {
  it.effect("returns snapshot for valid billing provider", () =>
    Effect.gen(function* () {
      const svc = yield* BillingService;
      const snapshot = yield* svc.fetchSnapshot("minimax");
      expect(snapshot.kind).toBe("plan_quota");
    }).pipe(Effect.provide(MockProviderServiceLive), Effect.provide(MockBillingServiceLive)),
  );

  it.effect("fails with NotFound for missing provider", () =>
    Effect.gen(function* () {
      const svc = yield* BillingService;
      const exit = yield* Effect.exit(svc.fetchSnapshot("nonexistent"));
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(MockProviderServiceLive), Effect.provide(MockBillingServiceLive)),
  );
});

// ─── WorkspaceService Smoke Tests ─────────────────────────────────────────

describe("WorkspaceService.list", () => {
  it.effect("returns empty array when no workspaces in settings", () =>
    Effect.gen(function* () {
      const svc = yield* WorkspaceService;
      const workspaces = yield* svc.list();
      expect(workspaces).toEqual([]);
    }).pipe(Effect.provide(WorkspaceServiceLive)),
  );
});

// ─── FileService Smoke Tests ───────────────────────────────────────────────

describe("FileService.readFile", () => {
  it.effect("invokes read_file with correct camelCase args", () =>
    Effect.gen(function* () {
      // Clear any prior calls
      mockState.calls.length = 0;
      mockState.invokeCalls.length = 0;

      const svc = yield* FileService;
      yield* svc.readFile("ws1", "/tmp/x.txt");

      const readCall = mockState.invokeCalls.find((c) => c.name === "read_file");
      expect(readCall).toBeDefined();
      expect(readCall?.args).toMatchObject({
        workspace_id: "ws1",
        path: "/tmp/x.txt",
      });
    }).pipe(Effect.provide(FileServiceLive)),
  );
});

describe("FileService.editFile", () => {
  it.effect("invokes edit_file with replace_all as boolean", () =>
    Effect.gen(function* () {
      // Clear any prior calls
      mockState.calls.length = 0;
      mockState.invokeCalls.length = 0;

      const svc = yield* FileService;
      yield* svc.editFile("ws1", "/tmp/x.txt", "old", "new", true);

      const editCall = mockState.invokeCalls.find((c) => c.name === "edit_file");
      expect(editCall).toBeDefined();
      expect(editCall?.args).toMatchObject({
        workspace_id: "ws1",
        path: "/tmp/x.txt",
        old_text: "old",
        new_text: "new",
        replace_all: true,
      });
      // Ensure replace_all is boolean, not string
      expect(typeof editCall?.args?.replace_all).toBe("boolean");
    }).pipe(Effect.provide(FileServiceLive)),
  );
});
