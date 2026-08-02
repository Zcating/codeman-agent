export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export type McpServerStatus =
  | { kind: "starting" }
  | { kind: "connected"; toolCount: number }
  | { kind: "spawn_failed"; error: string }
  | { kind: "crashed"; exitCode: number | null; signal: NodeJS.Signals | null; error: string }
  | { kind: "disabled" }
  | { kind: "protocol_error"; error: string };

export interface McpTool {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface McpCallResult {
  content: Array<{ type: "text"; text: string } | { type: string; [k: string]: unknown }>;
  isError?: boolean;
}

export type StatusChangeHandler = (status: McpServerStatus) => void;


export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unnamed";
}


export function mcpAgentName(serverName: string, toolName: string): string {
  return `mcp_${slug(serverName)}_${slug(toolName)}`;
}