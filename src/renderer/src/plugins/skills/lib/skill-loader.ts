// Skills loader — scan ~/.agents/skills/ + parse SKILL.md YAML frontmatter (ADR-0031)。
//
// 公开 API:
//   - scanSkillsDir(skillsDir): Effect<SkillManifest[], AppError, never>
//       列出所有有效 skill (corrupt 静默跳过)。ENOENT 视为空目录([])。
//   - loadSkillContent(skillsDir, skillName): Effect<string, AppError, never>
//       读 SKILL.md 全文(含 frontmatter), 不存在 → NotFound。
//
// 错误复用 AppError union:
//   - NotFound: skill 不存在
//   - InvalidConfig: 目录不可读 / 文件权限错误 / frontmatter 损坏
// 解析错误不外抛, 扫描时静默跳过(per ADR-0031 D1: "corrupt 在 list 中省略")。

import { Effect, Schema } from "effect";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Dirent } from "node:fs";
import { NotFound, InvalidConfig } from "@codeman-frontend/shared/lib/errors";
import { SkillFrontmatterSchema, type SkillFrontmatter, type SkillManifest, type SkillSource } from "@codeman-frontend/plugins/skills/lib/skill-loader-schema";

/** `---` 块结束位置 (含 trailing newline)。匹配 `---<NL>...<NL>---<NL><body>`。 */
const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** 一行 frontmatter `key: value` 解析。SKILL.md 仅要求 name + description 两个字段。 */
const KV_LINE_RE = /^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/;

/**
 * 解析 SKILL.md 顶部 YAML frontmatter。
 * 返回 `null` 表示格式不符(无 frontmatter / 未闭合 / 字段缺失)。
 * body 部分不带 frontmatter 也不带前面的 `---` 块。
 *
 * 导出供测试 + 未来其他 SKILL.md consumer 复用。
 */
export function parseFrontmatter(
	content: string,
): { frontmatter: SkillFrontmatter; body: string } | null {
	const match = FRONT_MATTER_RE.exec(content);
	if (!match) return null;
	const [, fmRaw, body] = match;
	const fm: Record<string, string> = {};
	for (const line of fmRaw.split(/\r?\n/)) {
		const m = KV_LINE_RE.exec(line);
		if (m && m[1] !== undefined && m[2] !== undefined) {
			fm[m[1]] = m[2].trim();
		}
	}
	const parsed = Schema.decodeUnknownEither(SkillFrontmatterSchema)(fm);
	if (parsed._tag === "Left") return null;
	return { frontmatter: parsed.right, body };
}

/**
 * 判断 skill 目录来源。V1 简化: 路径含 `.preinstalled/` 子段 → preinstalled,
 * 否则 user。后续可改为基于 hash 列表 (per ADR-0031 D7 deferred)。
 */
function detectSource(skillDir: string): SkillSource {
	const normalized = skillDir.replace(/\\/g, "/");
	return normalized.includes("/.preinstalled/") ? "preinstalled" : "user";
}

/**
 * 扫描 skills 目录, 返回所有有效 skill 的 manifest 列表。
 * - 目录不存在(ENOENT)→ 返回空数组(等同"无 skill")
 * - corrupt frontmatter / 缺字段 / 读失败 → 静默跳过
 * - 非目录条目(散文件)→ 跳过
 */
export const scanSkillsDir = Effect.fn(function* (skillsDir: string) {
	// ENOENT → succeed([]), 其它 IO 错误 → fail(InvalidConfig)。
	// catchAll 在 tryPromise 失败时调用, 转换失败为成功或另一个失败。
	const entries: Dirent[] = yield* Effect.tryPromise({
		try: () => readdir(skillsDir, { withFileTypes: true }),
		catch: (e) => e as NodeJS.ErrnoException,
	}).pipe(
		Effect.catchAll((e) => {
			const err = e as NodeJS.ErrnoException;
			if (err.code === "ENOENT") {
				return Effect.succeed([] as Dirent[]);
			}
			return Effect.fail(
				new InvalidConfig({
					field: "skillsDir",
					message: `Cannot read skills directory: ${skillsDir} (${err.message})`,
				}),
			);
		}),
	);

	const manifests: SkillManifest[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const skillDir = join(skillsDir, entry.name);
		const skillFile = join(skillDir, "SKILL.md");

		// 静默吞读错误(权限 / ENOENT / IO) — corrupt 不阻塞其他 skill。
		// Promise-level .catch 把 IO 错误转为 success(null), effect 永远 succeed。
		const content: string | null = yield* Effect.tryPromise(() =>
			readFile(skillFile, "utf-8").catch(() => null),
		);
		if (content === null) continue;

		const parsed = parseFrontmatter(content);
		if (parsed === null) continue;

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
 * 读取 skill 完整 SKILL.md 内容(含 frontmatter) — 供 `_load_skill` meta-tool 使用。
 * skill 不存在 → NotFound; 读错误 → InvalidConfig。
 */
export const loadSkillContent = Effect.fn(function* (
	skillsDir: string,
	skillName: string,
) {
	const skillFile = join(skillsDir, skillName, "SKILL.md");

	// stat → success boolean; ENOENT / 权限错误 → false (静默吞)。
	// Promise-level .then(..., ()=>false) 把 IO 错误转为 success(false), effect 永远 succeed。
	const exists: boolean = yield* Effect.tryPromise(() =>
		stat(skillFile).then(
			() => true,
			() => false,
		),
	);
	if (!exists) {
		yield* Effect.fail(
			new NotFound({
				message: `Skill not found: ${skillName} in ${skillsDir}`,
			}),
		);
		// TS unreachable — 满足生成器必须返回 string 的类型约束
		return "" as never;
	}

	return yield* Effect.tryPromise({
		try: () => readFile(skillFile, "utf-8"),
		catch: (e) =>
			new InvalidConfig({
				field: `skill:${skillName}`,
				message: `Cannot read skill file: ${skillFile} (${String(e)})`,
			}),
	});
});