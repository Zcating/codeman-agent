import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const IDENTITY_SECTION = `
## codeman-agent

codeman-agent is a native desktop AI coding agent built with Electron, Solid.js, TypeScript, and Effect-TS. It provides intelligent code editing, file operations, and agentic workflows with a DeepSeek/MiniMax backend.

Key capabilities:
- File system tools: read, write, edit, bash, grep, find, ls
- Web fetch with SSRF protection
- MCP server integration
- Multi-agent delegation
- Skills system for specialized workflows
`.trim();

function buildCwdFooter(cwd: string): string {
  return `\nCurrent working directory: ${cwd}\n`;
}

export default function codemanAgentExtension(pi: ExtensionAPI): void {
  pi.on("before_agent_start", async (event) => {
    const cwd = event.systemPromptOptions.cwd ?? process.cwd();

    const sections: string[] = [IDENTITY_SECTION];

    if (event.systemPromptOptions.customPrompt && event.systemPromptOptions.customPrompt.trim().length > 0) {
      sections.push(event.systemPromptOptions.customPrompt.trim());
    }

    sections.push(buildCwdFooter(cwd));

    return {
      systemPrompt: sections.join("\n\n"),
    };
  });
}
