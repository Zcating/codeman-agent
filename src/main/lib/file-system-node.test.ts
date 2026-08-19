// PR-α  — file-system-node 测试
// 用真实临时目录 + @effect/vitest 的 it.effect；不 mock node:fs/promises。
import { describe, it, expect, beforeEach, afterEach } from "@effect/vitest";
import { Effect } from "effect";
import * as FileSystem from "@effect/platform/FileSystem";
import { mkdtempSync, rmSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFileSystemLive } from "./file-system-node";

let workspace: string;

const provideFs = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem>,
): Effect.Effect<A, E, never> =>
  effect.pipe(Effect.provide(NodeFileSystemLive));

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "fs-node-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("NodeFileSystemLive", () => {
  it.effect("writeFileString then readFileString round-trips", () =>
    provideFs(
      Effect.gen(function* () {
        const svc = yield* FileSystem.FileSystem;
        const file = join(workspace, "roundtrip.txt");
        yield* svc.writeFileString(file, "hello world");
        expect(yield* svc.readFileString(file)).toBe("hello world");
      }),
    ),
  );

  it.effect("exists returns true after makeDirectory({recursive: true})", () =>
    provideFs(
      Effect.gen(function* () {
        const svc = yield* FileSystem.FileSystem;
        const nested = join(workspace, "a", "b", "c");
        yield* svc.makeDirectory(nested, { recursive: true });
        expect(yield* svc.exists(nested)).toBe(true);
      }),
    ),
  );

  it.effect("exists returns false for a missing path", () =>
    provideFs(
      Effect.gen(function* () {
        const svc = yield* FileSystem.FileSystem;
        expect(yield* svc.exists(join(workspace, "missing.txt"))).toBe(false);
      }),
    ),
  );

  it.effect("readDirectory returns a string array", () =>
    provideFs(
      Effect.gen(function* () {
        const svc = yield* FileSystem.FileSystem;
        yield* svc.writeFileString(join(workspace, "alpha.txt"), "a");
        yield* svc.writeFileString(join(workspace, "beta.txt"), "b");
        const entries = yield* svc.readDirectory(workspace);
        expect(Array.isArray(entries)).toBe(true);
        expect([...entries].sort()).toEqual(["alpha.txt", "beta.txt"]);
      }),
    ),
  );

  it.effect("stat reports File for a file and Directory for a directory", () =>
    provideFs(
      Effect.gen(function* () {
        const svc = yield* FileSystem.FileSystem;
        const file = join(workspace, "stat.txt");
        yield* svc.writeFileString(file, "x");
        const fileInfo = yield* svc.stat(file);
        expect(fileInfo.type).toBe("File");
        expect(fileInfo.size).toBe(BigInt(1));
        const dirInfo = yield* svc.stat(workspace);
        expect(dirInfo.type).toBe("Directory");
      }),
    ),
  );

  it.effect("readFileString of a missing path fails with SystemError NotFound", () =>
    provideFs(
      Effect.gen(function* () {
        const svc = yield* FileSystem.FileSystem;
        const failure = yield* svc
          .readFileString(join(workspace, "nope.txt"))
          .pipe(Effect.flip);
        expect(failure._tag).toBe("SystemError");
        if (failure._tag === "SystemError") {
          expect(failure.reason).toBe("NotFound");
        }
      }),
    ),
  );

  it.effect("non-ENOENT errors map to a non-NotFound SystemError", () =>
    provideFs(
      Effect.gen(function* () {
        const svc = yield* FileSystem.FileSystem;
        const failure = yield* svc.readFileString(workspace).pipe(Effect.flip);
        expect(failure._tag).toBe("SystemError");
        if (failure._tag === "SystemError") {
          expect(failure.reason).not.toBe("NotFound");
        }
      }),
    ),
  );

  it.effect("unimplemented chmod fails with BadArgument", () =>
    provideFs(
      Effect.gen(function* () {
        const svc = yield* FileSystem.FileSystem;
        const failure = yield* svc.chmod(join(workspace, "x"), 0o644).pipe(
          Effect.flip,
        );
        expect(failure._tag).toBe("BadArgument");
        if (failure._tag === "BadArgument") {
          expect(failure.message).toBe("Not implemented: chmod");
        }
      }),
    ),
  );

  it.effect("realPath resolves a symlink to the target path", () =>
    provideFs(
      Effect.gen(function* () {
        const svc = yield* FileSystem.FileSystem;
        const targetDir = join(workspace, "target-dir");
        yield* svc.makeDirectory(targetDir);
        const link = join(workspace, "link");
        const created = yield* Effect.sync(() => {
          try {
            symlinkSync(
              targetDir,
              link,
              process.platform === "win32" ? "junction" : "dir",
            );
            return true;
          } catch {
            return false;
          }
        });
        if (!created) {
          return;
        }
        const resolved = yield* svc.realPath(link);
        const expected = realpathSync(targetDir);
        if (process.platform === "win32") {
          expect(resolved.toLowerCase()).toBe(expected.toLowerCase());
        } else {
          expect(resolved).toBe(expected);
        }
      }),
    ),
  );

  it.effect("remove deletes a file and rename moves a file", () =>
    provideFs(
      Effect.gen(function* () {
        const svc = yield* FileSystem.FileSystem;
        const victim = join(workspace, "victim.txt");
        yield* svc.writeFileString(victim, "data");
        yield* svc.remove(victim);
        expect(yield* svc.exists(victim)).toBe(false);

        const src = join(workspace, "src.txt");
        const dst = join(workspace, "dst.txt");
        yield* svc.writeFileString(src, "payload");
        yield* svc.rename(src, dst);
        expect(yield* svc.exists(src)).toBe(false);
        expect(yield* svc.readFileString(dst)).toBe("payload");
      }),
    ),
  );

  it.effect("copyFile copies a file's contents", () =>
    provideFs(
      Effect.gen(function* () {
        const svc = yield* FileSystem.FileSystem;
        const src = join(workspace, "src.txt");
        const dst = join(workspace, "dst.txt");
        yield* svc.writeFileString(src, "copied-content");
        yield* svc.copyFile(src, dst);
        expect(yield* svc.readFileString(dst)).toBe("copied-content");
      }),
    ),
  );

  it.effect("writeFile with Uint8Array round-trips through readFile", () =>
    provideFs(
      Effect.gen(function* () {
        const svc = yield* FileSystem.FileSystem;
        const file = join(workspace, "bin.dat");
        const bytes = new TextEncoder().encode("byte-content");
        yield* svc.writeFile(file, bytes);
        const read = yield* svc.readFile(file);
        expect(new TextDecoder().decode(read)).toBe("byte-content");
      }),
    ),
  );
});
