/**
 * file-ops/ipc.test.ts
 *
 * - vi.mock("./data") 后测 handler wiring
 * - 保留 applyEdit 纯函数测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted mocks are evaluated at module evaluation time, before vi.mock hoisting
const { mockIpcMain, mockFileSandbox, mockNodeFs, mockGetWorkspaceById } = vi.hoisted(
  () => ({
    mockIpcMain: { handle: vi.fn() },
    mockFileSandbox: {
      validatePathInWorkspace: vi.fn(),
      readFileInWorkspace: vi.fn(),
      writeFileInWorkspace: vi.fn(),
    },
    mockNodeFs: {
      readFile: vi.fn(),
      unlink: vi.fn(),
      readdir: vi.fn(),
      stat: vi.fn(),
    },
    mockGetWorkspaceById: vi.fn(() => Promise.reject(new Error("not found"))),
  })
);

vi.mock("electron", () => ({ ipcMain: mockIpcMain }));
vi.mock("../../file-sandbox.js", () => mockFileSandbox);
vi.mock("node:fs/promises", () => mockNodeFs);
vi.mock("./data.js", () => ({
  getWorkspaceById: mockGetWorkspaceById,
}));
vi.mock("../../runtime.js", () => ({
  runMain: vi.fn((effect) => effect as unknown as Promise<unknown>),
}));

import { registerFileOpsIpc, applyEdit } from "./ipc.js";

function register(): void {
  registerFileOpsIpc();
}

beforeEach(() => {
  mockIpcMain.handle.mockReset();
  mockFileSandbox.validatePathInWorkspace.mockReset();
  mockFileSandbox.readFileInWorkspace.mockReset();
  mockFileSandbox.writeFileInWorkspace.mockReset();
  mockNodeFs.readFile.mockReset();
  mockNodeFs.unlink.mockReset();
  mockNodeFs.readdir.mockReset();
  mockNodeFs.stat.mockReset();
  mockGetWorkspaceById.mockReset().mockRejectedValue(new Error("not found"));
});

describe("registerFileOpsIpc", () => {
  it("registers expected channels", () => {
    register();
    const channels = mockIpcMain.handle.mock.calls.map((c) => c[0]);
    expect(channels).toContain("readFile");
  });
});

describe("applyEdit", () => {
  it("returns ok when oldText is found", () => {
    const result = applyEdit("hello world", "hello", "world", false, "foo.txt");
    expect(result.kind).toBe("ok");
  });

  it("returns notFound when oldText is missing", () => {
    const result = applyEdit("foo bar", "hello", "world", false, "foo.txt");
    expect(result.kind).toBe("notFound");
  });

  it("returns ambiguous when multiple matches and replaceAll=false", () => {
    const result = applyEdit("hello hello", "hello", "world", false, "foo.txt");
    expect(result.kind).toBe("ambiguous");
  });
});
