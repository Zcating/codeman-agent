import type { SkillManifest } from "@codeman-frontend/plugins/skills/lib/skill-loader-schema";


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


function escapeXml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}