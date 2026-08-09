/**
 * file-ops/ipc.ts
 *
 * ADR-0046 D3: getWorkspaceById 移到 data.ts，handler 经 runMain 执行。
 * 删 db dep，删 better-sqlite3 import。
 *
 * PR-δ (ADR-0058): fs 调用全部走 FileSystem.FileSystem service。
 * - editFile / deleteFile / readFile / writeFile handler：走
 *   file-sandbox.ts 的 Effect-returning API（PR-β 已迁移），runMain 桥接。
 * - searchFiles handler 内部的 searchFilesInWorkspace / walkDir 改用
 *   runMain(Effect.gen(...)) 包装 fs 调用。
 */
import { ipcMain } from "electron";
import * as FileSystem from "@effect/platform/FileSystem";
import { Effect } from "effect";

import { runMain } from "../../runtime.js";
import { getWorkspaceById } from "./data.js";
import {
  validatePathInWorkspace,
  readFileInWorkspace,
  writeFileInWorkspace,
} from "../../file-sandbox.js";
import { sandboxHandler } from "../../lib/sandbox-handler.js";

// ---------------------------------------------------------------------------
// helpers（保留原有 applyEdit / matchGlob 等纯函数）
// ---------------------------------------------------------------------------

export function applyEdit(
  content: string,
  oldText: string,
  newText: string,
  replaceAll: boolean,
  path: string,
):
  | { kind: "ok"; newContent: string }
  | { kind: "notFound" | "ambiguous"; message: string } {
  const crlfCount = (content.match(/\r\n/g) ?? []).length;
  const loneLfCount = (content.match(/(?<!\r)\n/g) ?? []).length;
  const eol: "\n" | "\r\n" = crlfCount > loneLfCount ? "\r\n" : "\n";

  const normalized = content.replace(/\r\n/g, "\n");
  const normalizedOld = oldText.replace(/\r\n/g, "\n");
  const normalizedNew = newText.replace(/\r\n/g, "\n");

  const occurrences = normalized.split(normalizedOld).length - 1;
  const snippet = oldText.length > 200 ? oldText.slice(0, 200) + "..." : oldText;
  const quoted = JSON.stringify(snippet);
  if (occurrences === 0) {
    return { kind: "notFound", message: `Pattern not found in ${path}. Searched for: ${quoted}` };
  }
  if (occurrences > 1 && !replaceAll) {
    return {
      kind: "ambiguous",
      message: `Pattern matches ${occurrences} times in ${path}. Searched for: ${quoted}. Use replaceAll=true or make the pattern more specific.`,
    };
  }

  const replaced = replaceAll
    ? normalized.split(normalizedOld).join(normalizedNew)
    : normalized.replace(normalizedOld, normalizedNew);

  const newContent = eol === "\r\n" ? replaced.replace(/\n/g, "\r\n") : replaced;
  return { kind: "ok", newContent };
}

/**
 * 递归遍历 workspace 目录，对每个文件调 visit(relPath)。
 * 实现用 stack-based DFS；跳过 .git / node_modules / dist / dist-electron /
 * .electron-builder-cache（与原实现一致）。
 *
 * 走 FileSystem service：通过 runMain 把 Effect.gen 桥接到 Promise。
 */
async function walkDir(
  root: string,
  visit: (relPath: string) => Promise<void>,
): Promise<void> {
  await runMain(
    Effect.fn("fileOps.walkDir")(function* () {
      const fs = yield* FileSystem.FileSystem;
      const skip = new Set([
        ".git",
        "node_modules",
        "dist",
        "dist-electron",
        ".electron-builder-cache",
      ]);
      const stack: Array<{ abs: string; rel: string }> = [
        { abs: root, rel: "" },
      ];
      while (stack.length > 0) {
        const item = stack.pop()!;
        const entries = yield* fs.readDirectory(item.abs).pipe(
          Effect.catchAll(() => Effect.succeed([] as readonly string[])),
        );
        for (const entry of entries) {
          if (skip.has(entry)) {
            continue;
          }
          const childRel = item.rel ? `${item.rel}/${entry}` : entry;
          // walkDir 内部不需要 Path service（relPath 是 POSIX 风格的纯字符串拼接），
          // childAbs 仍然以 root 为基准拼接，留给下游 fs 调用。
          const childAbs = `${root}/${childRel}`.replace(/\\/g, "/");
          const info = yield* fs.stat(childAbs).pipe(
            Effect.catchAll(() => Effect.succeed(null)),
          );
          if (info === null) {
            continue;
          }
          if (info.type === "Directory") {
            stack.push({ abs: childAbs, rel: childRel });
          } else if (info.type === "File") {
            // 把同步 visit 转成 Effect.then
            yield* Effect.promise(() => visit(childRel));
          }
        }
      }
    }),
  );
}

