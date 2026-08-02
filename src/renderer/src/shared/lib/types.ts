
export interface ModelMeta {
  id: string;
  label: string;
  contextWindow?: number;
  deprecated: boolean;
  thinking: boolean;
}

export interface ProviderLlm {
  defaultModel: string;
  baseUrl: string;
  apiType: "anthropic-messages";
  contextWindow?: number;
  models: ModelMeta[];
  modelsEndpoint: string;
}

export interface Provider {
  id: string;
  label: string;
  comment?: string;
  apiKey: string;
  llm: ProviderLlm;
}

export interface Settings {
  providers?: Provider[];
  schemaVersion?: "1.5";
  defaultLlmProviderId?: string;
  userLanguage: "zh" | "en" | "auto";
  theme: "light" | "dark" | "system";
  startAtLogin: boolean;
  window: WindowSettings;
  systemPrompt: SystemPromptSettings;
  conversations: ConversationSettings;
  enabledSkills?: string[];
  llmProviders: LLMProvider[];
}


export interface LLMProvider {
  id: string;
  label: string;
  enabled: boolean;
  defaultModel?: string;
  baseUrl?: string;
  apiType: "anthropic-messages";
  apiKeyRef: string;
}

export interface WindowSettings {
  rememberPosition: boolean;
  rememberSize: boolean;
  defaultSize: { width: number; height: number };
  minSize: { width: number; height: number };
}
export interface SystemPromptSettings {
  default: string;
  userCanEdit: boolean;
}
export interface ConversationSettings {
  autoArchiveAfterDays: number; 
  maxHistory: number; 
}

export interface Workspace {
  id: string;
  label: string;
  rootPath: string; 
  createdAt: number;
}

export interface FileMatch {
  path: string;
  lineNumber: number | null;
  lineContent: string | null;
}

export type Role = "user" | "assistant" | "tool" | "system";
export interface Conversation {
  id: string;
  title: string;
  systemPrompt: string | null;
  workspaceId: string;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}
export interface Message {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  thinking: string | null;
  toolCalls: ToolCall[] | null;
  toolResults: ToolResult[] | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: number;
}
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}
export interface ToolResult {
  toolCallId: string;
  result: unknown;
  error: string | null;
}


export interface QaEntry {
  question: string;
  answer: string;
  default?: boolean;
}


export type SkillSource = "preinstalled" | "user";

export interface SkillFrontmatter {
  name: string;
  description: string;
}

export interface SkillManifest {
  name: string;
  description: string;
  source: SkillSource;
  path: string;
}


export type McpServerStatus =
  | { kind: "disabled" }
  | { kind: "starting" }
  | { kind: "connected"; toolCount: number }
  | { kind: "spawn_failed"; error: string }
  | { kind: "protocol_error"; error: string }
  | { kind: "crashed"; exitCode: number | null; signal: NodeJS.Signals | null; error: string };

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface McpCallResult {
  content: Array<{ type: string; text?: string; [k: string]: unknown }>;
  isError?: boolean;
}

export interface McpServerInfo {
  config: McpServerConfig;
  status: McpServerStatus;
  tools: McpTool[];
}

export interface McpToolEntry {
  serverName: string;
  agentName: string;
  toolName: string;
  description: string;
  inputSchema: unknown;
}

export interface CompactionEntry {
  id: string;
  conversationId: string;
  summary: string;
  model: string;
  tokensBefore: number;
  kind: "auto" | "manual";
  createdAt: number;
  firstKeptMessageId: string;
}
