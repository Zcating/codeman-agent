/**
 * src/main/file-sandbox.test.ts
 *
 * PR-β : 测试改为 it.layer(TestLayer) + Effect.gen，注入
 * NodeFileSystemLive + NodePath.layer 而非直调 node:fs/promises。
 *
 * 用 it.layer 把 TestLayer 注入到所有嵌套 it.effect 中，自动提供
 * FileSystem.FileSystem + Path.Path。callback 参数命名为 $it 避免与
 * 全局 `it` 冲突。
 *
 * 测试场景：
 * 1-3. validatePathInWorkspace happy path（文件 / 嵌套文件 / workspace 根）
 * 4-5. ENOENT → AppBackendError.NotFound（validatePathInWorkspace + validatePathForWrite 父目录）
 * 6-7. sandbox violation（父目录外 / ../ 逃逸）→ SandboxViolation
 * 8-9. blocked patterns（Windows long-path prefix / NTFS alternate data stream）→ SandboxViolation
 * 10. readFileInWorkspace — 读 UTF-8
 * 11. writeFileInWorkspace — 原子写 + 验证
 * 12. writeFileInWorkspace — 成功路径无残留 .tmp 文件
 */
import { tmpdir } from "node:os";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as NodePathModule from "@effect/platform-node/NodePath";
import {
  readFileInWorkspace,
  validatePathForWrite,
  validatePathInWorkspace,
  writeFileInWorkspace,
} from "./file-sandbox.js";
import { NodeFileSystemLive } from "./lib/file-system-node.js";

const TestLayer = Layer.mergeAll(NodeFileSystemLive, NodePathModule.layer);

