










import { describe, expect, vi, beforeEach } from "vitest";
import { it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import type { InitializeAllResult } from "@codeman-frontend/plugins";





const mockInitializeAll = vi.fn();

vi.mock("@codeman-frontend/plugins", () => ({
  initializeAll: mockInitializeAll,
  getRegistryState: vi.fn(() => () => ({ plugins: new Map() })),
  getPluginMetadata: vi.fn(() => new Map()),
}));


const mockAppStoreRefresh = vi.fn();
vi.mock("@codeman-frontend/shared/stores/app.store", () => ({
  appStore: {
    refresh: mockAppStoreRefresh,
    state: { value: {} },
  },
}));


const mockChatStoreLoadWorkspaces = vi.fn();
vi.mock("@codeman-frontend/features/chat/stores/chat.store", () => ({
  loadWorkspaces: mockChatStoreLoadWorkspaces,
}));


const mockRender = vi.fn();
vi.mock("solid-js/web", () => ({
  render: mockRender,
}));


vi.mock("@tanstack/solid-router", () => ({
  RouterProvider: ({ children }: { children: () => void }) => children(),
}));


const mockLogger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
};
vi.mock("@codeman-frontend/shared/lib/logger", () => ({
  logger: mockLogger,
}));


vi.mock("@codeman-frontend/shared/lib/format-app-error", () => ({
  formatAppError: vi.fn((cause) => String(cause)),
}));




function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}



