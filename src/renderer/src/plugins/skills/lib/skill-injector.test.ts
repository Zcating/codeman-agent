
import { describe, it, expect } from "vitest";
import { formatSkillsManifestSection } from "@codeman-frontend/plugins/skills/lib/skill-injector";
import type { SkillManifest } from "@codeman-frontend/shared/lib/types";

const SKILL = (
	name: string,
	description: string,
	source: "preinstalled" | "user" = "user",
): SkillManifest => ({
	name,
	description,
	source,
	path: `/fake/${name}/SKILL.md`,
});

describe("formatSkillsManifestSection", () => {
	it("空数组返回空字符串", () => {
		expect(formatSkillsManifestSection([])).toBe("");
	});

	it("单个 skill 正确格式化", () => {
		const result = formatSkillsManifestSection([SKILL("foo", "Foo skill")]);
		expect(result).toContain("<available_skills>");
		expect(result).toContain("<name>foo</name>");
		expect(result).toContain("<description>Foo skill</description>");
		expect(result).toContain("</available_skills>");
	});

	it("多个 skills 全部包含", () => {
		const result = formatSkillsManifestSection([
			SKILL("a", "Skill A"),
			SKILL("b", "Skill B"),
		]);
		expect(result).toContain("<name>a</name>");
		expect(result).toContain("<name>b</name>");
		expect(result).toContain("<description>Skill A</description>");
		expect(result).toContain("<description>Skill B</description>");
	});

	it("description 含 XML 特殊字符被转义", () => {
		const result = formatSkillsManifestSection([SKILL("x", "use <foo> & 'bar'")]);
		expect(result).toContain("&lt;foo&gt;");
		expect(result).toContain("&amp;");
		expect(result).toContain("&apos;bar&apos;");
		expect(result).not.toMatch(/<foo>/);
	});

	it("name 含 XML 特殊字符被转义", () => {
		const result = formatSkillsManifestSection([SKILL("<script>", "X")]);
		expect(result).toContain("&lt;script&gt;");
		expect(result).not.toContain("<script>");
	});

	it("包含 _load_skill 使用说明", () => {
		const result = formatSkillsManifestSection([SKILL("x", "X")]);
		expect(result).toContain("_load_skill");
	});

	it("顺序按入参数组顺序", () => {
		const result = formatSkillsManifestSection([
			SKILL("z", "Z"),
			SKILL("a", "A"),
		]);
		const zIdx = result.indexOf("<name>z</name>");
		const aIdx = result.indexOf("<name>a</name>");
		expect(zIdx).toBeLessThan(aIdx);
	});
});