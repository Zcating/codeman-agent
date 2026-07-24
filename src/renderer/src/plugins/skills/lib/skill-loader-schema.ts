// SkillLoader schemas — ADR-0031 Skills System。
//
// Schema 定义遵循 effect/Schema (per ADR-0025)。Runtime 类型定义在
// src/shared/lib/types.ts (single source of truth for cross-domain types)。
// 本文件定义 Schema,derive 出 type 与 shared/lib/types.ts 保持一致。
//
// 不引 gray-matter / js-yaml 新依赖 — frontmatter 是简单的 key: value 行格式,
// skill-loader.ts 内手写解析(~30 行)。
//
// ADR 锁定(per ADR-0031 D1):
// - name 必须 = 所在目录名(扫描时不做强制校验; 运行时容忍不一致 + 跳过)
// - description 必填(缺失 = 不出现在自动发现 manifest)

import { Schema } from "effect";
import type {
	SkillFrontmatter,
	SkillManifest,
	SkillSource,
} from "../../../shared/lib/types";

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

// Schema → type 推导, 与 shared/lib/types.ts 字段对齐(编译期检查)
export type SkillSourceFromSchema = Schema.Schema.Type<typeof SkillSourceSchema>;
export type SkillFrontmatterFromSchema = Schema.Schema.Type<
	typeof SkillFrontmatterSchema
>;
export type SkillManifestFromSchema = Schema.Schema.Type<
	typeof SkillManifestSchema
>;

// 编译期断言 schema 与 shared 类型一致 (drift detection)
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

// Type-only re-exports (compatibility with old import paths)
export type { SkillFrontmatter, SkillManifest, SkillSource };