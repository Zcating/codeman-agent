//! ADR-0025 Phase 3 PR 4 — chat Branded IDs: ConversationId, ToolCallId.
//!
//! 两个 ID 都是 chat feature 专用（ADR-0025 D6 feature 自治）。
//! 无 Refinement：backend 生成（SQLite TEXT 列），LLM tool_call_id 来自 pi-ai runtime。
//!
//! 用法:
//!   const convId = ConversationIdSchema.make(row.id);
//!   const tcId = ToolCallIdSchema.make(llmResponse.toolCallId);
import { Schema } from "effect";

/** ConversationId: chat conversation PK. */
export const ConversationIdSchema = Schema.String.pipe(Schema.brand("ConversationId"));
export type ConversationId = Schema.Schema.Type<typeof ConversationIdSchema>;

/** ToolCallId: pi-ai LLM tool call ID. */
export const ToolCallIdSchema = Schema.String.pipe(Schema.brand("ToolCallId"));
export type ToolCallId = Schema.Schema.Type<typeof ToolCallIdSchema>;
