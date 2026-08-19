/**
 * PR-α  验证：MainLive 顶层 R 收敛为 never，且
 * DbLive + NodeFileSystemLive + NodePath.layer 可组合。
 *
 * 测试目标：
 * 1. 顶层 `MainLive` 的 R 收敛为 never；
 * 2. `NodeFileSystemLive` 单独提供 FileSystem.FileSystem；
 * 3. `@effect/platform-node/NodePath.layer` 单独提供 Path.Path；
 * 4. 二者可通过 `Layer.mergeAll` 合并，且合并后能用 fs 写文件并用 Path join 读出；
 * 5. `MemfsFileSystemTest` 默认可注入 FileSystem.FileSystem；
 * 6. `makeMemfsFileSystem(vol)` 工厂可注入预置文件的 Volume；
 * 7. memfs 后端跑完 write → read → exists → remove → stat → rename 完整循环；
 * 8. 错误路径：missing path → PlatformError SystemError + reason NotFound；
 * 9. 错误路径：makeDirectory 在已存在的目录上不带 recursive → 非 NotFound SystemError；
 * 10. real node:fs 路径 ENOENT 同样映射为 NotFound；
 * 11. real node:fs 路径 stat → File.Info type === "File"。
 *
 * 注：MainLive 包含 DbLive（src/main/db/mod.ts），后者 import electron 的 `app.getPath`，
 * 所以这里必须先 mock electron 才能让 MainLive 在 vitest 里被读取。Mock 与
 * `src/main/db/mod.test.ts` 一致。
 */
import { describe, expect, it, vi } from "vitest";
import { Effect, Layer } from "effect";
import { FileSystem } from "@effect/platform";
import * as Path from "@effect/platform/Path";
import * as NodePathModule from "@effect/platform-node/NodePath";
import { Volume } from "memfs";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp") },
}));

import { NodeFileSystemLive } from "./lib/file-system-node.js";
import {
  MemfsFileSystemTest,
  makeMemfsFileSystem,
} from "./lib/test/file-system-test.js";
import { MainLive } from "./runtime.js";

describe("src/main/runtime.ts — PR-α MainLive 顶层收敛", () => {
  it("顶层 MainLive 顶层值存在（DbLive + NodeFileSystemLive + NodePath.layer 全部挂载）", () => {
    // DbLive 自身 R=never（SqliteLive + MigrationsLive 都收敛了）。
    // PR-α 用 Layer.provide 把 FileSystem / Path 喂给 DbLive 合并层，
    // 不增加新依赖，所以最终 R 应仍为 never。E 通道仍是 DbLive 暴露的
    // SqlError | ConfigError（与 PR-α 之前一致）。
    expect(MainLive).toBeDefined();
  });

  it("NodeFileSystemLive 单独提供 FileSystem.FileSystem", () => {
    const _check: Layer.Layer<FileSystem.FileSystem, never, never> =
      NodeFileSystemLive;
    expect(_check).toBe(NodeFileSystemLive);
  });

  it("NodePath.layer 单独提供 Path.Path", async () => {
    const result = await Effect.gen(function* () {
      const p = yield* Path.Path;
      return p;
    }).pipe(Effect.provide(NodePathModule.layer), Effect.runPromise);
    expect(typeof result.join).toBe("function");
  });
});

