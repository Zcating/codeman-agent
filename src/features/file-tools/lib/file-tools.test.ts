//! File Tools — AgentTool 测试（T11-T15）。
//!
//! 测试 5 个工具的 happy path 和 error path。
//! 使用 mockState（src/__mocks__/@tauri-apps/api/core.ts）mock IPC invoke。

import { describe, it, expect, beforeEach } from "vitest";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { TSchema } from "@sinclair/typebox";
import {
  readFileTool,
  writeFileTool,
  editFileTool,
  searchFilesTool,
  deleteFileTool,
  fileTools,
  createFileTools,
} from "./file-tools";
import { mockState } from "../../../__mocks__/ipc-mock";
import {
  NotFound,
  SandboxViolation,
  Unknown,
} from "../../../shared/lib/errors";

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
      workspaceId: "ws1",
      path: "/tmp/x.txt",
    });

    expect(result.details).toBe("hello world");
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("hello world"),
    });
    expect(mockState.invokeCalls.find((c) => c.name === "readFile")).toMatchObject({
      args: { workspaceId: "ws1", path: "/tmp/x.txt" },
    });
  });

  it("error path returns SandboxViolation as error string", async () => {
    mockState.rejected = new SandboxViolation({
      path: "/etc/x",
      workspaceLabel: "ws1",
    });

    const result = await readFileTool.execute("c1", {
      workspaceId: "ws1",
      path: "/etc/x",
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("SandboxViolation"),
    });
  });

  it("error path returns NotFound as error string", async () => {
    mockState.rejected = new NotFound({
      message: "File not found: /tmp/nonexistent.txt",
    });

    const result = await readFileTool.execute("c1", {
      workspaceId: "ws1",
      path: "/tmp/nonexistent.txt",
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("File not found"),
    });
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
      workspaceId: "ws1",
      path: "/tmp/new.txt",
      content: "file content here",
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Done"),
    });
    expect(mockState.invokeCalls.find((c) => c.name === "writeFile")).toMatchObject({
      args: { workspaceId: "ws1", path: "/tmp/new.txt", content: "file content here" },
    });
  });

  it("error path returns SandboxViolation", async () => {
    mockState.rejected = new SandboxViolation({
      path: "/etc/x",
      workspaceLabel: "ws1",
    });

    const result = await writeFileTool.execute("c1", {
      workspaceId: "ws1",
      path: "/etc/x",
      content: "bad",
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("SandboxViolation"),
    });
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
      workspaceId: "ws1",
      path: "/tmp/x.txt",
      oldText: "foo",
      newText: "bar",
      replaceAll: false,
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Done"),
    });
    expect(mockState.invokeCalls.find((c) => c.name === "editFile")).toMatchObject({
      args: {
        workspaceId: "ws1",
        path: "/tmp/x.txt",
        oldText: "foo",
        newText: "bar",
        replaceAll: false,
      },
    });
  });

  it("replaceAll returns correct message", async () => {
    mockState.resolved = undefined;

    const result = await editFileTool.execute("c1", {
      workspaceId: "ws1",
      path: "/tmp/x.txt",
      oldText: "foo",
      newText: "bar",
      replaceAll: true,
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("all occurrences replaced"),
    });
  });

  it("error path when oldText matches multiple times", async () => {
    mockState.rejected = new Unknown({
      message: "oldText must match exactly once (got 2)",
    });

    const result = await editFileTool.execute("c1", {
      workspaceId: "ws1",
      path: "/tmp/x.txt",
      oldText: "foo",
      newText: "bar",
      replaceAll: false,
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
      { path: "src/main.ts", lineNumber: 10, lineContent: "TODO: fix" },
      { path: "src/main.ts", lineNumber: 42, lineContent: "TODO: test" },
    ];

    const result = await searchFilesTool.execute("c1", {
      workspaceId: "ws1",
      glob: "**/*.ts",
      contentPattern: "TODO",
    });

    expect(result.details).toHaveLength(2);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Found 2 match(es)"),
    });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("src/main.ts10 - TODO: fix"),
    });
    expect(mockState.invokeCalls.find((c) => c.name === "searchFiles")).toMatchObject({
      args: { workspaceId: "ws1", glob: "**/*.ts", contentPattern: "TODO" },
    });
  });

  it("happy path with no contentPattern (glob only)", async () => {
    mockState.resolved = [{ path: "src/main.ts", lineNumber: null, lineContent: null }];

    const result = await searchFilesTool.execute("c1", {
      workspaceId: "ws1",
      glob: "**/*.ts",
    });

    expect(result.details).toHaveLength(1);
    expect(mockState.invokeCalls.find((c) => c.name === "searchFiles")).toMatchObject({
      args: { workspaceId: "ws1", glob: "**/*.ts", contentPattern: null },
    });
  });

  it("happy path returns empty array", async () => {
    mockState.resolved = [];

    const result = await searchFilesTool.execute("c1", {
      workspaceId: "ws1",
      glob: "**/*.ts",
      contentPattern: "NOTFOUND",
    });

    expect(result.details).toEqual([]);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("No matches found"),
    });
  });

  it("error path returns SandboxViolation", async () => {
    mockState.rejected = new SandboxViolation({
      path: "/etc",
      workspaceLabel: "ws1",
    });

    const result = await searchFilesTool.execute("c1", {
      workspaceId: "ws1",
      glob: "/etc/**/*.txt",
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("SandboxViolation"),
    });
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
      workspaceId: "ws1",
      path: "/tmp/old.txt",
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("recycle bin"),
    });
    expect(mockState.invokeCalls.find((c) => c.name === "deleteFile")).toMatchObject({
      args: { workspaceId: "ws1", path: "/tmp/old.txt" },
    });
  });

  it("error path returns SandboxViolation", async () => {
    mockState.rejected = new SandboxViolation({
      path: "/etc/passwd",
      workspaceLabel: "ws1",
    });

    const result = await deleteFileTool.execute("c1", {
      workspaceId: "ws1",
      path: "/etc/passwd",
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("SandboxViolation"),
    });
  });

  it("error path for blocked extension returns clear error", async () => {
    mockState.rejected = new Unknown({
      message: "Blocked file type: .exe",
    });

    const result = await deleteFileTool.execute("c1", {
      workspaceId: "ws1",
      path: "malware.exe",
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Blocked file type: .exe"),
    });
  });
});

