import { ipcMain } from "electron";
import { readFile, unlink, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Database as DB } from "better-sqlite3";
import {
  validatePathInWorkspace,
  readFileInWorkspace,
  writeFileInWorkspace,
} from "../../file-sandbox.js";
import { sandboxHandler } from "../../lib/sandbox-handler.js";

interface RawWorkspace {
  id: string;
  label: string;
  root_path: string;
  created_at: number;
}

async function getWorkspaceById(db: DB, id: string): Promise<RawWorkspace> {
  const row = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as RawWorkspace | undefined;
  if (!row) {
    throw new Error(`Workspace not found: ${id}`);
  }
  return row;
}

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
    return { kind: "ambiguous", message: `Pattern matches ${occurrences} times in ${path}. Searched for: ${quoted}. Use replaceAll=true or make the pattern more specific.` };
  }

  const replaced = replaceAll
    ? normalized.split(normalizedOld).join(normalizedNew)
    : normalized.replace(normalizedOld, normalizedNew);

  const newContent = eol === "\r\n" ? replaced.replace(/\n/g, "\r\n") : replaced;
  return { kind: "ok", newContent };
}

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
    const content = await readFile(join(root, relPath), "utf-8").catch(() => null);
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

async function walkDir(root: string, visit: (relPath: string) => Promise<void>): Promise<void> {
  const skip = new Set([".git", "node_modules", "dist", "dist-electron", ".electron-builder-cache"]);
  const stack: Array<{ abs: string; rel: string }> = [{ abs: root, rel: "" }];
  while (stack.length > 0) {
    const item = stack.pop()!;
    let entries: string[];
    try {
      entries = await readdir(item.abs);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (skip.has(entry)) {
        continue;
      }
      const childRel = item.rel ? `${item.rel}/${entry}` : entry;
      const childAbs = join(root, childRel);
      const st = await stat(childAbs).catch(() => null);
      if (!st) {
        continue;
      }
      if (st.isDirectory()) {
        stack.push({ abs: childAbs, rel: childRel });
      } else if (st.isFile()) {
        await visit(childRel);
      }
    }
  }
}

function matchGlob(relPath: string, glob: string): boolean {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLESTAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/::DOUBLESTAR::/g, ".*");
  return new RegExp(`^${escaped}$`).test(relPath);
}

export function registerFileOpsIpc(deps: { db: DB }): void {
  ipcMain.handle("readFile", sandboxHandler(async (args: { workspaceId?: string; path: string }) => {
    const wsId = args.workspaceId ?? "";
    const ws = await getWorkspaceById(deps.db, wsId);
    return await readFileInWorkspace(ws.root_path, args.path);
  }));

  ipcMain.handle("writeFile", sandboxHandler(async (args: { workspaceId?: string; path: string; content: string }) => {
    const wsId = args.workspaceId ?? "";
    const ws = await getWorkspaceById(deps.db, wsId);
    await writeFileInWorkspace(ws.root_path, args.path, args.content);
  }));

  ipcMain.handle("editFile", sandboxHandler(async (args: { workspaceId?: string; path: string; oldText: string; newText: string; replaceAll?: boolean }) => {
    const wsId = args.workspaceId ?? "";
    const ws = await getWorkspaceById(deps.db, wsId);
    const abs = await validatePathInWorkspace(args.path, ws.root_path);
    const content = await readFile(abs, "utf-8");
    const result = applyEdit(content, args.oldText, args.newText, args.replaceAll ?? false, args.path);
    if (result.kind !== "ok") {
      throw new Error(result.message);
    }
    await writeFileInWorkspace(ws.root_path, args.path, result.newContent);
  }));

  ipcMain.handle("searchFiles", async (_e, args: { workspaceId?: string; glob: string; contentPattern?: string | null }) => {
    const wsId = args.workspaceId ?? "";
    const ws = await getWorkspaceById(deps.db, wsId);
    return await searchFilesInWorkspace(ws.root_path, args.glob, args.contentPattern ?? null);
  });

  ipcMain.handle("deleteFile", sandboxHandler(async (args: { workspaceId?: string; path: string }) => {
    const wsId = args.workspaceId ?? "";
    const ws = await getWorkspaceById(deps.db, wsId);
    const abs = await validatePathInWorkspace(args.path, ws.root_path);
    await unlink(abs);
  }));
}
