

export interface ToolSnippet {
  name: string;
  summary: string;
}

export interface WorkspaceContext {
  workspaceId: string;
  rootPath: string;
}

// ── Shared constant sections (single source of truth for main chat + sub-agents) ──

/** Identity string used in the main conversation system prompt */
export const DEFAULT_IDENTITY =
  "You are an AI coding assistant with file system and command execution capabilities.";

/** Behavior guidelines */
export const DEFAULT_GUIDELINES = [
  "edit_file old_text must match exactly once unless you set replace_all=true",
  "Files are limited to 10 MB",
  "Binary files, .exe/.dll/.sys files, and paths outside workspaces are blocked",
  "Only operate within user-configured workspaces",
] as const satisfies readonly string[];

export interface BuildSystemPromptSections {
  identity: string;
  staticToolSnippets: readonly ToolSnippet[];
  dynamicToolSnippets?: readonly string[];
  guidelines: readonly string[];
  workspace?: WorkspaceContext;
  projectInstructions?: string;
  skillsSection?: string;
  userDefault: string;
  /** 有值时替换基础部分（identity / 工具列表 / guidelines / userDefault），workspace/skills 仍追加 */
  conversationOverride?: string;
}

/** 工具列表段标题 */
const TOOLS_HEADING = "## Available tools";

/** 行为指南段标题 */
const GUIDELINES_HEADING = "## Guidelines";

/** 工作区上下文段标题（沿用原版格式） */
const WORKSPACE_HEADING = "[Workspace context]";

/** 原版 workspace 指令文本（自 chat.store.ts L382-387 迁入） */
const WORKSPACE_CONTEXT_TEMPLATE = (
  id: string
) => `You are operating inside workspaceId="${id}".
You MUST pass this exact id as the workspaceId parameter for ALL file tools (read_file, write_file, edit_file, search_files, delete_file).
Do NOT infer the id from user messages, folder names, or any other context — use ONLY the id given above.`;

/** 页脚文本 */
const CWD_FOOTER = "Current working directory";

/**
 * 按 固定顺序组装系统提示词。
 * 空节静默跳过；节间 `\n\n` 分隔；guidelines Set 去重；
 * dynamicToolSnippets 超过 120 字符截断（加 `…`）。
 */
export function buildSystemPrompt(s: BuildSystemPromptSections): string {
  const parts: string[] = [];

  // ── conversationOverride 路径：workspace / projectInstructions / skills / override ──
  if (s.conversationOverride) {
    // workspace context（若有）
    if (s.workspace) {
      parts.push(
        `${WORKSPACE_HEADING}\n` +
          WORKSPACE_CONTEXT_TEMPLATE(s.workspace.workspaceId) +
          `\n` +
          `${CWD_FOOTER}: ${s.workspace.rootPath}`
      );
    }

    // projectInstructions / AGENTS.md（若有）
    if (s.projectInstructions) {
      parts.push(
        `<project_instructions>\n${s.projectInstructions}\n</project_instructions>`
      );
    }

    // skills（若有）
    if (s.skillsSection) {
      parts.push(s.skillsSection);
    }

    // conversationOverride 本身追加在最后（替换了基础部分：身份/工具/guidelines/userDefault）
    parts.push(s.conversationOverride);

    return parts.join("\n\n");
  }

  // ── 标准路径 ───────────────────────────────────────────────────────────────

  // 1. 身份段
  if (s.identity) {
    parts.push(s.identity);
  }

  // 2. 工具列表
  if (s.staticToolSnippets.length > 0 || (s.dynamicToolSnippets && s.dynamicToolSnippets.length > 0)) {
    const toolLines: string[] = s.staticToolSnippets.map(
      (t) => `- ${t.name}: ${t.summary}`
    );

    if (s.dynamicToolSnippets) {
      for (const dyn of s.dynamicToolSnippets) {
        const truncated = dyn.length > 120 ? dyn.slice(0, 117) + "…" : dyn;
        toolLines.push(`- ${truncated}`);
      }
    }

    parts.push(`${TOOLS_HEADING}\n${toolLines.join("\n")}`);
  }

  // 3. 行为指南（Set 去重）
  if (s.guidelines.length > 0) {
    const uniqueGuidelines = [...new Set(s.guidelines)];
    const guidelineLines = uniqueGuidelines.map((g) => `- ${g}`);
    parts.push(`${GUIDELINES_HEADING}\n${guidelineLines.join("\n")}`);
  }

  // 4. Workspace context（若有）
  if (s.workspace) {
    parts.push(
      `${WORKSPACE_HEADING}\n` +
        WORKSPACE_CONTEXT_TEMPLATE(s.workspace.workspaceId) +
        `\n` +
        `${CWD_FOOTER}: ${s.workspace.rootPath}`
    );
  }

  // 5. projectInstructions（若有）
  if (s.projectInstructions) {
    parts.push(
      `<project_instructions>\n${s.projectInstructions}\n</project_instructions>`
    );
  }

  // 6. skillsSection（若有）
  if (s.skillsSection) {
    parts.push(s.skillsSection);
  }

  // 7. 用户默认值（若有）
  if (s.userDefault) {
    parts.push(s.userDefault);
  }

  return parts.join("\n\n");
}
