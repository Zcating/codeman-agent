//! Wire contract between Rust IPC and TS. Mirrors src-tauri/src/types.rs.
//! All fields snake_case to match Rust serde. Add new types here, never
//! import from Rust directly.

// Settings — 25+ fields, 9 categories
export interface Settings {
  llm_providers: LLMProvider[];
  default_llm_provider_id?: string;
  user_language: "zh" | "en" | "auto";
  theme: "light" | "dark" | "system";
  start_at_login: boolean;
  window: WindowSettings;
  system_prompt: SystemPromptSettings;
  billing_providers: BillingProviderConfig[];
  conversations: ConversationSettings;
}
export interface LLMProvider {
  id: string;
  label: string;
  enabled: boolean;
  default_model?: string;
  base_url?: string;
  api_key_ref: string;
}
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
export interface BillingProviderConfig {
  id: "deepseek" | "minimax";
  enabled: boolean;
  refresh_interval_secs: number;
  api_key_ref: string;
}
export interface ConversationSettings {
  auto_archive_after_days: number; // default 30
  max_history: number; // default 1000
}

// Domain
export type Role = "user" | "assistant" | "tool" | "system";
export interface Conversation {
  id: string;
  title: string;
  system_prompt: string | null;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
}
export interface Message {
  id: string;
  conversation_id: string;
  role: Role;
  content: string;
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

// Billing snapshot
export type Snapshot =
  | { kind: "balance"; amount: number; currency: string; auto_recharge: boolean | null }
  | { kind: "plan_quota"; remaining: number; total: number; expires_at: number | null; daily_avg: number | null };
export type Balance = Extract<Snapshot, { kind: "balance" }>;
export type PlanQuota = Extract<Snapshot, { kind: "plan_quota" }>;
export interface BillingProviderMeta {
  id: string;
  label: string;
  enabled: boolean;
}

// Error
export type AppError =
  | { kind: "NotFound"; message: string }
  | { kind: "Unauthorized"; message: string }
  | { kind: "Network"; message: string; cause?: string }
  | { kind: "InvalidConfig"; message: string; field?: string }
  | { kind: "Database"; message: string; cause?: string }
  | { kind: "ToolCall"; tool_call_id: string; message: string }
  | { kind: "Unknown"; message: string };