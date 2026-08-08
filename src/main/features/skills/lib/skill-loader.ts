/**
 * src/main/features/skills/lib/skill-loader.ts
 *
 * PR-δ (ADR-0058): fs/path 调用走 FileSystem.FileSystem / Path.Path service。
 *
 * 与原实现的差异：
 * - `readdir` + Dirent 过滤：改用 `fs.readDirectory` 拿 string[]，再逐个
 *   `fs.stat` 判断 type === "Directory" 过滤非目录条目。
 * - `stat().then(..., () => false)` 存在性检查：直接用 `fs.exists`。
 * - `readFile(skillFile, "utf-8").catch(() => null)`：改用
 *   `fs.readFileString(...).pipe(Effect.catchAll(() => Effect.succeed(null)))`。
 * - `join` 改用 `pathSvc.join`。
 * - 错误统一走 src/main/lib/errors 的 AppBackendError 命名空间（与
 *   IPC 序列化层 sandbox-handler 的 {kind:_tag, message} 契约对齐）。
 *
 * parseFrontmatter / detectSource 保持原样（纯函数，无 fs 依赖）。
 */
import { Effect, Schema } from "effect";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import { AppBackendError } from "../../../lib/errors.js";
import {
  SkillFrontmatterSchema,
  type SkillFrontmatter,
  type SkillManifest,
  type SkillSource,
} from "./skill-loader-schema";

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

const KV_LINE_RE = /^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/;

export function parseFrontmatter(
  content: string,
): { frontmatter: SkillFrontmatter; body: string } | null {
  const match = FRONT_MATTER_RE.exec(content);
  if (!match) {
    return null;
  }
  const [, fmRaw, body] = match;
  const fm: Record<string, string> = {};
  for (const line of fmRaw.split(/\r?\n/)) {
    const m = KV_LINE_RE.exec(line);
    if (m && m[1] !== undefined && m[2] !== undefined) {
      fm[m[1]] = m[2].trim();
    }
  }
  const parsed = Schema.decodeUnknownEither(SkillFrontmatterSchema)(fm);
  if (parsed._tag === "Left") {
    return null;
  }
  return { frontmatter: parsed.right, body };
}

function detectSource(skillDir: string): SkillSource {
  const normalized = skillDir.replace(/\\/g, "/");
  return normalized.includes("/.preinstalled/") ? "preinstalled" : "user";
}

/**
 * 扫描 skills 目录，返回所有有效 SKILL.md 的 manifest 列表。
 * ENOENT 视为空目录（应用首次启动时 skills 目录可能尚未创建）。
 * R 通道要求 FileSystem.FileSystem | Path.Path。
 */
export const scanSkillsDir = Effect.fn("scanSkillsDir")(function* (skillsDir: string) {
  const fs = yield* FileSystem.FileSystem;
  const pathSvc = yield* Path.Path;

  const entries: readonly string[] = yield* fs.readDirectory(skillsDir).pipe(
    Effect.catchAll((e) =>
      e._tag === "SystemError" && e.reason === "NotFound"
        ? Effect.succeed([] as readonly string[])
        : Effect.fail(
            new AppBackendError.InvalidConfig({
              message: `Cannot read skills directory: ${skillsDir} (${e.message})`,
              field: "skillsDir",
            }),
          ),
    ),
  );

  const manifests: SkillManifest[] = [];
  for (const entry of entries) {
    const skillDir = pathSvc.join(skillsDir, entry);
    const skillFile = pathSvc.join(skillDir, "SKILL.md");

    // FileSystem.readDirectory 返回 string[]，无 Dirent.isDirectory() 信息；
    // 逐个 stat 判断 type === "Directory"。
    const info = yield* fs.stat(skillDir).pipe(
      Effect.catchAll(() => Effect.succeed(null)),
    );
    if (info === null || info.type !== "Directory") {
      continue;
    }

    const content: string | null = yield* fs.readFileString(skillFile).pipe(
      Effect.catchAll(() => Effect.succeed(null)),
    );
    if (content === null) {
      continue;
    }

    const parsed = parseFrontmatter(content);
    if (parsed === null) {
      continue;
    }

    manifests.push({
      name: parsed.frontmatter.name,
      description: parsed.frontmatter.description,
      source: detectSource(skillDir),
      path: skillFile,
    });
  }
  return manifests;
});

/**
 * 加载指定 skill 的完整 SKILL.md 内容。
 * 不存在时抛 AppBackendError.NotFound（IPC 透传后 kind === "NotFound"）。
 * R 通道要求 FileSystem.FileSystem | Path.Path。
 */
export const loadSkillContent = Effect.fn("loadSkillContent")(function* (
  skillsDir: string,
  skillName: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const pathSvc = yield* Path.Path;
  const skillFile = pathSvc.join(skillsDir, skillName, "SKILL.md");

  const exists = yield* fs.exists(skillFile);
  if (!exists) {
    return yield* Effect.fail(
      new AppBackendError.NotFound({
        message: `Skill not found: ${skillName} in ${skillsDir}`,
        path: skillFile,
      }),
    );
  }

  return yield* fs.readFileString(skillFile).pipe(
    Effect.mapError(
      (e) =>
        new AppBackendError.InvalidConfig({
          message: `Cannot read skill file: ${skillFile} (${e.message})`,
          field: `skill:${skillName}`,
        }),
    ),
  );
});