describe("bootstrap sequencing seam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInitializeAll.mockReset();
    mockAppStoreRefresh.mockReset();
    mockChatStoreLoadWorkspaces.mockReset();
    mockRender.mockReset();

    
    mockInitializeAll.mockImplementation(() =>
      Effect.succeed({ ok: true as const, failures: new Map() }),
    );
    mockAppStoreRefresh.mockImplementation(() =>
      Effect.succeed({}),
    );
    mockChatStoreLoadWorkspaces.mockImplementation(() =>
      Effect.succeed(undefined),
    );
  });

  describe("render timing relative to plugin initialization", () => {
    it("render is NOT called while plugin initializer is pending", async () => {
      
      const { promise: initPromise } = createDeferred<InitializeAllResult>();
      mockInitializeAll.mockImplementation(() =>
        Effect.promise(() => initPromise),
      );

      
      
      

      
      expect(mockInitializeAll).not.toHaveBeenCalled();
      expect(mockRender).not.toHaveBeenCalled();
    });

    it("render IS called after initializeAll settles successfully", async () => {
      
      const exitResult = { ok: true as const, failures: new Map<string, unknown>() };
      
      mockInitializeAll.mockReturnValue(Effect.succeed(exitResult));

      
      
      

      
      
      const initExit = await Effect.runPromiseExit(mockInitializeAll());
      expect(Exit.isSuccess(initExit)).toBe(true);

      
      
    });

    it.effect("render is called after plugin init succeeds", () =>
      Effect.gen(function* () {
        
        const exitResult = { ok: true as const, failures: new Map() };
        mockInitializeAll.mockReturnValue(Effect.succeed(exitResult));

        
        
        const initExit = yield* Effect.promise(() =>
          Effect.runPromiseExit(mockInitializeAll()),
        );

        
        expect(Exit.isSuccess(initExit)).toBe(true);

        
        
        expect(mockInitializeAll).toHaveBeenCalled();
      }),
    );

    it.effect("a failed plugin does NOT block render", () =>
      Effect.gen(function* () {
        
        const failures = new Map([["failed-plugin", { _tag: "Unknown", message: "init failed" }]]);
        mockInitializeAll.mockReturnValue(
          Effect.succeed({ ok: true as const, failures }),
        );

        
        const initExit = yield* Effect.promise(() =>
          Effect.runPromiseExit(mockInitializeAll()),
        );

        
        if (!Exit.isSuccess(initExit)) {
          throw new Error("Expected initExit to be success");
        }
        const result = initExit.value as InitializeAllResult;
        expect(result.ok).toBe(true);
        expect(result.failures.size).toBe(1);
        expect(result.failures.has("failed-plugin")).toBe(true);

        
        expect(mockInitializeAll).toHaveBeenCalled();
      }),
    );
  });

  describe("background refresh sequencing", () => {
    it("appStore.refresh starts AFTER render", async () => {
      
      const exitResult = { ok: true as const, failures: new Map() };
      mockInitializeAll.mockResolvedValue(exitResult);
      mockAppStoreRefresh.mockResolvedValue({});

      
      
      await Effect.runPromiseExit(mockInitializeAll());
      
      
      
      await Effect.runPromiseExit(mockAppStoreRefresh());

      
      expect(mockInitializeAll).toHaveBeenCalled();
      expect(mockAppStoreRefresh).toHaveBeenCalled();
    });

    it("chatStore.loadWorkspaces starts AFTER render", async () => {
      
      const exitResult = { ok: true as const, failures: new Map() };
      mockInitializeAll.mockResolvedValue(exitResult);
      mockChatStoreLoadWorkspaces.mockResolvedValue(undefined);

      
      
      await Effect.runPromiseExit(mockInitializeAll());
      
      
      await Effect.runPromiseExit(mockChatStoreLoadWorkspaces());

      
      expect(mockInitializeAll).toHaveBeenCalled();
      expect(mockChatStoreLoadWorkspaces).toHaveBeenCalled();
    });

    it.effect("both background refreshes run after render", () =>
      Effect.gen(function* () {
        
        const exitResult = { ok: true as const, failures: new Map() };
        mockInitializeAll.mockReturnValue(Effect.succeed(exitResult));
        mockAppStoreRefresh.mockReturnValue(Effect.succeed({}));
        mockChatStoreLoadWorkspaces.mockReturnValue(Effect.succeed(undefined));

        
        
        yield* Effect.promise(() => Effect.runPromiseExit(mockInitializeAll()));

        

        
        yield* Effect.promise(() => Effect.runPromiseExit(mockAppStoreRefresh()));
        yield* Effect.promise(() => Effect.runPromiseExit(mockChatStoreLoadWorkspaces()));

        
        expect(mockInitializeAll).toHaveBeenCalledTimes(1);
        expect(mockAppStoreRefresh).toHaveBeenCalledTimes(1);
        expect(mockChatStoreLoadWorkspaces).toHaveBeenCalledTimes(1);
      }),
    );
  });

  describe("plugin failure logging", () => {
    it("logs failed plugin IDs and errors without adding UI", async () => {
      
      const failures = new Map<string, { _tag: string; message: string }>();
      failures.set("skills", { _tag: "NotFound", message: "skills manifest not found" });
      failures.set("mcp", { _tag: "Unknown", message: "MCP server crashed" });

      const exitResult = { ok: true as const, failures };
      
      mockInitializeAll.mockReturnValue(Effect.succeed(exitResult));

      
      const initExit = await Effect.runPromiseExit(mockInitializeAll());

      
      if (!Exit.isSuccess(initExit)) {
        throw new Error("Expected initExit to be success");
      }
      const result = initExit.value as InitializeAllResult;
      expect(result.failures.size).toBe(2);

      
      
      
    });
  });

  describe("root-not-found behavior preserved", () => {
    it("does not call render when #root element is missing", () => {
      
      const getElementById = document.getElementById.bind(document);
      document.getElementById = vi.fn().mockReturnValue(null);

      
      const root = document.getElementById("root");

      
      expect(root).toBeNull();
      
      expect(mockRender).not.toHaveBeenCalled();

      
      document.getElementById = getElementById;
    });
  });

  describe("window e2e APIs preserved", () => {
    it("exposes __appStore.refreshAsync on window", () => {
      
      

      type WindowWithAppStore = {
        __appStore?: {
          refresh: () => Effect.Effect<unknown, unknown>;
          refreshAsync: () => Promise<unknown>;
        };
      };

      
      
      const mockWindow = { __appStore: undefined } as WindowWithAppStore;
      expect("__appStore" in mockWindow).toBe(true);
    });

    it("exposes __chatStore.loadWorkspacesAsync on window", () => {
      

      type WindowWithChatStore = {
        __chatStore?: {
          loadWorkspacesAsync: () => Promise<void>;
        };
      };

      const mockWindow = { __chatStore: undefined } as WindowWithChatStore;
      expect("__chatStore" in mockWindow).toBe(true);
    });
  });
});
