//! File Tools — AgentTool 测试（T11-T15）。
//!
//! 测试 5 个工具的 happy path 和 error path。
//! 使用 mockState（src/__mocks__/@tauri-apps/api/core.ts）mock IPC invoke。

import { describe, it, expect, beforeEach } from "vitest";
import {
  readFileTool,
  writeFileTool,
  editFileTool,
  searchFilesTool,
  deleteFileTool,
} from "./file-tools";
import { mockState } from "../../../__mocks__/ipc-mock";

describe("readFileTool", () => {
  beforeEach(() => {
    mockState.calls.length = 0;
    mockState.invokeCalls.length = 0;
    mockState.resolved = undefined;
    mockState.rejected = undefined;
  });

  it("happy path returns file content", async () => {
    mockState.resolved = "hello world";

    const result = await readFileTool.execute("c1", {
      workspace_id: "ws1",
      path: "/tmp/x.txt",
    });

    expect(result.details).toBe("hello world");
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("hello world"),
    });
    expect(mockState.invokeCalls.find((c) => c.name === "read_file")).toMatchObject({
      args: { workspaceId: "ws1", path: "/tmp/x.txt" },
    });
  });

  it("error path returns SandboxViolation as error string", async () => {
    mockState.rejected = {
      kind: "SandboxViolation",
      path: "/etc/x",
      workspace_label: "ws1",
    } as unknown as Error;

    const result = await readFileTool.execute("c1", {
      workspace_id: "ws1",
      path: "/etc/x",
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("SandboxViolation"),
    });
    expect(result.details).toMatchObject({ kind: "SandboxViolation" });
  });

  it("error path returns NotFound as error string", async () => {
    mockState.rejected = {
      kind: "NotFound",
      message: "File not found: /tmp/nonexistent.txt",
    } as unknown as Error;

    const result = await readFileTool.execute("c1", {
      workspace_id: "ws1",
      path: "/tmp/nonexistent.txt",
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("File not found"),
    });
    expect(result.details).toMatchObject({ kind: "NotFound" });
  });
});

describe("writeFileTool", () => {
  beforeEach(() => {
    mockState.calls.length = 0;
    mockState.invokeCalls.length = 0;
    mockState.resolved = undefined;
    mockState.rejected = undefined;
  });

  it("happy path returns void with success message", async () => {
    mockState.resolved = undefined; // write_file returns ()

    const result = await writeFileTool.execute("c1", {
      workspace_id: "ws1",
      path: "/tmp/new.txt",
      content: "file content here",
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Done"),
    });
    expect(mockState.invokeCalls.find((c) => c.name === "write_file")).toMatchObject({
      args: { workspaceId: "ws1", path: "/tmp/new.txt", content: "file content here" },
    });
  });

  it("error path returns SandboxViolation", async () => {
    mockState.rejected = {
      kind: "SandboxViolation",
      path: "/etc/x",
      workspace_label: "ws1",
    } as unknown as Error;

    const result = await writeFileTool.execute("c1", {
      workspace_id: "ws1",
      path: "/etc/x",
      content: "bad",
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("SandboxViolation"),
    });
    expect(result.details).toMatchObject({ kind: "SandboxViolation" });
  });
});

describe("editFileTool", () => {
  beforeEach(() => {
    mockState.calls.length = 0;
    mockState.invokeCalls.length = 0;
    mockState.resolved = undefined;
    mockState.rejected = undefined;
  });

  it("happy path unique replace returns success", async () => {
    mockState.resolved = undefined;

    const result = await editFileTool.execute("c1", {
      workspace_id: "ws1",
      path: "/tmp/x.txt",
      old_text: "foo",
      new_text: "bar",
      replace_all: false,
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Done"),
    });
    expect(mockState.invokeCalls.find((c) => c.name === "edit_file")).toMatchObject({
      args: {
        workspaceId: "ws1",
        path: "/tmp/x.txt",
        oldText: "foo",
        newText: "bar",
        replaceAll: false,
      },
    });
  });

  it("replace_all returns correct message", async () => {
    mockState.resolved = undefined;

    const result = await editFileTool.execute("c1", {
      workspace_id: "ws1",
      path: "/tmp/x.txt",
      old_text: "foo",
      new_text: "bar",
      replace_all: true,
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("all occurrences replaced"),
    });
  });

  it("error path when old_text matches multiple times", async () => {
    mockState.rejected = {
      kind: "Unknown",
      message: "old_text must match exactly once (got 2)",
    } as unknown as Error;

    const result = await editFileTool.execute("c1", {
      workspace_id: "ws1",
      path: "/tmp/x.txt",
      old_text: "foo",
      new_text: "bar",
      replace_all: false,
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("exactly once"),
    });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("got 2"),
    });
  });
});

