//! ADR-0025 Phase 3 PR 4 — chat Branded IDs: ConversationId, ToolCallId.
//!
//! 两个 ID 都是 chat feature 专用（ADR-0025 D6 feature 自治）。
//! 无 Refinement：backend 生成（SQLite TEXT 列），LLM tool_call_id 来自 pi-ai runtime。
//!
//! 用法:
//!   const convId = ConversationIdSchema.make(row.id);
//!   const tcId = ToolCallIdSchema.make(llmResponse.toolCallId);
//!
//! ADR-0029 PR 1 — TanStack Form schemas (D2).
//! 严格 schema（field-level 和 form-level 一致），"" 哨兵只在 defaultValues 层
//! （data layer），不在 schema 层。form-level schema 用于 onChange validator，
//! field-level schema 用于 onBlur validator。
import { Schema } from "effect";

/** ConversationId: chat conversation PK. */
export const ConversationIdSchema = Schema.String.pipe(Schema.brand("ConversationId"));
export type ConversationId = Schema.Schema.Type<typeof ConversationIdSchema>;

/** ToolCallId: pi-ai LLM tool call ID. */
export const ToolCallIdSchema = Schema.String.pipe(Schema.brand("ToolCallId"));
export type ToolCallId = Schema.Schema.Type<typeof ToolCallIdSchema>;

// ─── Form schemas (ADR-0029 PR 1, D2) ────────────────────────────────────────

/** 共享 strict 非空串：field-level & form-level 都用这个（保持 ProviderCard 模板一致深度）。
 *
 * `{ message }` 注解是为了替换 effect-schema-adapter 的 fallback 文案
 * "Invalid value (${_tag})"。根因：TanStack Form 的 onBlur validator 跑空字符串触发
 * Schema.minLength 失败,ParseIssue 默认无 annotation → adapter 渲染 generic 提示。
 * 加注解后,所有 NonEmptyString 失败都走友好文案 ("请输入消息内容")。
 *
 * 当前唯一显示该错误的 UI 是 draft textarea (Home + ChatView),workspace picker
 * 无 onBlur handler → 永不显示错误,所以共用同一文案安全。
 */
const NonEmptyString = Schema.String.pipe(
  Schema.minLength(1, { message: () => "请输入消息内容" }),
);

/** 草稿字段（HomeAgentForm + ChatView）：用户在 textarea 编辑的文本。 */
export const DraftFieldSchema = NonEmptyString;

/** 模型 id 字段（HomeAgentForm + ChatView）：当前选中的 LLM 模型。允许 ""（无 model 选中时用 "auto" 默认 fallback）。 */
export const ModelIdFieldSchema = Schema.String;

/** workspace id 字段（仅 HomeAgentForm）：当前选中的 workspace。 */
export const WorkspaceIdFieldSchema = NonEmptyString;

/** HomeAgentForm 完整 form-level schema：draft + workspaceId 必须非空；modelId 可选。 */
export const HomeFormSchema = Schema.Struct({
  draft: NonEmptyString,
  modelId: Schema.String,
  workspaceId: NonEmptyString,
});

/** ChatView 完整 form-level schema：draft 必须非空；modelId 可选。 */
export const ChatViewFormSchema = Schema.Struct({
  draft: NonEmptyString,
  modelId: Schema.String,
});

/** HomeAgentForm form value 类型（form.useStore(s => s.values) 类型）。 */
export type HomeFormValue = Schema.Schema.Type<typeof HomeFormSchema>;

/** ChatView form value 类型。 */
export type ChatViewFormValue = Schema.Schema.Type<typeof ChatViewFormSchema>;
