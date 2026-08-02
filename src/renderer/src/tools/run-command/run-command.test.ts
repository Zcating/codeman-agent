import { describe, it, expect, beforeEach } from "vitest";
import { runCommandTool } from "@codeman-frontend/tools/run-command/run-command";
import { mockState } from "@codeman-frontend/__mocks__/ipc-mock";

interface TextContent { type: "text"; text: string }

describe("runCommandTool", () => {
  beforeEach(() => {
    mockState.calls.length = 0;
    mockState.invokeCalls.length = 0;
    mockState.resolved = undefined;
    mockState.rejected = undefined;
  });

  it("formats successful command result correctly", async () => {
    mockState.resolved = { status: "ok", exitCode: 0, stdout: "hi\n", stderr: "", durationMs: 100 };
    const result = await runCommandTool.execute("t1", { command: "echo hi" });
    expect((result.content[0] as TextContent).text).toContain("Exit code: 0");
    expect((result.content[0] as TextContent).text).toContain("hi");
    expect((result.details as { status: string }).status).toBe("ok");
  });

  it("formats error result correctly", async () => {
    mockState.resolved = { status: "error", error: { kind: "PermissionDenied", message: "denied" } };
    const result = await runCommandTool.execute("t2", { command: "echo hi" });
    expect((result.content[0] as TextContent).text).toContain("PermissionDenied");
    expect((result.content[0] as TextContent).text).toContain("denied");
  });

  it("passes command/cwd/timeoutMs via IPC invoke", async () => {
    mockState.resolved = { status: "ok", exitCode: 0, stdout: "", stderr: "", durationMs: 0 };
    await runCommandTool.execute("t3", { command: "git status", cwd: "/work", timeoutMs: 1000 });
    const call = mockState.invokeCalls.find((c) => c.name === "runCommand");
    expect(call).toBeDefined();
    expect(call!.args).toMatchObject({ command: "git status", cwd: "/work", timeoutMs: 1000 });
  });
});
