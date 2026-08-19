
import { describe, it, expect, beforeEach } from "vitest";
import { Effect, Layer } from "effect";
import { it as itEffect } from "@effect/vitest";
import {
	skillsManifests$,
	setManifests,
	resetManifests,
	_resetSkillsStoreForTest,
	initializeSkillsManifests,
} from "@codeman-frontend/features/skills/stores/skills.store";
import { SkillsApi } from "@codeman-frontend/shared/apis";
import { Unknown } from "@codeman-frontend/shared/lib/errors";
import type { SkillManifest } from "@codeman-frontend/shared/lib/types";

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

	itEffect("initializeSkillsManifests updates skillsManifests$ on success", () =>
		Effect.gen(function* () {
			const fresh: SkillManifest[] = [
				{ name: "test-skill", description: "Test", source: "user", path: "/fake/test/SKILL.md" },
			];
			const mockLayer = Layer.succeed(SkillsApi, {
				scan: () => Effect.succeed(fresh),
				load: () => Effect.succeed(""),
			});

			yield* initializeSkillsManifests().pipe(Effect.provide(mockLayer));

			expect(skillsManifests$()).toEqual(fresh);
		}),
	);

	itEffect("initializeSkillsManifests leaves state unchanged on IPC failure", () =>
		Effect.gen(function* () {
			setManifests(SAMPLE);
			expect(skillsManifests$()).toHaveLength(2);

			const failingLayer = Layer.succeed(SkillsApi, {
				scan: () => Effect.fail(new Unknown({ message: "IPC failure" })),
				load: () => Effect.succeed(""),
			});

			yield* initializeSkillsManifests().pipe(Effect.provide(failingLayer));

			expect(skillsManifests$()).toEqual(SAMPLE);
		}),
	);
});