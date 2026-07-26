// Skill loader tests — ADR-0031 Wave A1.
//
// vitest + Node fs/promises (无 mockState — 本 feature 无 IPC)。

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Effect, Exit } from "effect";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSkillContent, parseFrontmatter, scanSkillsDir } from "@codeman-frontend/plugins/skills/lib/skill-loader";
import { NotFound } from "@codeman-frontend/shared/lib/errors";

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "skills-loader-test-"));
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

async function makeSkill(name: string, content: string): Promise<string> {
	const skillDir = join(tempDir, name);
	await mkdir(skillDir, { recursive: true });
	await writeFile(join(skillDir, "SKILL.md"), content, "utf-8");
	return skillDir;
}

const VALID_SKILL = (name: string, desc: string) =>
	`---\nname: ${name}\ndescription: ${desc}\n---\n\n# ${name} body\n`;

describe("parseFrontmatter", () => {
	it("解析标准 SKILL.md", () => {
		const result = parseFrontmatter("---\nname: foo\ndescription: Foo skill\n---\n\nbody");
		expect(result).not.toBeNull();
		expect(result?.frontmatter.name).toBe("foo");
		expect(result?.frontmatter.description).toBe("Foo skill");
		expect(result?.body).toBe("\nbody");
	});

	it("无 frontmatter 返回 null", () => {
		expect(parseFrontmatter("just a body")).toBeNull();
	});

	it("frontmatter 未闭合返回 null", () => {
		expect(parseFrontmatter("---\nname: x\ndescription: y\nbody")).toBeNull();
	});

	it("缺 name 字段返回 null", () => {
		expect(parseFrontmatter("---\ndescription: x\n---\nbody")).toBeNull();
	});

	it("缺 description 字段返回 null", () => {
		expect(parseFrontmatter("---\nname: x\n---\nbody")).toBeNull();
	});

	it("value 含 : 字符正确保留", () => {
		const r = parseFrontmatter("---\nname: foo\ndescription: http://example.com:8080/path\n---\n");
		expect(r?.frontmatter.description).toBe("http://example.com:8080/path");
	});
});

describe("scanSkillsDir", () => {
	it("空目录返回空数组", async () => {
		const result = await Effect.runPromise(scanSkillsDir(tempDir));
		expect(result).toEqual([]);
	});

	it("不存在的目录返回空数组", async () => {
		const result = await Effect.runPromise(scanSkillsDir(join(tempDir, "nonexistent")));
		expect(result).toEqual([]);
	});

	it("扫描单个有效 skill", async () => {
		await makeSkill("foo", VALID_SKILL("foo", "Foo skill"));
		const result = await Effect.runPromise(scanSkillsDir(tempDir));
		expect(result).toHaveLength(1);
		expect(result[0]?.name).toBe("foo");
		expect(result[0]?.description).toBe("Foo skill");
		expect(result[0]?.source).toBe("user");
		expect(result[0]?.path).toContain("foo");
		expect(result[0]?.path).toContain("SKILL.md");
	});

	it("扫描多个 skills, 都返回", async () => {
		await makeSkill("alpha", VALID_SKILL("alpha", "A"));
		await makeSkill("beta", VALID_SKILL("beta", "B"));
		const result = await Effect.runPromise(scanSkillsDir(tempDir));
		expect(result.map((s) => s.name).sort()).toEqual(["alpha", "beta"]);
	});

	it("corrupt frontmatter (未闭合) 跳过", async () => {
		await makeSkill("broken", "---\nname: broken\ndescription: X\n");
		const result = await Effect.runPromise(scanSkillsDir(tempDir));
		expect(result).toEqual([]);
	});

	it("缺 description 字段跳过", async () => {
		await makeSkill("nodesc", "---\nname: nodesc\n---\nbody");
		const result = await Effect.runPromise(scanSkillsDir(tempDir));
		expect(result).toEqual([]);
	});

	it("非目录条目(散文件)跳过", async () => {
		await writeFile(join(tempDir, "stray-file.txt"), "not a skill");
		await makeSkill("valid", VALID_SKILL("valid", "V"));
		const result = await Effect.runPromise(scanSkillsDir(tempDir));
		expect(result).toHaveLength(1);
		expect(result[0]?.name).toBe("valid");
	});

	it("preinstalled 路径识别(source = preinstalled)", async () => {
		const preinstalledRoot = join(tempDir, ".preinstalled");
		await mkdir(join(preinstalledRoot, "foo"), { recursive: true });
		await writeFile(
			join(preinstalledRoot, "foo", "SKILL.md"),
			VALID_SKILL("foo", "preinstalled foo"),
			"utf-8",
		);
		const result = await Effect.runPromise(scanSkillsDir(preinstalledRoot));
		expect(result).toHaveLength(1);
		expect(result[0]?.source).toBe("preinstalled");
	});

	it("corrupt skill 不阻塞其它有效 skill", async () => {
		await makeSkill("good", VALID_SKILL("good", "G"));
		await makeSkill("bad", "---\nname: bad\n"); // 未闭合
		const result = await Effect.runPromise(scanSkillsDir(tempDir));
		expect(result).toHaveLength(1);
		expect(result[0]?.name).toBe("good");
	});
});

describe("loadSkillContent", () => {
	it("读取完整 skill 内容", async () => {
		const content = VALID_SKILL("foo", "Foo skill");
		await makeSkill("foo", content);
		const result = await Effect.runPromise(loadSkillContent(tempDir, "foo"));
		expect(result).toBe(content);
	});

	it("skill 不存在返回 NotFound", async () => {
		const exit = await Effect.runPromiseExit(loadSkillContent(tempDir, "missing"));
		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			const error = (exit.cause as { _tag: "Fail"; error: unknown }).error;
			expect(error).toBeInstanceOf(NotFound);
		}
	});

	it("空 body 的 skill 仍返回完整内容(含 frontmatter)", async () => {
		await makeSkill("empty", "---\nname: empty\ndescription: E\n---\n");
		const result = await Effect.runPromise(loadSkillContent(tempDir, "empty"));
		expect(result).toContain("name: empty");
		expect(result).toContain("description: E");
	});
});