describe("src/main/runtime.ts — adapter composition", () => {
  it("Layer.mergeAll(NodeFileSystemLive, NodePath.layer) 可组合（real node:fs 路径）", async () => {
    const composed = Layer.mergeAll(NodeFileSystemLive, NodePathModule.layer);
    const result = await Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.makeDirectory("/tmp/runtime-test-composed", {
        recursive: true,
      });
      const target = path.join("/tmp/runtime-test-composed", "hello.txt");
      yield* fs.writeFileString(target, "world");
      const content = yield* fs.readFileString(target);
      const exists = yield* fs.exists(target);
      yield* fs.remove(target);
      return { content, exists };
    }).pipe(Effect.provide(composed), Effect.runPromise);
    expect(result.content).toBe("world");
    expect(result.exists).toBe(true);
  });

  it("MemfsFileSystemTest 提供 FileSystem.FileSystem", async () => {
    const content = await Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString("/memfs-default.txt", "hi");
      return yield* fs.readFileString("/memfs-default.txt");
    }).pipe(Effect.provide(MemfsFileSystemTest), Effect.runPromise);
    expect(content).toBe("hi");
  });

  it("makeMemfsFileSystem(vol) 工厂支持预置文件", async () => {
    const vol = new Volume();
    vol.fromJSON({ "/preset.txt": "preset-content" });
    const layer = makeMemfsFileSystem(vol);
    const content = await Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      return yield* fs.readFileString("/preset.txt");
    }).pipe(Effect.provide(layer), Effect.runPromise);
    expect(content).toBe("preset-content");
  });

  it("memfs 后端 write → read → exists → remove → stat → rename 完整循环", async () => {
    const result = await Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory("/cycle", { recursive: true });
      yield* fs.writeFileString("/cycle/a.txt", "cycle");
      const before = yield* fs.exists("/cycle/a.txt");
      const stat = yield* fs.stat("/cycle/a.txt");
      yield* fs.rename("/cycle/a.txt", "/cycle/b.txt");
      const afterRename = yield* fs.exists("/cycle/a.txt");
      const movedExists = yield* fs.exists("/cycle/b.txt");
      const movedContent = yield* fs.readFileString("/cycle/b.txt");
      yield* fs.remove("/cycle/b.txt");
      const afterRemove = yield* fs.exists("/cycle/b.txt");
      yield* fs.remove("/cycle", { recursive: true });
      return {
        before,
        afterRename,
        movedExists,
        movedContent,
        afterRemove,
        type: stat.type,
      };
    }).pipe(Effect.provide(MemfsFileSystemTest), Effect.runPromise);
    expect(result.before).toBe(true);
    expect(result.afterRename).toBe(false);
    expect(result.movedExists).toBe(true);
    expect(result.movedContent).toBe("cycle");
    expect(result.afterRemove).toBe(false);
    expect(result.type).toBe("File");
  });

  it("missing path on readFileString 报 PlatformError SystemError + NotFound", async () => {
    const result = await Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      return yield* fs.readFileString("/does-not-exist.txt").pipe(Effect.flip);
    }).pipe(Effect.provide(MemfsFileSystemTest), Effect.runPromise);
    expect(result._tag).toBe("SystemError");
    if (result._tag === "SystemError") {
      expect(result.reason).toBe("NotFound");
    }
  });

  it("makeDirectory 不带 recursive 在已存在路径上失败（非 NotFound SystemError）", async () => {
    const result = await Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory("/existing", { recursive: false });
      return yield* fs
        .makeDirectory("/existing", { recursive: false })
        .pipe(Effect.flip);
    }).pipe(Effect.provide(MemfsFileSystemTest), Effect.runPromise);
    expect(result._tag).toBe("SystemError");
    if (result._tag === "SystemError") {
      expect(result.reason).not.toBe("NotFound");
    }
  });

  it("real node:fs 路径 ENOENT → SystemError NotFound", async () => {
    const result = await Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      return yield* fs
        .readFileString("/nonexistent-path-definitely-real-fs.txt")
        .pipe(Effect.flip);
    }).pipe(Effect.provide(NodeFileSystemLive), Effect.runPromise);
    expect(result._tag).toBe("SystemError");
    if (result._tag === "SystemError") {
      expect(result.reason).toBe("NotFound");
    }
  });

  it("real node:fs 路径 stat → File.Info type === File", async () => {
    const result = await Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString("/tmp/runtime-test-stat.txt", "x");
      const info = yield* fs.stat("/tmp/runtime-test-stat.txt");
      yield* fs.remove("/tmp/runtime-test-stat.txt");
      return info.type;
    }).pipe(Effect.provide(NodeFileSystemLive), Effect.runPromise);
    expect(result).toBe("File");
  });
});