const makeWorkspace = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const pathSvc = yield* Path.Path;
  const dir = pathSvc.join(
    tmpdir(),
    `fs-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  yield* fs.makeDirectory(dir, { recursive: true });
  return dir;
});

const cleanupWorkspace = (workspace: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.remove(workspace, { recursive: true, force: true }).pipe(Effect.ignore);
  });

describe("file-sandbox", () => {
  it.layer(TestLayer)("happy path", ($it) => {
    $it.effect("accepts a file inside the workspace", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const pathSvc = yield* Path.Path;
        const workspace = yield* makeWorkspace;
        const file = pathSvc.join(workspace, "hello.txt");
        yield* fs.writeFileString(file, "world");
        const abs = yield* validatePathInWorkspace(file, workspace);
        expect(abs).toBe(file);
        yield* cleanupWorkspace(workspace);
      }),
    );

    $it.effect("accepts a nested file inside the workspace", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const pathSvc = yield* Path.Path;
        const workspace = yield* makeWorkspace;
        const dir = pathSvc.join(workspace, "sub", "deep");
        yield* fs.makeDirectory(dir, { recursive: true });
        const file = pathSvc.join(dir, "file.txt");
        yield* fs.writeFileString(file, "x");
        const abs = yield* validatePathInWorkspace(file, workspace);
        expect(abs).toBe(file);
        yield* cleanupWorkspace(workspace);
      }),
    );

    $it.effect("accepts the workspace root itself", () =>
      Effect.gen(function* () {
        const workspace = yield* makeWorkspace;
        const abs = yield* validatePathInWorkspace(workspace, workspace);
        expect(abs).toBe(workspace);
        yield* cleanupWorkspace(workspace);
      }),
    );
  });

  it.layer(TestLayer)("ENOENT", ($it) => {
    $it.effect(
      "validatePathInWorkspace returns NotFound for non-existent path",
      () =>
        Effect.gen(function* () {
          const pathSvc = yield* Path.Path;
          const workspace = yield* makeWorkspace;
          const missing = pathSvc.join(workspace, "does-not-exist.txt");
          const failure = yield* validatePathInWorkspace(missing, workspace).pipe(
            Effect.flip,
          );
          expect(failure._tag).toBe("NotFound");
          if (failure._tag === "NotFound") {
            expect(failure.path).toBe(missing);
          }
          yield* cleanupWorkspace(workspace);
        }),
    );

    $it.effect(
      "validatePathForWrite returns NotFound when parent dir missing",
      () =>
        Effect.gen(function* () {
          const pathSvc = yield* Path.Path;
          const workspace = yield* makeWorkspace;
          const missingDir = pathSvc.join(workspace, "no-such-dir", "child.txt");
          const failure = yield* validatePathForWrite(missingDir, workspace).pipe(
            Effect.flip,
          );
          expect(failure._tag).toBe("NotFound");
          yield* cleanupWorkspace(workspace);
        }),
    );
  });

  it.layer(TestLayer)("sandbox violation", ($it) => {
    $it.effect("rejects path outside workspace (parent dir)", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const pathSvc = yield* Path.Path;
        const workspace = yield* makeWorkspace;
        const otherDir = pathSvc.join(
          tmpdir(),
          `fs-other-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        );
        yield* fs.makeDirectory(otherDir, { recursive: true });
        const file = pathSvc.join(otherDir, "secret.txt");
        yield* fs.writeFileString(file, "leak");
        const failure = yield* validatePathInWorkspace(file, workspace).pipe(
          Effect.flip,
        );
        expect(failure._tag).toBe("SandboxViolation");
        yield* cleanupWorkspace(workspace);
        yield* cleanupWorkspace(otherDir);
      }),
    );

    $it.effect("rejects path that escapes via ../", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const pathSvc = yield* Path.Path;
        const workspace = yield* makeWorkspace;
        const escapeFile = pathSvc.join(workspace, "..", "escape.txt");
        yield* fs.writeFileString(escapeFile, "leak");
        const failure = yield* validatePathInWorkspace(escapeFile, workspace).pipe(
          Effect.flip,
        );
        expect(failure._tag).toBe("SandboxViolation");
        yield* cleanupWorkspace(workspace);
        yield* cleanupWorkspace(pathSvc.dirname(escapeFile));
      }),
    );
  });

  it.layer(TestLayer)("blocked patterns", ($it) => {
    $it.effect(
      "rejects Windows long-path prefix as SandboxViolation",
      () =>
        Effect.gen(function* () {
          const workspace = yield* makeWorkspace;
          const failure = yield* validatePathInWorkspace(
            "\\\\?\\C:\\foo",
            workspace,
          ).pipe(Effect.flip);
          expect(failure._tag).toBe("SandboxViolation");
          if (failure._tag === "SandboxViolation") {
            expect(failure.message).toMatch(
              /long-path|alternate data stream|not allowed/i,
            );
          }
          yield* cleanupWorkspace(workspace);
        }),
    );

    $it.effect(
      "rejects NTFS alternate data stream as SandboxViolation",
      () =>
        Effect.gen(function* () {
          const workspace = yield* makeWorkspace;
          const failure = yield* validatePathInWorkspace(
            "C:\\file.txt::data",
            workspace,
          ).pipe(Effect.flip);
          expect(failure._tag).toBe("SandboxViolation");
          if (failure._tag === "SandboxViolation") {
            expect(failure.message).toMatch(
              /long-path|alternate data stream|not allowed/i,
            );
          }
          yield* cleanupWorkspace(workspace);
        }),
    );
  });

  it.layer(TestLayer)("readFileInWorkspace + writeFileInWorkspace", ($it) => {
    $it.effect("readFileInWorkspace reads UTF-8 content", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const pathSvc = yield* Path.Path;
        const workspace = yield* makeWorkspace;
        const file = pathSvc.join(workspace, "data.txt");
        yield* fs.writeFileString(file, "hello world");
        const content = yield* readFileInWorkspace(workspace, file);
        expect(content).toBe("hello world");
        yield* cleanupWorkspace(workspace);
      }),
    );

    $it.effect("writeFileInWorkspace writes UTF-8 content", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const pathSvc = yield* Path.Path;
        const workspace = yield* makeWorkspace;
        const file = pathSvc.join(workspace, "out.txt");
        yield* writeFileInWorkspace(workspace, file, "written");
        const content = yield* fs.readFileString(file);
        expect(content).toBe("written");
        yield* cleanupWorkspace(workspace);
      }),
    );

    $it.effect("atomic write — no leftover .tmp files after success", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const pathSvc = yield* Path.Path;
        const workspace = yield* makeWorkspace;
        const file = pathSvc.join(workspace, "atomic.txt");
        yield* writeFileInWorkspace(workspace, file, "atomic-content");
        const entries = yield* fs.readDirectory(workspace);
        const tmps = entries.filter((e) => e.includes(".tmp."));
        expect(tmps.length).toBe(0);
        yield* cleanupWorkspace(workspace);
      }),
    );
  });
});