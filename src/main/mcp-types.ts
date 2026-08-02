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