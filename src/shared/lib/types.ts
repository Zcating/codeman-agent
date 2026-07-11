//! Rust IPC 与 TS 之间的导线契约。镜像 src-tauri/src/types.rs。
//! 所有字段 snake_case 以匹配 Rust serde。在此处添加新类型，绝不
//! 直接从 Rust 导入。

// ============================================================================
// V1.5 Unified Provider Schema (ADR-0012)
// ============================================================================

export interface ModelMeta {
  id: string;
  label: string;
  context_window?: number;
  deprecated: boolean;
  thinking: boolean;
}

export interface ProviderLlm {
  default_model: string;
  base_url: string;
  /** ADR-0011: V1 only supports anthropic-messages protocol */
  api_type: "anthropic-messages";
  models: ModelMeta[];
  models_endpoint: string;
}

export interface Provider {
  id: string;
  label: string;
  enabled: boolean;
  api_key: string; // ADR-0015: plaintext in Settings JSON
  llm: ProviderLlm;
}

// ============================================================================
// Settings (V1.5)
// ============================================================================

export interface Settings {
  /** V1.5: unified providers array. Optional for V1 backward-compat. */
  providers?: Provider[];
  /** V1.5: schema version marker. Optional for V1 backward-compat. */
  schema_version?: "1.5";
  default_llm_provider_id?: string;
  user_language: "zh" | "en" | "auto";
  theme: "light" | "dark" | "system";
  start_at_login: boolean;
  window: WindowSettings;
  system_prompt: SystemPromptSettings;
  conversations: ConversationSettings;
  /** @deprecated Use providers instead. Kept for V1 consumer backward-compatibility. */
  llm_providers: LLMProvider[];
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
  default_model?: string;
  base_url?: string;
  api_type: "anthropic-messages";
  api_key_ref: string;
}

// ============================================================================
// Window & System Prompt Settings (preserved from V1)
// ============================================================================

export interface WindowSettings {
  remember_position: boolean;
  remember_size: boolean;
  default_size: { width: number; height: number };
  min_size: { width: number; height: number };
}
export interface SystemPromptSettings {
  default: string;
  user_can_edit: boolean;
}
export interface ConversationSettings {
  auto_archive_after_days: number; // default 30
  max_history: number; // default 1000
}

// ============================================================================
// V2 File IO Tools (ADR-0013)
// ============================================================================

export interface Workspace {
  id: string;
  label: string;
  root_path: string; // PathBuf in Rust, string in TS
  created_at: number;
}

/** Mirror of Rust `FileMatch` struct from T9 */
export interface FileMatch {
  path: string;
  line_number: number | null;
  line_content: string | null;
}

// ============================================================================
// Domain Types (preserved)
// ============================================================================

export type Role = "user" | "assistant" | "tool" | "system";
export interface Conversation {
  id: string;
  title: string;
  system_prompt: string | null;
  /** V2.1: per-Conv workspace binding. '' 表示 'Needs workspace' (V1.x 旧 conv 灰标). */
  workspace_id: string;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
}
export interface Message {
  id: string;
  conversation_id: string;
  role: Role;
  /** 助手正文（Markdown 渲染）。thinking 不在此处。 */
  content: string;
  /** 助手思考过程（来自 Anthropic thinking_delta）。仅 assistant role；user/tool/system 一律 null。 */
  thinking: string | null;
  tool_calls: ToolCall[] | null;
  tool_results: ToolResult[] | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: number;
}
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}
export interface ToolResult {
  tool_call_id: string;
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
