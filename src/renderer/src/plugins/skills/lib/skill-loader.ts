import { Effect, Schema } from "effect";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Dirent } from "node:fs";
import { NotFound, InvalidConfig } from "@codeman-frontend/shared/lib/errors";
import { SkillFrontmatterSchema, type SkillFrontmatter, type SkillManifest, type SkillSource } from "@codeman-frontend/plugins/skills/lib/skill-loader-schema";

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

const KV_LINE_RE = /^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/;

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

function detectSource(skillDir: string): SkillSource {
	const normalized = skillDir.replace(/\\/g, "/");
	return normalized.includes("/.preinstalled/") ? "preinstalled" : "user";
}

export const scanSkillsDir = Effect.fn(function* (skillsDir: string) {
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

export const loadSkillContent = Effect.fn(function* (
	skillsDir: string,
	skillName: string,
) {
	const skillFile = join(skillsDir, skillName, "SKILL.md");

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