












import { Schema } from "effect";
import type {
	SkillFrontmatter,
	SkillManifest,
	SkillSource,
} from "@codeman-frontend/shared/lib/types";

export const SkillSourceSchema = Schema.Literal("preinstalled", "user");

export const SkillFrontmatterSchema = Schema.Struct({
	name: Schema.String,
	description: Schema.String,
});

export const SkillManifestSchema = Schema.Struct({
	name: Schema.String,
	description: Schema.String,
	source: SkillSourceSchema,
	path: Schema.String,
});


export type SkillSourceFromSchema = Schema.Schema.Type<typeof SkillSourceSchema>;
export type SkillFrontmatterFromSchema = Schema.Schema.Type<
	typeof SkillFrontmatterSchema
>;
export type SkillManifestFromSchema = Schema.Schema.Type<
	typeof SkillManifestSchema
>;


type _AssertSkillManifest =
	SkillManifestFromSchema extends SkillManifest
		? SkillManifest extends SkillManifestFromSchema
			? true
			: false
		: false;
const _checkSkillManifest: _AssertSkillManifest = true;
void _checkSkillManifest;
type _AssertSkillFrontmatter =
	SkillFrontmatterFromSchema extends SkillFrontmatter
		? SkillFrontmatter extends SkillFrontmatterFromSchema
			? true
			: false
		: false;
const _checkSkillFrontmatter: _AssertSkillFrontmatter = true;
void _checkSkillFrontmatter;
type _AssertSkillSource =
	SkillSourceFromSchema extends SkillSource
		? SkillSource extends SkillSourceFromSchema
			? true
			: false
		: false;
const _checkSkillSource: _AssertSkillSource = true;
void _checkSkillSource;


export type { SkillFrontmatter, SkillManifest, SkillSource };