//! ADR-0025 Phase 3 PR 4 — 跨域 Branded ID: WorkspaceId.
//!
//! ADR-0025 D6 escape clause: WorkspaceId 被 3+ features 复用 (file-tools, chat,
//! ipc.ts, workspace-service.ts, codeman-sidebar.tsx)，抽出到 shared/lib/。
//! 其他 3 个 ID (FilePath / ToolCallId / ConversationId) 是 feature-specific，
//! 留在各自 feature 的 lib/schemas.ts。
//!
//! 无 Refinement：backend (SQLite) 生成 UUID，TS 层只做 brand 类型守卫。
//!
//! 用法:
//!   const wsId = WorkspaceIdSchema.make(row.id);  // 入口（DB → 运行时）
//!   await FileService.readFile(wsId, path);       // 出口（已 branded，安全）
import { Schema } from "effect";

/** Effect Schema: branded string. */
export const WorkspaceIdSchema = Schema.String.pipe(Schema.brand("WorkspaceId"));

/** Branded ID type. Compile-time distinct from `string`. */
export type WorkspaceId = Schema.Schema.Type<typeof WorkspaceIdSchema>;