describe("searchFilesTool", () => {
  beforeEach(() => {
    mockState.calls.length = 0;
    mockState.invokeCalls.length = 0;
    mockState.resolved = undefined;
    mockState.rejected = undefined;
  });

  it("happy path returns matches with line numbers", async () => {
    mockState.resolved = [
      { path: "src/main.ts", line_number: 10, line_content: "TODO: fix" },
      { path: "src/main.ts", line_number: 42, line_content: "TODO: test" },
    ];

    const result = await searchFilesTool.execute("c1", {
      workspace_id: "ws1",
      glob: "**/*.ts",
      content_pattern: "TODO",
    });

    expect(result.details).toHaveLength(2);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Found 2 match(es)"),
    });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("src/main.ts:10"),
    });
    expect(mockState.invokeCalls.find((c) => c.name === "search_files")).toMatchObject({
      args: { workspaceId: "ws1", glob: "**/*.ts", contentPattern: "TODO" },
    });
  });

  it("happy path with no content_pattern (glob only)", async () => {
    mockState.resolved = [{ path: "src/main.ts", line_number: null, line_content: null }];

    const result = await searchFilesTool.execute("c1", {
      workspace_id: "ws1",
      glob: "**/*.ts",
    });

    expect(result.details).toHaveLength(1);
    expect(mockState.invokeCalls.find((c) => c.name === "search_files")).toMatchObject({
      args: { workspaceId: "ws1", glob: "**/*.ts", contentPattern: null },
    });
  });

  it("happy path returns empty array", async () => {
    mockState.resolved = [];

    const result = await searchFilesTool.execute("c1", {
      workspace_id: "ws1",
      glob: "**/*.ts",
      content_pattern: "NOTFOUND",
    });

    expect(result.details).toEqual([]);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("No matches found"),
    });
  });

  it("error path returns SandboxViolation", async () => {
    mockState.rejected = {
      kind: "SandboxViolation",
      path: "/etc",
      workspace_label: "ws1",
    } as unknown as Error;

    const result = await searchFilesTool.execute("c1", {
      workspace_id: "ws1",
      glob: "/etc/**/*.txt",
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("SandboxViolation"),
    });
    expect(result.details).toMatchObject({ kind: "SandboxViolation" });
  });
});

describe("deleteFileTool", () => {
  beforeEach(() => {
    mockState.calls.length = 0;
    mockState.invokeCalls.length = 0;
    mockState.resolved = undefined;
    mockState.rejected = undefined;
  });

  it("happy path returns void with success message", async () => {
    mockState.resolved = undefined;

    const result = await deleteFileTool.execute("c1", {
      workspace_id: "ws1",
      path: "/tmp/old.txt",
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("recycle bin"),
    });
    expect(mockState.invokeCalls.find((c) => c.name === "delete_file")).toMatchObject({
      args: { workspaceId: "ws1", path: "/tmp/old.txt" },
    });
  });

  it("error path returns SandboxViolation", async () => {
    mockState.rejected = {
      kind: "SandboxViolation",
      path: "/etc/passwd",
      workspace_label: "ws1",
    } as unknown as Error;

    const result = await deleteFileTool.execute("c1", {
      workspace_id: "ws1",
      path: "/etc/passwd",
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("SandboxViolation"),
    });
    expect(result.details).toMatchObject({ kind: "SandboxViolation" });
  });

  it("error path for blocked extension returns clear error", async () => {
    mockState.rejected = {
      kind: "Unknown",
      message: "Blocked file type: .exe",
    } as unknown as Error;

    const result = await deleteFileTool.execute("c1", {
      workspace_id: "ws1",
      path: "malware.exe",
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Blocked file type: .exe"),
    });
    expect(result.details).toMatchObject({ kind: "Unknown" });
  });
});
