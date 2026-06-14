//! 面向 Agent 的事件类型和发送辅助函数。
//!
//! 这些事件通过 `@tauri-apps/api/event::listen` 由 Solid.js 前端消费。
//! 命名与 `CONTEXT.md` 中的 IPC 契约一致。
//!
//! ## 事件摘要
//! | 事件名                  | Payload 结构体            | 方向 |
//! |--------------------------|--------------------------|-----------|
//! | `agent-state-changed`    | `AgentStateChanged`      | Rust→TS   |
//! | `message-appended`       | `MessageAppendedPayload` | Rust→TS   |
//! | `tool-call-started`      | `ToolCallStartedPayload` | Rust→TS   |
//! | `tool-call-finished`     | `ToolCallFinishedPayload`| Rust→TS   |
//!
//! 旧版计费事件（未变）：
//! | `snapshot-updated`       | `SnapshotEnvelope`       | Rust→TS   |
//! | `refresh-failed`         | `RefreshFailedPayload`  | Rust→TS   |
//! | `low-threshold-breached` | `LowThresholdPayload`   | Rust→TS   |

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::db::messages::Message;

// ─────────────────────────────────────────────────────────────────────────────
// ToolCall — 事件 payload 中使用的 TS 接口的最小镜像。
// 作为 JSON 存储在 `messages.tool_calls` 中。
// ─────────────────────────────────────────────────────────────────────────────

/// 事件 payload 中使用的最小工具调用表示。
/// 镜像 TS 的 `ToolCall` 接口：`{ id, name, args }`。
#[derive(Debug, Clone, Serialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub args: serde_json::Value,
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent 状态
// ─────────────────────────────────────────────────────────────────────────────

/// Agent 当前推理状态。
#[derive(Clone, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum AgentState {
    Idle,
    Thinking,
    Error { error: String },
}

/// Agent 在 idle / thinking / error 之间转换时触发。
#[derive(Clone, Serialize)]
pub struct AgentStateChanged {
    pub state: AgentState,
}

// ─────────────────────────────────────────────────────────────────────────────
// 消息事件
// ─────────────────────────────────────────────────────────────────────────────

/// 新消息追加到会话时触发。
#[derive(Clone, Serialize)]
pub struct MessageAppendedPayload {
    pub conversation_id: Uuid,
    pub message: Message,
}

// ─────────────────────────────────────────────────────────────────────────────
// 工具调用事件
// ─────────────────────────────────────────────────────────────────────────────

/// Agent 开始调用工具时触发。
#[derive(Clone, Serialize)]
pub struct ToolCallStartedPayload {
    pub message_id: Uuid,
    pub tool_call: ToolCall,
}

/// 工具调用完成时触发（成功或错误）。
#[derive(Clone, Serialize)]
pub struct ToolCallFinishedPayload {
    pub message_id: Uuid,
    pub tool_call_id: String,
    pub result: serde_json::Value,
    pub error: Option<String>,
}

// ─────────────────────────────────────────────────────────────────────────────
// 发送辅助函数 — fire-and-forget；失败被静默吞掉。
// ─────────────────────────────────────────────────────────────────────────────

/// 发送 `agent-state-changed` 事件。
pub fn emit_agent_state(app: &AppHandle, state: AgentState) {
    let _ = app.emit("agent-state-changed", AgentStateChanged { state });
}

/// 发送 `message-appended` 事件。
pub fn emit_message(app: &AppHandle, conversation_id: Uuid, message: Message) {
    let _ = app.emit(
        "message-appended",
        MessageAppendedPayload { conversation_id, message },
    );
}

/// 发送 `tool-call-started` 事件。
pub fn emit_tool_started(app: &AppHandle, message_id: Uuid, tool_call: ToolCall) {
    let _ = app.emit(
        "tool-call-started",
        ToolCallStartedPayload { message_id, tool_call },
    );
}

/// 发送 `tool-call-finished` 事件。
pub fn emit_tool_finished(
    app: &AppHandle,
    message_id: Uuid,
    tool_call_id: String,
    result: serde_json::Value,
    error: Option<String>,
) {
    let _ = app.emit(
        "tool-call-finished",
        ToolCallFinishedPayload {
            message_id,
            tool_call_id,
            result,
            error,
        },
    );
}