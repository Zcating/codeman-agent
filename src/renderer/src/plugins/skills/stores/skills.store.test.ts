// Skills store tests — ADR-0031 Wave A2.

import { describe, it, expect, beforeEach } from "vitest";
import {
	skillsManifests$,
	setManifests,
	resetManifests,
	_resetSkillsStoreForTest,
} from "@codeman-frontend/plugins/skills/stores/skills.store";
import type { SkillManifest } from "@codeman-frontend/plugins/skills/lib/skill-loader-schema";

const SAMPLE: SkillManifest[] = [
	{ name: "foo", description: "Foo", source: "user", path: "/fake/foo/SKILL.md" },
	{
		name: "bar",
		description: "Bar",
		source: "preinstalled",
		path: "/fake/.preinstalled/bar/SKILL.md",
	},
];

describe("skills store", () => {
	beforeEach(() => {
		_resetSkillsStoreForTest();
	});

	it("初始为空数组", () => {
		expect(skillsManifests$()).toEqual([]);
	});

	it("setManifests 替换整个列表", () => {
		setManifests(SAMPLE);
		expect(skillsManifests$()).toEqual(SAMPLE);
	});

	it("resetManifests 清空列表", () => {
		setManifests(SAMPLE);
		expect(skillsManifests$()).toHaveLength(2);
		resetManifests();
		expect(skillsManifests$()).toEqual([]);
	});

	it("setManifests 接受空数组", () => {
		setManifests(SAMPLE);
		setManifests([]);
		expect(skillsManifests$()).toEqual([]);
	});

	it("accessor 返回同一 reference (Solid signal 语义)", () => {
		const before = skillsManifests$();
		expect(skillsManifests$()).toBe(before);
	});

	it("setManifests 后 accessor 返回新 reference", () => {
		const before = skillsManifests$();
		setManifests(SAMPLE);
		expect(skillsManifests$()).not.toBe(before);
		expect(skillsManifests$()).toBe(SAMPLE);
	});
});