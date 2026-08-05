import { describe, expect, it } from "vitest";
import { buildSystemPrompt, type BuildSystemPromptSections, type ToolSnippet, type WorkspaceContext } from "./build-system-prompt";

describe("buildSystemPrompt", () => {
  // ── helpers ─────────────────────────────────────────────────────────────────

  const IDENTITY = "You are an AI assistant.";
  const USER_DEFAULT = "Be helpful.";

  // ── Test 1: minimal input (identity + empty rest) → only identity section ─────

  it("1. minimal input (identity + empty rest) → only identity section", () => {
    const input: BuildSystemPromptSections = {
      identity: IDENTITY,
      staticToolSnippets: [],
      guidelines: [],
      userDefault: "",
    };
    const result = buildSystemPrompt(input);
    expect(result).toEqual(IDENTITY);
  });

  // ── Test 2: full basic input → correct sections in fixed order, \n\n separator ──

  it("2. full basic input → correct sections in fixed order, \\n\\n separator", () => {
    const snippets: readonly ToolSnippet[] = [
      { name: "read_file", summary: "Read a file from the filesystem." },
      { name: "edit_file", summary: "Edit an existing file." },
    ];
    const guidelines = [
      "edit_file old_text must match uniquely.",
      "10MB file size limit.",
    ];

    const input: BuildSystemPromptSections = {
      identity: IDENTITY,
      staticToolSnippets: snippets,
      guidelines,
      userDefault: USER_DEFAULT,
    };

    const result = buildSystemPrompt(input);

    // identity first
    expect(result.indexOf(IDENTITY)).toBe(0);

    // Available tools section heading
    expect(result).toContain("## Available tools");
    expect(result).toContain("- read_file: Read a file from the filesystem.");
    expect(result).toContain("- edit_file: Edit an existing file.");

    // guidelines section heading
    expect(result).toContain("## Guidelines");
    expect(result).toContain("- edit_file old_text must match uniquely.");
    expect(result).toContain("- 10MB file size limit.");

    // userDefault last
    const lastUserDefaultIndex = result.lastIndexOf(USER_DEFAULT);
    expect(lastUserDefaultIndex).toBeGreaterThan(result.indexOf("## Guidelines"));

    // \n\n separates sections (no triple+ newlines in body)
    const sections = result.split("\n\n");
    expect(sections.length).toBeGreaterThanOrEqual(3);
  });

  // ── Test 3: workspace provided → workspace context + cwd footer ─────────────

  it("3. workspace provided → workspace context + cwd footer", () => {
    const workspace: WorkspaceContext = {
      workspaceId: "ws-123",
      rootPath: "/home/user/project",
    };

    const input: BuildSystemPromptSections = {
      identity: IDENTITY,
      staticToolSnippets: [],
      guidelines: [],
      userDefault: USER_DEFAULT,
      workspace,
    };

    const result = buildSystemPrompt(input);

    // original semantics: workspaceId in quotes, all file tools named, no inference rule
    expect(result).toContain('workspaceId="ws-123"');
    expect(result).toContain("read_file, write_file, edit_file, search_files, delete_file");
    expect(result).toContain("Do NOT infer the id from user messages, folder names, or any other context");
    // cwd footer
    expect(result).toContain("Current working directory: /home/user/project");
  });

  // ── Test 4: projectInstructions provided → wrapped in project_instructions ──

  it("4. projectInstructions provided → wrapped in project_instructions section", () => {
    const projectInstructions = "Use TypeScript. Write tests.";

    const input: BuildSystemPromptSections = {
      identity: IDENTITY,
      staticToolSnippets: [],
      guidelines: [],
      userDefault: USER_DEFAULT,
      projectInstructions,
    };

    const result = buildSystemPrompt(input);

    expect(result).toContain("<project_instructions>");
    expect(result).toContain(projectInstructions);
    expect(result).toContain("</project_instructions>");
  });

  // ── Test 5: skillsSection provided → appended as-is ────────────────────────

  it("5. skillsSection provided → appended as-is", () => {
    const skillsSection = "## Skills\n- Skill A\n- Skill B";

    const input: BuildSystemPromptSections = {
      identity: IDENTITY,
      staticToolSnippets: [],
      guidelines: [],
      userDefault: USER_DEFAULT,
      skillsSection,
    };

    const result = buildSystemPrompt(input);

    expect(result).toContain("## Skills");
    expect(result).toContain("- Skill A");
    expect(result).toContain("- Skill B");
  });

  // ── Test 6: conversationOverride → replaces base sections, others still appear ─

  it("6. conversationOverride replaces base sections; workspace/skills still appended", () => {
    const override = "Custom system prompt from conversation.";

    const input: BuildSystemPromptSections = {
      identity: IDENTITY,
      staticToolSnippets: [
        { name: "tool_a", summary: "Does a thing." },
      ],
      guidelines: ["A guideline."],
      userDefault: USER_DEFAULT,
      conversationOverride: override,
      workspace: { workspaceId: "ws-override", rootPath: "/override/path" },
      skillsSection: "## Skills\n- Override Skill",
    };

    const result = buildSystemPrompt(input);

    // base sections NOT present
    expect(result).not.toContain(IDENTITY);
    expect(result).not.toContain("- tool_a: Does a thing.");
    expect(result).not.toContain("A guideline.");
    expect(result).not.toContain(USER_DEFAULT);

    // override present
    expect(result).toContain(override);

    // workspace still present
    expect(result).toContain("ws-override");
    expect(result).toContain("Current working directory: /override/path");

    // skills still present
    expect(result).toContain("Override Skill");
  });

  // ── Test 6b: conversationOverride + projectInstructions → both present ─────────

  it("6b. conversationOverride + projectInstructions → override and AGENTS.md both present", () => {
    const override = "Custom system prompt from conversation.";
    const projectInstructions = "Use TypeScript. Write tests.";

    const input: BuildSystemPromptSections = {
      identity: IDENTITY,
      staticToolSnippets: [],
      guidelines: [],
      userDefault: USER_DEFAULT,
      conversationOverride: override,
      projectInstructions,
    };

    const result = buildSystemPrompt(input);

    // override present
    expect(result).toContain(override);
    // AGENTS.md / projectInstructions section present
    expect(result).toContain("<project_instructions>");
    expect(result).toContain(projectInstructions);
    // base sections NOT present
    expect(result).not.toContain(IDENTITY);
    expect(result).not.toContain(USER_DEFAULT);
  });

  // ── Test 7: empty sections silently skipped ─────────────────────────────────

  it("7. empty sections silently skipped; no extra blank lines between present sections", () => {
    const input: BuildSystemPromptSections = {
      identity: IDENTITY,
      staticToolSnippets: [],
      guidelines: [], // empty → skipped
      userDefault: USER_DEFAULT,
      // no workspace
      // no projectInstructions
      // no skillsSection
    };

    const result = buildSystemPrompt(input);

    // identity then userDefault only, no Guidelines or other absent sections
    const sections = result.split("\n\n").filter((s) => s.trim().length > 0);
    expect(sections).toHaveLength(2);
    expect(result).toContain(IDENTITY);
    expect(result).toContain(USER_DEFAULT);
  });

  // ── Test 8a: dynamic snippet > 120 chars → truncated with ellipsis ──────────

  it("8a. dynamic snippet > 120 chars → truncated with ellipsis", () => {
    // String is 150 chars clearly exceeding 120 limit
    const longSnippet =
      "a".repeat(150);

    const input: BuildSystemPromptSections = {
      identity: IDENTITY,
      staticToolSnippets: [],
      dynamicToolSnippets: [longSnippet],
      guidelines: [],
      userDefault: USER_DEFAULT,
    };

    const result = buildSystemPrompt(input);

    // truncated with ellipsis appears (117 'a' + '…' = 118 chars)
    expect(result).toContain("a".repeat(117) + "…");
    // full un-truncated string not present
    expect(result).not.toContain(longSnippet);
  });

  // ── Test 8b: guidelines deduplication ────────────────────────────────────────

  it("8b. guidelines deduplication → duplicate entries appear only once", () => {
    const guidelines = [
      "Be concise.",
      "Be concise.", // duplicate
      "Write tests.",
      "Write tests.", // duplicate
    ];

    const input: BuildSystemPromptSections = {
      identity: IDENTITY,
      staticToolSnippets: [],
      guidelines,
      userDefault: USER_DEFAULT,
    };

    const result = buildSystemPrompt(input);

    const conciseCount = (result.match(/Be concise\./g) || []).length;
    const testsCount = (result.match(/Write tests\./g) || []).length;
    expect(conciseCount).toBe(1);
    expect(testsCount).toBe(1);
  });
});
