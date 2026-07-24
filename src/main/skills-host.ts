// Skills host — Electron main process module (ADR-0031 Wave A3).
//
// 职责:
//   1. 计算 ~/.agents/skills/ 路径
//   2. ensurePreinstalledSkills() — 首次启动时把 bundled skills (从 process.resourcesPath/skills)
//      复制到 ~/.agents/skills/.preinstalled/<name>/SKILL.md (idempotent: 已存在不覆盖)
//   3. 注册 IPC handlers: "skillsScan" (列所有) + "skillsLoad" (读单个)

import { app, ipcMain } from "electron";
import { access, copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import {
	loadSkillContent,
	scanSkillsDir,
} from "../renderer/src/plugins/skills/lib/skill-loader";
import type { SkillManifest } from "../renderer/src/shared/lib/types";

// ─── Paths ──────────────────────────────────────────────

/** `~/.agents/skills/` (用户级 skills 根目录)。 */
export function getSkillsDir(): string {
	return join(app.getPath("home"), ".agents", "skills");
}

/** `~/.agents/skills/.preinstalled/` (预装 skills 落点, 路径含 .preinstalled/ 触发 detectSource)。 */
export function getPreinstalledDir(): string {
	return join(getSkillsDir(), ".preinstalled");
}

/** `<resourcesPath>/skills/` (electron-builder extraResources 提供的 bundled skills 源)。 */
export function getBundledDir(): string {
	return join(process.resourcesPath, "skills");
}

// ─── Read operations (renderer-facing) ──────────────────

/** 列出 ~/.agents/skills/ 下所有有效 skill 的 manifest。 */
export async function listSkills(): Promise<SkillManifest[]> {
	return Effect.runPromise(scanSkillsDir(getSkillsDir()));
}

/** 读取单个 skill 的完整 SKILL.md 内容。 */
export async function readSkillFile(name: string): Promise<string> {
	return Effect.runPromise(loadSkillContent(getSkillsDir(), name));
}

// ─── First-launch seeding ──────────────────────────────

/**
 * 首次启动(或升级后)把 bundled skills 复制到 ~/.agents/skills/.preinstalled/。
 * - bundled dir 不存在(开发环境无 extraResources)→ no-op
 * - 目标已存在 → 不覆盖(idempotent, 保留用户修改)
 * - 目标不存在 → 复制 + 创建目录
 */
export async function ensurePreinstalledSkills(): Promise<void> {
	const targetRoot = getPreinstalledDir();
	const bundledRoot = getBundledDir();

	// 确保 .preinstalled/ 目录存在 (即使 bundled 不存在, 目录先建)
	await mkdir(targetRoot, { recursive: true });

	// bundled dir 不存在 → dev 环境或未打包, 跳过复制
	try {
		await access(bundledRoot);
	} catch {
		return;
	}

	const entries = await readdir(bundledRoot, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;

		const sourceFile = join(bundledRoot, entry.name, "SKILL.md");
		const targetDir = join(targetRoot, entry.name);
		const targetFile = join(targetDir, "SKILL.md");

		// idempotent: 目标已存在则跳过(保留用户修改)
		try {
			await access(targetFile);
			continue;
		} catch {
			// not exists, proceed to copy
		}

		await mkdir(targetDir, { recursive: true });
		await copyFile(sourceFile, targetFile);
	}
}

// ─── IPC handler registration ──────────────────────────

/** 注册 skills:* IPC handlers (channel: skillsScan + skillsLoad)。 */
export function registerSkillHandlers(): void {
	ipcMain.handle("skillsScan", async () => {
		return await listSkills();
	});
	ipcMain.handle("skillsLoad", async (_event, args: { name: string }) => {
		const name = args?.name;
		if (typeof name !== "string" || name.length === 0) {
			throw new Error("skillsLoad: name required");
		}
		return await readSkillFile(name);
	});
}