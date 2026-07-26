// Skills system prompt injector (ADR-0031 D3)。
//
// 把 enabled SkillManifest 列表格式化为 system prompt 注入段。
// LLM 读 manifest 列表后, 主动决定调用 `_load_skill` 拉全文 (per ADR-0031 D4)。
//
// 输出格式 (locked per ADR-0031 D3):
//   <available_skills>
//   You have access to the following skills. When a user's request matches a
//   skill's purpose, call the `_load_skill` tool with the skill name to load
//   its full instructions.
//
//   <skill>
//   <name>commit-helper</name>
//   <description>Generate a conventional commit message from staged changes.</description>
//   </skill>
//   ...
//   </available_skills>

import type { SkillManifest } from "@codeman-frontend/plugins/skills/lib/skill-loader-schema";

/**
 * 格式化 enabled skills 为 system prompt 注入段。
 * 空数组 → 空字符串 (让 runtime 跳过此段拼接)。
 *
 * description / name 中的 XML 特殊字符 (`<` / `>` / `&` / `"` / `'`)
 * 自动转义, 防止 description 含未转义 markup 破坏输出 XML 结构。
 */
export function formatSkillsManifestSection(
	manifests: readonly SkillManifest[],
): string {
	if (manifests.length === 0) return "";

	const lines: string[] = [
		"<available_skills>",
		"You have access to the following skills. When a user's request matches a skill's purpose, call the `_load_skill` tool with the skill name to load its full instructions.",
		"",
	];

	for (const m of manifests) {
		lines.push("<skill>");
		lines.push(`<name>${escapeXml(m.name)}</name>`);
		lines.push(`<description>${escapeXml(m.description)}</description>`);
		lines.push("</skill>");
		lines.push("");
	}

	lines.push("</available_skills>");
	return lines.join("\n");
}

/** 转义 XML 特殊字符 (防御 skill name/description 含 markup 破坏 prompt 完整性)。 */
function escapeXml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}