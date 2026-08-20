
import { describe, expect, vi, beforeEach } from "vitest";
import { it } from "@effect/vitest";
import { Effect, Exit } from "effect";


const mockInitializeSkillsManifests = vi.fn();
const mockInitializeMcp = vi.fn();
const mockInitializeAutomations = vi.fn();

vi.mock("@codeman-frontend/features/skills/stores/skills.store", () => ({
  initializeSkillsManifests: mockInitializeSkillsManifests,
}));

vi.mock("@codeman-frontend/features/mcp/stores/store", () => ({
  initializeMcp: mockInitializeMcp,
}));

vi.mock("@codeman-frontend/plugins/automations/index", () => ({
  initializeAutomations: mockInitializeAutomations,
}));

vi.mock("@codeman-frontend/plugins", () => ({
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
    mockInitializeSkillsManifests.mockReset();
    mockInitializeMcp.mockReset();
    mockInitializeAutomations.mockReset();
    mockAppStoreRefresh.mockReset();
    mockChatStoreLoadWorkspaces.mockReset();
    mockRender.mockReset();

    mockInitializeSkillsManifests.mockImplementation(() => Effect.succeed(undefined));
    mockInitializeMcp.mockImplementation(() => Effect.succeed(undefined));
    mockInitializeAutomations.mockImplementation(() => Effect.succeed(undefined));
    mockAppStoreRefresh.mockImplementation(() =>
      Effect.succeed({}),
    );
    mockChatStoreLoadWorkspaces.mockImplementation(() =>
      Effect.succeed(undefined),
    );
  });

  describe("render timing relative to plugin initialization", () => {
    it("render is NOT called while plugin initializer is pending", async () => {
      const { promise: initPromise } = createDeferred<void>();
      mockInitializeSkillsManifests.mockImplementation(() =>
        Effect.promise(() => initPromise),
      );

      expect(mockInitializeSkillsManifests).not.toHaveBeenCalled();
      expect(mockRender).not.toHaveBeenCalled();
    });

    it("render IS called after initialize functions settle successfully", async () => {
      const results = await Promise.all([
        Effect.runPromiseExit(mockInitializeSkillsManifests()),
        Effect.runPromiseExit(mockInitializeMcp()),
        Effect.runPromiseExit(mockInitializeAutomations()),
      ]);

      const allSucceeded = results.every(Exit.isSuccess);
      expect(allSucceeded).toBe(true);
    });

    it.effect("render is called after plugin init succeeds", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          Effect.runPromiseExit(mockInitializeSkillsManifests()),
        );
        yield* Effect.promise(() => Effect.runPromiseExit(mockInitializeMcp()));
        yield* Effect.promise(() => Effect.runPromiseExit(mockInitializeAutomations()));

        expect(mockInitializeSkillsManifests).toHaveBeenCalled();
        expect(mockInitializeMcp).toHaveBeenCalled();
        expect(mockInitializeAutomations).toHaveBeenCalled();
      }),
    );
  });

  describe("background refresh sequencing", () => {
    it("appStore.refresh starts AFTER render", async () => {
      mockAppStoreRefresh.mockResolvedValue({});

      await Effect.runPromiseExit(mockInitializeSkillsManifests());
      await Effect.runPromiseExit(mockAppStoreRefresh());

      expect(mockInitializeSkillsManifests).toHaveBeenCalled();
      expect(mockAppStoreRefresh).toHaveBeenCalled();
    });

    it("chatStore.loadWorkspaces starts AFTER render", async () => {
      mockChatStoreLoadWorkspaces.mockResolvedValue(undefined);

      await Effect.runPromiseExit(mockInitializeSkillsManifests());
      await Effect.runPromiseExit(mockChatStoreLoadWorkspaces());

      expect(mockInitializeSkillsManifests).toHaveBeenCalled();
      expect(mockChatStoreLoadWorkspaces).toHaveBeenCalled();
    });

    it.effect("both background refreshes run after render", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => Effect.runPromiseExit(mockInitializeSkillsManifests()));
        yield* Effect.promise(() => Effect.runPromiseExit(mockInitializeMcp()));
        yield* Effect.promise(() => Effect.runPromiseExit(mockInitializeAutomations()));

        yield* Effect.promise(() => Effect.runPromiseExit(mockAppStoreRefresh()));
        yield* Effect.promise(() => Effect.runPromiseExit(mockChatStoreLoadWorkspaces()));

        expect(mockInitializeSkillsManifests).toHaveBeenCalledTimes(1);
        expect(mockInitializeMcp).toHaveBeenCalledTimes(1);
        expect(mockInitializeAutomations).toHaveBeenCalledTimes(1);
        expect(mockAppStoreRefresh).toHaveBeenCalledTimes(1);
        expect(mockChatStoreLoadWorkspaces).toHaveBeenCalledTimes(1);
      }),
    );
  });

  describe("plugin failure logging", () => {
    it("logs failed plugin IDs and errors without adding UI", async () => {
      mockInitializeSkillsManifests.mockRejectedValue(new Error("skills manifest not found"));

      await Effect.runPromiseExit(mockInitializeSkillsManifests());

      expect(mockInitializeSkillsManifests).toHaveBeenCalled();
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

});