// Task 4 (Phase-3 review Hard #1 + J3): single workspaceId field constant.
// Proves the constant is exported and round-trips for both present and absent
// values (i.e., is genuinely optional).
//
// Note: `Schema.optional(...)` returns a PropertySignature, which is only
// decodable inside a `Schema.Struct({...})`. So each test wraps the field in
// a one-key Struct to mirror how the 5 tool schemas consume it.
//
// ADR-0013.1: workspaceId is the camelCase single source of truth; the previous
// `workspace_id` snake_case wrap is removed.
import { Schema } from "effect";
import { workspaceIdField } from "./file-tools";

const wrap = Schema.Struct({ workspaceId: workspaceIdField });

describe("workspaceIdField — single source of truth (Phase-3 review + ADR-0013.1)", () => {
  it("decodeUnknown: present string value parses Right", () => {
    const out = Schema.decodeUnknownEither(wrap)({ workspaceId: "ws-1" });
    expect(out._tag).toBe("Right");
    if (out._tag === "Right") expect(out.right.workspaceId).toBe("ws-1");
  });

  it("decodeUnknown: missing key parses Right (proves field is optional)", () => {
    const out = Schema.decodeUnknownEither(wrap)({});
    expect(out._tag).toBe("Right");
  });

  it("decodeUnknown: explicit undefined parses Right", () => {
    const out = Schema.decodeUnknownEither(wrap)({ workspaceId: undefined });
    expect(out._tag).toBe("Right");
  });

  it("decodeUnknown: numeric workspaceId parses Left (proves field is string)", () => {
    const out = Schema.decodeUnknownEither(wrap)({ workspaceId: 42 });
    expect(out._tag).toBe("Left");
  });
});

// Task 8 (Phase-3 review J2): `fileTools` and `createFileTools` return type must
// be `AgentTool<TSchema, unknown>[]` (NOT `AgentTool<any, any>[]`).
// This is a compile-time check using a type alias that fails loudly if reverted.
describe("fileTools / createFileTools array type (ADR-0025 review J2)", () => {
  it("returns AgentTool<TSchema, unknown>[] — never 'any'", () => {
    type IsAny<T> = 0 extends 1 & T ? true : false;
    type IsExactTSchema<T> = IsAny<T> extends true
      ? false
      : [T] extends [TSchema]
        ? [TSchema] extends [T]
          ? true
          : false
        : false;
    type IsExactUnknown<T> = IsAny<T> extends true
      ? false
      : unknown extends T
        ? [T] extends [unknown]
          ? true
          : false
        : false;
    type IsExpectedToolArray<T> = T extends AgentTool<infer TParameters, infer TResult>[]
      ? IsExactTSchema<TParameters> extends true
        ? IsExactUnknown<TResult>
        : false
      : false;
    type ExpectTrue<T extends true> = T;
    type FileToolsTypeCheck = ExpectTrue<IsExpectedToolArray<typeof fileTools>>;
    type CreatedToolsTypeCheck = ExpectTrue<IsExpectedToolArray<ReturnType<typeof createFileTools>>>;
    const _check: FileToolsTypeCheck = true;
    const _check2: CreatedToolsTypeCheck = true;
    expect(_check).toBe(true);
    expect(_check2).toBe(true);
  });
});
