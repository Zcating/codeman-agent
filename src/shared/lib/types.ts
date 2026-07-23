//! TS-side data structures. Field names use camelCase in TS; the IPC layer
//! (`electron/main/ipc.ts`) translates to/from snake_case at the SQLite/Rust
//! boundary so DB column names stay snake_case. New fields added here MUST
//! use camelCase.

// ============================================================================
// V1.5 Unified Provider Schema (ADR-0012)
// ============================================================================

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
  /** ADR-0011: V1 only supports anthropic-messages protocol */
  apiType: "anthropic-messages";
  models: ModelMeta[];
  modelsEndpoint: string;
}

export interface Provider {
  id: string;
  label: string;
  enabled: boolean;
  apiKey: string; // ADR-0015: plaintext in Settings JSON
  llm: ProviderLlm;
}

// ============================================================================
// Settings (V1.5)
// ============================================================================

export interface Settings {
  /** V1.5: unified providers array. Optional for V1 backward-compat. */
  providers?: Provider[];
  /** V1.5: schema version marker. Optional for V1 backward-compat. */
  schemaVersion?: "1.5";
  defaultLlmProviderId?: string;
  userLanguage: "zh" | "en" | "auto";
  theme: "light" | "dark" | "system";
  startAtLogin: boolean;
  window: WindowSettings;
  systemPrompt: SystemPromptSettings;
  conversations: ConversationSettings;
  /** V3.1 ADR-0031: 已启用的 skill 名字列表。空 = 不在 system prompt 注入 skills。 */
  enabledSkills?: string[];
  /** @deprecated Use providers instead. Kept for V1 consumer backward-compatibility. */
  llmProviders: LLMProvider[];
}

// ============================================================================
// Legacy V1 Types (deprecated - for backward compatibility)
// ============================================================================
// These types mirror the V1 flat structure. V1.5 uses nested Provider type.
// Will be removed after all consumers are migrated to V1.5 Provider schema.

/**
 * @deprecated Use Provider.llm instead. Will be removed after T6-T11 migrations.
 */
export interface LLMProvider {
  id: string;
  label: string;
  enabled: boolean;
  defaultModel?: string;
  baseUrl?: string;
  apiType: "anthropic-messages";
  apiKeyRef: string;
}

// ============================================================================
// Window & System Prompt Settings (preserved from V1)
// ============================================================================

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
  autoArchiveAfterDays: number; // default 30
  maxHistory: number; // default 1000
}

// ============================================================================
// V2 File IO Tools (ADR-0013)
// ============================================================================

export interface Workspace {
  id: string;
  label: string;
  rootPath: string; // PathBuf in Rust, string in TS
  createdAt: number;
}

/** Mirror of Rust `FileMatch` struct from T9 */
export interface FileMatch {
  path: string;
  lineNumber: number | null;
  lineContent: string | null;
}

// ============================================================================
// Domain Types (preserved)
// ============================================================================

export type Role = "user" | "assistant" | "tool" | "system";
export interface Conversation {
  id: string;
  title: string;
  systemPrompt: string | null;
  /** V2.1: per-Conv workspace binding. '' 表示 'Needs workspace' (V1.x 旧 conv 灰标). */
  workspaceId: string;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}
export interface Message {
  id: string;
  conversationId: string;
  role: Role;
  /** 助手正文（Markdown 渲染）。thinking 不在此处。 */
  content: string;
  /** 助手思考过程（来自 Anthropic thinking_delta）。仅 assistant role；user/tool/system 一律 null。 */
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

// ============================================================================
// AppError moved to ./errors.ts (ADR-0025 PR 2)
// ============================================================================

// ============================================================================
// V2 Local Dev Mock LLM Pipeline (ADR-TBD)
// ============================================================================

/**
 * Q→A Entry — pre-formatted Anthropic SSE response keyed by user-message substring.
 * Used by the local-dev mock LLM provider pipeline. `default?: true` entries are
 * first-wins fallbacks when no `question` substring matches.
 */
export interface QaEntry {
  question: string;
  answer: string;
  default?: boolean;
}

// ============================================================================
// V3.1 Skills Plugin (ADR-0031)
// ============================================================================

/** Skill 来源标识 — preinstalled (ship-with-app) 或 user (用户添加)。 */
export type SkillSource = "preinstalled" | "user";

/** SKILL.md 顶部 YAML frontmatter block 的形状。 */
export interface SkillFrontmatter {
  name: string;
  description: string;
}

/** 单个 skill 的运行时元数据 (从 ~/.agents/skills/<name>/SKILL.md 解析)。 */
export interface SkillManifest {
  name: string;
  description: string;
  source: SkillSource;
  /** 绝对路径指向 SKILL.md 文件, 供 IPC handler 读全文用 */
  path: string;
}

// ============================================================================
// V3.1 MCP Client (ADR-0032)
// ============================================================================

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
  /** Original tool name (before slugification), e.g. "create_issue". */
  toolName: string;
  description: string;
  inputSchema: unknown;
}
