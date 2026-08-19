/**
 * src/main/features/skills/skills-host.ts
 *
 * PR-δ : fs/path 调用全部走 FileSystem.FileSystem / Path.Path service。
 *
 * 与原实现的差异：
 * - listSkills / readSkillFile / ensurePreinstalledSkills 改为 Effect-returning，
 *   R 通道要求 FileSystem.FileSystem | Path.Path。
 * - ensurePreinstalledSkills 内部原子化：错误被 catchAll 吞掉（与原 try/catch
 *   容错语义一致），最终 Effect 的 E = never。
 * - copyFile 改用 fs.copyFile（PR-α 已扩展 NodeFileSystemLive 实现该方法）。
 * - readdir + Dirent.isDirectory() 改用 fs.readDirectory（string[]）+ 逐个
 *   fs.stat 判断 type === "Directory"。
 *
 * getSkillsDir / getPreinstalledDir / getBundledDir 仍 sync（依赖 electron
 * app.getPath / process.resourcesPath，pre-runtime）。
 */
import { app } from "electron";
import { Effect } from "effect";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import { AppBackendError } from "../../lib/errors.js";
import type { PlatformError } from "@effect/platform/Error";
import { loadSkillContent, scanSkillsDir } from "./lib/skill-loader";
import type { SkillManifest } from "../../../renderer/src/shared/lib/types";

// ---------------------------------------------------------------------------
// Sync path helpers（依赖 electron / process，pre-runtime）
// ---------------------------------------------------------------------------

export function getSkillsDir(): string {
  return join(app.getPath("home"), ".agents", "skills");
}

export function getPreinstalledDir(): string {
  return getSkillsDir() + "/.preinstalled";
}

export function getBundledDir(): string {
  return join(process.resourcesPath, "skills");
}

// node:path join is sync and platform-portable; safe in this sync helper.
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Effect-returning skills API
// ---------------------------------------------------------------------------

/**
 * 扫描用户 skills 目录，返回 manifest 列表。
 * 读失败时容错返回空数组（与原实现 catch 后 return [] 一致）。
 * R = FileSystem.FileSystem | Path.Path（scanSkillsDir 需求）。
 */
export const listSkills = (): Effect.Effect<
  SkillManifest[],
  never,
  FileSystem.FileSystem | Path.Path
> =>
  scanSkillsDir(getSkillsDir()).pipe(
    Effect.catchAll(() => Effect.succeed([] as SkillManifest[])),
  );

/**
 * 读取指定 skill 的完整内容。
 * E = AppBackendError（NotFound / InvalidConfig）。
 * R = FileSystem.FileSystem | Path.Path。
 */
export const readSkillFile = (
  name: string,
): Effect.Effect<
  string,
  AppBackendError | PlatformError,
  FileSystem.FileSystem | Path.Path
> => loadSkillContent(getSkillsDir(), name);

/**
 * 启动时把 bundled skills 拷贝到用户 ~/.agents/skills/.preinstalled/。
 * 幂等：已存在的目标文件跳过（不覆盖用户修改）。
 * 错误一律吞掉（与原 try/catch 容错语义一致）；E = never。
 * R = FileSystem.FileSystem | Path.Path。
 */
export const ensurePreinstalledSkills = (): Effect.Effect<
  void,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathSvc = yield* Path.Path;

    const targetRoot = getPreinstalledDir();
    const bundledRoot = getBundledDir();

    // 1. 确保目标根目录存在（mkdir -p）
    yield* fs.makeDirectory(targetRoot, { recursive: true }).pipe(Effect.ignore);

    // 2. bundled 目录不存在则整体跳过（开发环境 / 打包缺失）
    const bundledExists = yield* fs.exists(bundledRoot).pipe(
      Effect.catchAll(() => Effect.succeed(false)),
    );
    if (!bundledExists) {
      return;
    }

    // 3. 遍历 bundled 子目录
    const entries = yield* fs.readDirectory(bundledRoot).pipe(
      Effect.catchAll(() => Effect.succeed([] as readonly string[])),
    );

    for (const name of entries) {
      const sourceFile = pathSvc.join(bundledRoot, name, "SKILL.md");
      const targetDir = pathSvc.join(targetRoot, name);
      const targetFile = pathSvc.join(targetDir, "SKILL.md");

      // 4. 幂等检查：目标已存在则跳过（不覆盖用户修改）
      const targetExists = yield* fs.exists(targetFile).pipe(
        Effect.catchAll(() => Effect.succeed(false)),
      );
      if (targetExists) {
        continue;
      }

      // 5. 仅复制 SKILL.md；目标子目录不存在则创建
      yield* fs.makeDirectory(targetDir, { recursive: true }).pipe(
        Effect.ignore,
      );
      yield* fs.copyFile(sourceFile, targetFile).pipe(Effect.ignore);
    }
  });