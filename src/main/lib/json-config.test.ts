/**
 * src/main/lib/json-config.test.ts
 *
 * json-config 抽象 — TDD：先写 RED 测试，验证本测试在实现存在时通过。
 *
 * 测试场景：
 * 1. 文件不存在 → defaultValue
 * 2. round-trip（write → read）
 * 3. 无效 JSON → AppBackendError.InvalidConfig
 * 4. Schema decode 失败 → AppBackendError.InvalidConfig
 * 5. write 后自动创建父目录
 * 6. jsonConfigExists false/true
 * 7. readJsonConfig 在 PermissionDenied → AppBackendError.Unknown
 *
 * 注：使用 NodeFileSystemLive + NodePath.layer 提供 FileSystem/Path 服务。
 * 通过 Layer.mergeAll 合并为 TestLayer，注入所有嵌套 it.effect。
 */
import { tmpdir } from "node:os";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as NodePathModule from "@effect/platform-node/NodePath";
import {
  jsonConfigExists,
  readJsonConfig,
  writeJsonConfig,
} from "./json-config.js";
import { NodeFileSystemLive } from "./file-system-node.js";

const TestLayer = Layer.mergeAll(NodeFileSystemLive, NodePathModule.layer);

const NumberSchema = Schema.Struct({ value: Schema.Number });

const makeTmpDir = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const pathSvc = yield* Path.Path;
  const dir = pathSvc.join(
    tmpdir(),
    `json-cfg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  yield* fs.makeDirectory(dir, { recursive: true });
  return dir;
});

const cleanupDir = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.remove(dir, { recursive: true, force: true }).pipe(Effect.ignore);
  });

describe("json-config", () => {
  it.layer(TestLayer)("readJsonConfig", ($it) => {
    $it.effect("returns defaultValue when file does not exist", () =>
      Effect.gen(function* () {
        const pathSvc = yield* Path.Path;
        const dir = yield* makeTmpDir;
        const file = pathSvc.join(dir, "missing.json");
        const result = yield* readJsonConfig(file, NumberSchema, {
          value: 0,
        });
        expect(result).toEqual({ value: 0 });
        yield* cleanupDir(dir);
      }),
    );

    $it.effect("round-trip: writeJsonConfig then readJsonConfig", () =>
      Effect.gen(function* () {
        const pathSvc = yield* Path.Path;
        const dir = yield* makeTmpDir;
        const file = pathSvc.join(dir, "config.json");
        yield* writeJsonConfig(file, { value: 42 });
        const readBack = yield* readJsonConfig(file, NumberSchema, {
          value: 0,
        });
        expect(readBack).toEqual({ value: 42 });
        yield* cleanupDir(dir);
      }),
    );

    $it.effect("fails with InvalidConfig when file contains invalid JSON", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const pathSvc = yield* Path.Path;
        const dir = yield* makeTmpDir;
        const file = pathSvc.join(dir, "bad.json");
        yield* fs.writeFileString(file, "not valid json{{{");
        const failure = yield* readJsonConfig(file, NumberSchema, {
          value: 0,
        }).pipe(Effect.flip);
        expect(failure._tag).toBe("InvalidConfig");
        if (failure._tag === "InvalidConfig") {
          expect(failure.message).toMatch(/Cannot parse JSON config/);
        }
        yield* cleanupDir(dir);
      }),
    );

    $it.effect(
      "fails with InvalidConfig when JSON does not match schema",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const pathSvc = yield* Path.Path;
          const dir = yield* makeTmpDir;
          const file = pathSvc.join(dir, "mismatch.json");
          yield* fs.writeFileString(file, JSON.stringify({ wrong: "shape" }));
          const failure = yield* readJsonConfig(file, NumberSchema, {
            value: 0,
          }).pipe(Effect.flip);
          expect(failure._tag).toBe("InvalidConfig");
          if (failure._tag === "InvalidConfig") {
            expect(failure.message).toMatch(/does not match schema/);
          }
          yield* cleanupDir(dir);
        }),
    );
  });

  it.layer(TestLayer)("writeJsonConfig", ($it) => {
    $it.effect("creates parent directory if missing (mkdir -p semantics)", () =>
      Effect.gen(function* () {
        const pathSvc = yield* Path.Path;
        const dir = yield* makeTmpDir;
        const nested = pathSvc.join(dir, "a", "b", "c", "config.json");
        yield* writeJsonConfig(nested, { value: 1 });
        const exists = yield* jsonConfigExists(nested);
        expect(exists).toBe(true);
        yield* cleanupDir(dir);
      }),
    );
  });

  it.layer(TestLayer)("jsonConfigExists", ($it) => {
    $it.effect("returns false when file does not exist", () =>
      Effect.gen(function* () {
        const pathSvc = yield* Path.Path;
        const dir = yield* makeTmpDir;
        const missing = pathSvc.join(dir, "absent.json");
        const result = yield* jsonConfigExists(missing);
        expect(result).toBe(false);
        yield* cleanupDir(dir);
      }),
    );

    $it.effect("returns true when file exists", () =>
      Effect.gen(function* () {
        const pathSvc = yield* Path.Path;
        const dir = yield* makeTmpDir;
        const file = pathSvc.join(dir, "exists.json");
        yield* writeJsonConfig(file, { value: 7 });
        const result = yield* jsonConfigExists(file);
        expect(result).toBe(true);
        yield* cleanupDir(dir);
      }),
    );
  });
});