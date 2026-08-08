import { describe, it, expect } from "vitest";
import { Cause, Effect } from "effect";
import * as FileSystem from "@effect/platform/FileSystem";
import { Volume } from "memfs";

import { MemfsFileSystemTest, makeMemfsFileSystem } from "./file-system-test.js";

const run = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem>,
): Promise<A> => Effect.runPromise(Effect.provide(effect, MemfsFileSystemTest));

describe("src/main/lib/test/file-system-test.ts", () => {
  it("writeFileString round-trips through MemfsFileSystemTest", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString("/hello.txt", "hello world");
        return yield* fs.readFileString("/hello.txt");
      }),
    );
    expect(result).toBe("hello world");
  });

  it("exists returns true for a written file and false for a missing one", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString("/present.txt", "x");
        const present = yield* fs.exists("/present.txt");
        const missing = yield* fs.exists("/absent.txt");
        return { present, missing };
      }),
    );
    expect(result.present).toBe(true);
    expect(result.missing).toBe(false);
  });

  it("makeDirectory with recursive creates nested directories", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory("/a/b/c", { recursive: true });
        return yield* fs.exists("/a/b/c");
      }),
    );
    expect(result).toBe(true);
  });

  it("readDirectory returns the entries of a directory", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory("/dir", { recursive: true });
        yield* fs.writeFileString("/dir/one.txt", "1");
        yield* fs.writeFileString("/dir/two.txt", "2");
        yield* fs.makeDirectory("/dir/sub", { recursive: true });
        return yield* fs.readDirectory("/dir");
      }),
    );
    expect([...result].sort()).toEqual(["one.txt", "sub", "two.txt"]);
  });

  it("remove and rename mutate the file system", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString("/src.txt", "content");
        yield* fs.rename("/src.txt", "/dst.txt");
        const afterRename = yield* fs.readFileString("/dst.txt");
        yield* fs.remove("/dst.txt");
        const afterRemove = yield* fs.exists("/dst.txt");
        return { afterRename, afterRemove };
      }),
    );
    expect(result.afterRename).toBe("content");
    expect(result.afterRemove).toBe(false);
  });

  it("makeMemfsFileSystem wraps a caller-supplied pre-seeded volume", async () => {
    const vol = new Volume();
    vol.fromJSON({ "/foo.txt": "hi" });
    const layer = makeMemfsFileSystem(vol);
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          return yield* fs.readFileString("/foo.txt");
        }),
        layer,
      ),
    );
    expect(result).toBe("hi");
  });

  it("stat reports File for files and Directory for directories", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString("/file.txt", "x");
        yield* fs.makeDirectory("/dir", { recursive: true });
        const file = yield* fs.stat("/file.txt");
        const dir = yield* fs.stat("/dir");
        return { fileType: file.type, dirType: dir.type };
      }),
    );
    expect(result.fileType).toBe("File");
    expect(result.dirType).toBe("Directory");
  });

  it("reads a missing path as SystemError with reason NotFound", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.readFileString("/missing.txt");
        }),
        MemfsFileSystemTest,
      ),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Success") {
      throw new Error("unreachable");
    }
    expect(Cause.isFailType(exit.cause)).toBe(true);
    if (!Cause.isFailType(exit.cause)) {
      throw new Error("unreachable");
    }
    expect(exit.cause.error._tag).toBe("SystemError");
    if (exit.cause.error._tag !== "SystemError") {
      throw new Error("unreachable");
    }
    expect(exit.cause.error.reason).toBe("NotFound");
  });
});
