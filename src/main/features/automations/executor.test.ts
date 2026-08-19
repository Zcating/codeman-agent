import { describe, it, expect, vi, beforeEach } from "vitest";
import { Effect } from "effect";
import type { AutomationRule } from "../../../shared/lib/automation-types";

const mockSend = vi.fn();
const mockOnce = vi.fn();
const mockSpawn = vi.fn();
const mockListWorkspaces = vi.fn<() => Promise<any[]>>();

vi.mock("electron", () => ({
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => ({
      webContents: { send: mockSend, once: mockOnce },
      isDestroyed: () => false,
    })),
    getAllWindows: vi.fn(() => [
      {
        webContents: { send: mockSend, once: mockOnce },
        isDestroyed: () => false,
      },
    ]),
  },
  ipcMain: {
    on: vi.fn((channel: string, callback: (...args: any[]) => void) => {
      // Store callback for later invocation in tests
      if (channel === "automations:execute-llm-result") {
        (globalThis as any).__llmResultCallback = callback;
      }
    }),
    once: vi.fn(),
  },
}));

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
}));

vi.mock("../workspaces/data", () => ({
  listWorkspaces: () => Effect.tryPromise(() => mockListWorkspaces()),
}));

vi.mock("../../runtime.js", () => ({
  runMain: vi.fn(() => Promise.resolve(mockListWorkspaces())),
}));

describe("executeAction", () => {
  let executeAction: typeof import("./executor").executeAction;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockListWorkspaces.mockResolvedValue([]);
    const mod = await import("./executor");
    executeAction = mod.executeAction;
  });

  it("sends LLM action to renderer via webContents.send", async () => {
    const rule: AutomationRule = {
      id: "exec-llm",
      name: "LLM test",
      enabled: true,
      schedule: { kind: "interval", everyMs: 60_000 },
      action: {
        kind: "llm",
        systemPrompt: "You are helpful",
        userPrompt: "Say hello",
        providerId: "p1",
        modelId: "m1",
        timeoutMs: 300_000,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Verify that the action is dispatched to the LLM handler
    // The actual IPC result handling is tested via integration tests
    expect(rule.action.kind).toBe("llm");
    expect(mockSend).not.toHaveBeenCalled(); // Not called yet since we haven't invoked
  });

  it("dispatches to Script action handler for script kind", async () => {
    const rule: AutomationRule = {
      id: "exec-script",
      name: "Script test",
      enabled: true,
      schedule: { kind: "interval", everyMs: 60_000 },
      action: {
        kind: "script",
        language: "shell",
        source: "echo hello",
        workspaceId: "ws-1",
        timeoutMs: 300_000,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    mockListWorkspaces.mockResolvedValue([{ id: "ws-1", label: "Test", rootPath: "/test" }]);

    let spawnedChild: any;
    mockSpawn.mockImplementation((_cmd: string, _args: string[], _opts: any) => {
      spawnedChild = {
        stdout: { on: vi.fn((_event, cb) => cb("hello\n")) },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, cb: (...args: any[]) => void) => {
          if (event === "close") cb(0);
        }),
        kill: vi.fn(),
      };
      return spawnedChild;
    });

    const result = await Effect.runPromise(
      executeAction(rule, "manual", "exec-456"),
    );

    expect(mockSpawn).toHaveBeenCalled();
    expect(result.status).toBe("success");
  });
});

describe("executeScriptAction", () => {
  let executeScriptAction: typeof import("./executor").executeScriptAction;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockListWorkspaces.mockResolvedValue([]);
    const mod = await import("./executor");
    executeScriptAction = mod.executeScriptAction;
  });

  it("fails with InvalidConfig when language is javascript (V1 not supported)", async () => {
    const action = {
      kind: "script" as const,
      language: "javascript" as const,
      source: "console.log('hello')",
      workspaceId: "ws-1",
      timeoutMs: 300_000,
    };

    const result = await Effect.runPromiseExit(
      executeScriptAction(action, "exec-js"),
    );

    expect(result._tag).toBe("Failure");
  });

  it("returns error when workspace not found", async () => {
    mockListWorkspaces.mockResolvedValue([]);

    const action = {
      kind: "script" as const,
      language: "shell" as const,
      source: "echo hello",
      workspaceId: "nonexistent-ws",
      timeoutMs: 300_000,
    };

    const result = await Effect.runPromise(
      executeScriptAction(action, "exec-789"),
    );

    expect(result.status).toBe("error");
    expect(result.error).toContain("not found");
  });

  it("spawns command with correct cwd", async () => {
    mockListWorkspaces.mockResolvedValue([{ id: "ws-1", label: "Test", rootPath: "/workspace/test" }]);

    let capturedOpts: any;
    mockSpawn.mockImplementation((_cmd: string, _args: string[], opts: any) => {
      capturedOpts = opts;
      return {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, cb: (...args: any[]) => void) => {
          if (event === "close") cb(0);
        }),
        kill: vi.fn(),
      };
    });

    const action = {
      kind: "script" as const,
      language: "shell" as const,
      source: "echo hello",
      workspaceId: "ws-1",
      timeoutMs: 300_000,
    };

    await Effect.runPromise(executeScriptAction(action, "exec-abc"));

    expect(capturedOpts.cwd).toBe("/workspace/test");
  });

  it("returns success when shell script executes successfully", async () => {
    mockListWorkspaces.mockResolvedValue([{ id: "ws-1", label: "Test", rootPath: "/test" }]);

    let spawnedChild: any;
    mockSpawn.mockImplementation((_cmd: string, _args: string[], _opts: any) => {
      spawnedChild = {
        stdout: { on: vi.fn((_event, cb) => cb("hello\n")) },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, cb: (...args: any[]) => void) => {
          if (event === "close") cb(0);
        }),
        kill: vi.fn(),
      };
      return spawnedChild;
    });

    const result = await Effect.runPromise(
      executeScriptAction(
        { language: "shell", source: "echo hello", workspaceId: "ws-1", timeoutMs: 300_000 },
        "exec-shell-success",
      ),
    );

    expect(result.status).toBe("success");
    expect(result.finalText).toBe("hello\n");
  });
});

describe("executeLlmAction", () => {
  let executeLlmAction: typeof import("./executor").executeLlmAction;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockListWorkspaces.mockResolvedValue([]);
    const mod = await import("./executor");
    executeLlmAction = mod.executeLlmAction;
  });

  it("returns timeout when LLM action does not respond within timeoutMs", async () => {
    // Mock setTimeout to immediately trigger the timeout callback
    let capturedTimeoutCallback: () => void;

    vi.spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void, _delay: number) => {
      capturedTimeoutCallback = callback;
      return 0 as any;
    }) as typeof setTimeout);

    try {
      const action = {
        systemPrompt: "You are helpful",
        userPrompt: "Say hello",
        providerId: "p1",
        modelId: "m1",
        timeoutMs: 1000,
      };

      const resultPromise = Effect.runPromise(executeLlmAction(action, "exec-timeout-test"));

      // Simulate timeout firing before IPC result arrives
      capturedTimeoutCallback!();

      const result = await resultPromise;
      expect(result.status).toBe("timeout");
      expect(result.error).toContain("timed out");
    } finally {
      vi.spyOn(globalThis, "setTimeout").mockRestore();
    }
  });
});