/**
 * 在 workspace 内搜索匹配 glob 且（可选）包含 contentPattern 的文件。
 * 内部 fs 操作走 FileSystem service。
 */
async function searchFilesInWorkspace(
  root: string,
  glob: string,
  contentPattern: string | null,
): Promise<Array<{ path: string; line: number; text: string }>> {
  const results: Array<{ path: string; line: number; text: string }> = [];
  await walkDir(root, async (relPath) => {
    const norm = relPath.replace(/\\/g, "/");
    if (!matchGlob(norm, glob)) {
      return;
    }
    if (contentPattern === null) {
      results.push({ path: norm, line: 0, text: "" });
      return;
    }
    const abs = `${root}/${relPath}`.replace(/\\/g, "/");
    const content = await runMain(
      Effect.fn("fileOps.searchFilesInWorkspace.readFile")(function* () {
        const fs = yield* FileSystem.FileSystem;
        return yield* fs.readFileString(abs).pipe(
          Effect.catchAll(() => Effect.succeed(null)),
        );
      }),
    );
    if (!content) {
      return;
    }
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(contentPattern)) {
        results.push({ path: norm, line: i + 1, text: lines[i].trim() });
        return;
      }
    }
  });
  return results;
}

function matchGlob(relPath: string, glob: string): boolean {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLESTAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`^${escaped.replace(/::DOUBLESTAR::/g, ".*")}$`).test(
    relPath,
  );
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

export function registerFileOpsIpc(): void {
  ipcMain.handle(
    "readFile",
    sandboxHandler(async (args: { workspaceId?: string; path: string }) => {
      const wsId = args.workspaceId ?? "";
      const ws = await runMain(getWorkspaceById(wsId));
      return await readFileInWorkspace(ws.root_path, args.path);
    }),
  );

  ipcMain.handle(
    "writeFile",
    sandboxHandler(
      async (args: { workspaceId?: string; path: string; content: string }) => {
        const wsId = args.workspaceId ?? "";
        const ws = await runMain(getWorkspaceById(wsId));
        await writeFileInWorkspace(ws.root_path, args.path, args.content);
      },
    ),
  );

  ipcMain.handle(
    "editFile",
    sandboxHandler(
      async (args: {
        workspaceId?: string;
        path: string;
        oldText: string;
        newText: string;
        replaceAll?: boolean;
      }) => {
        const wsId = args.workspaceId ?? "";
        const ws = await runMain(getWorkspaceById(wsId));
        const abs = await runMain(
          validatePathInWorkspace(args.path, ws.root_path),
        );
        const content = await runMain(
          Effect.fn("fileOps.editFile.readFile")(function* () {
            const fs = yield* FileSystem.FileSystem;
            return yield* fs.readFileString(abs);
          }),
        );
        const result = applyEdit(
          content,
          args.oldText,
          args.newText,
          args.replaceAll ?? false,
          args.path,
        );
        if (result.kind !== "ok") {
          throw new Error(result.message);
        }
        await writeFileInWorkspace(
          ws.root_path,
          args.path,
          result.newContent,
        );
      },
    ),
  );

  ipcMain.handle(
    "searchFiles",
    async (
      _e,
      args: {
        workspaceId?: string;
        glob: string;
        contentPattern?: string | null;
      },
    ) => {
      const wsId = args.workspaceId ?? "";
      const ws = await runMain(getWorkspaceById(wsId));
      return await searchFilesInWorkspace(
        ws.root_path,
        args.glob,
        args.contentPattern ?? null,
      );
    },
  );

  ipcMain.handle(
    "deleteFile",
    sandboxHandler(async (args: { workspaceId?: string; path: string }) => {
      const wsId = args.workspaceId ?? "";
      const ws = await runMain(getWorkspaceById(wsId));
      const abs = await runMain(
        validatePathInWorkspace(args.path, ws.root_path),
      );
      await runMain(
        Effect.fn("fileOps.deleteFile.remove")(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.remove(abs);
        }),
      );
    }),
  );
}