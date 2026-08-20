import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getSkillsDir } from "../../features/skills/skills-host";
import fs from "node:fs";
import path from "node:path";

interface SkillMeta {
  name: string;
  description: string;
  source: string;
  path: string;
}

function scanSkillsDirSync(skillsDir: string): SkillMeta[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(skillsDir);
  } catch {
    return [];
  }

  const manifests: SkillMeta[] = [];
  for (const entry of entries) {
    const skillDir = path.join(skillsDir, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(skillDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const skillFile = path.join(skillDir, "SKILL.md");
    let content: string;
    try {
      content = fs.readFileSync(skillFile, "utf-8");
    } catch {
      continue;
    }

    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
    if (!match) continue;

    const fm: Record<string, string> = {};
    for (const line of match[1].split(/\r?\n/)) {
      const m = /^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/.exec(line);
      if (m) fm[m[1]] = m[2].trim();
    }
    if (!fm.name) continue;

    manifests.push({
      name: fm.name,
      description: fm.description ?? "",
      source: skillDir.includes("/.preinstalled/") ? "preinstalled" : "user",
      path: skillFile,
    });
  }
  return manifests;
}

export default function skillsExtension(_pi: ExtensionAPI): void {
  const skillsDir = getSkillsDir();
  let skillsCache: SkillMeta[] = [];

  try {
    skillsCache = scanSkillsDirSync(skillsDir);
  } catch {
    skillsCache = [];
  }

  _pi.registerCommand("skill", {
    description: "Load a skill by name",
    handler: async (args, ctx) => {
      const skillName = args.trim();
      if (!skillName) {
        ctx.ui.notify("Error: skill name required", "error");
        return;
      }

      const skill = skillsCache.find((s) => s.name === skillName);
      if (!skill) {
        ctx.ui.notify(`Skill not found: ${skillName}`, "error");
        return;
      }

      let content: string;
      try {
        content = fs.readFileSync(skill.path, "utf-8");
      } catch {
        ctx.ui.notify(`Error reading skill file: ${skillName}`, "error");
        return;
      }

      ctx.ui.notify(`Loaded skill: ${skill.name}`, "info");
      ctx.ui.setWidget("skill-content", [
        `Skill: ${skill.name}`,
        `Source: ${skill.source}`,
        "",
        content,
      ]);
    },
  });

  _pi.registerCommand("skills-list", {
    description: "List all available skills",
    handler: async (_args, ctx) => {
      if (skillsCache.length === 0) {
        ctx.ui.notify("No skills found", "info");
        return;
      }

      const lines = skillsCache.map(
        (s) => `- ${s.name}: ${s.description || "(no description)"} [${s.source}]`,
      );
      ctx.ui.notify(`Available skills:\n${lines.join("\n")}`, "info");
    },
  });
}
