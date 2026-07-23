// Skills feature barrel (ADR-0010 5+1 whitelist).
//
// V3.1 端用户可加载的 prompt augmentation 系统 (per ADR-0031)。
// 职责: 仅修改 system prompt, 不带新 AgentTool / 不带 UI 资源 (与 MCP 正交)。

export { scanSkillsDir, loadSkillContent, parseFrontmatter } from "./lib/skill-loader";
export type { SkillManifest, SkillFrontmatter, SkillSource } from "./lib/skill-loader-schema";