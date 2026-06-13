//! Agent-facing event types and emitter helpers.
//!
//! These events are consumed by the Solid.js frontend via
//! `@tauri-apps/api/event::listen`.  The naming matches the IPC
//! contract in `CONTEXT.md`.
//!
//! ## Event summary
//! | Event name               | Payload struct            | Direction |
//! |--------------------------|--------------------------|-----------|
//! | `agent-state-changed`    | `AgentStateChanged`      | Rust→TS   |
//! | `message-appended`       | `MessageAppendedPayload` | Rust→TS   |
//! | `tool-call-started`      | `ToolCallStartedPayload` | Rust→TS   |
//! | `tool-call-finished`     | `ToolCallFinishedPayload`| Rust→TS   |
//!
//! Legacy billing events (unchanged):
//! | `snapshot-updated`       | `SnapshotEnvelope`       | Rust→TS   |
//! | `refresh-failed`         | `RefreshFailedPayload`  | Rust→TS   |
//! | `low-threshold-breached` | `LowThresholdPayload`   | Rust→TS   |

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::db::messages::Message;

// ─────────────────────────────────────────────────────────────────────────────
// ToolCall — minimal mirror of the TS interface used in event payloads.
// Stored as JSON in `messages.tool_calls`.
// ─────────────────────────────────────────────────────────────────────────────

/// Minimal tool-call representation used in event payloads.
/// Mirrors the TS `ToolCall` interface: `{ id, name, args }`.
#[derive(Debug, Clone, Serialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub args: serde_json::Value,
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent state
// ─────────────────────────────────────────────────────────────────────────────

/// The agent's current reasoning state.
#[derive(Clone, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum AgentState {
    Idle,
    Thinking,
    Error { error: String },
}

/// Fired when the agent transitions between idle / thinking / error.
#[derive(Clone, Serialize)]
pub struct AgentStateChanged {
    pub state: AgentState,
}

// ─────────────────────────────────────────────────────────────────────────────
// Message events
// ─────────────────────────────────────────────────────────────────────────────

/// Fired when a new message is appended to a conversation.
#[derive(Clone, Serialize)]
pub struct MessageAppendedPayload {
    pub conversation_id: Uuid,
    pub message: Message,
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool-call events
// ─────────────────────────────────────────────────────────────────────────────

/// Fired when the agent starts invoking a tool.
#[derive(Clone, Serialize)]
pub struct ToolCallStartedPayload {
    pub message_id: Uuid,
    pub tool_call: ToolCall,
}

/// Fired when a tool invocation completes (success or error).
#[derive(Clone, Serialize)]
pub struct ToolCallFinishedPayload {
    pub message_id: Uuid,
    pub tool_call_id: String,
    pub result: serde_json::Value,
    pub error: Option<String>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Emitter helpers — fire-and-forget; failures are silently swallowed.
// ─────────────────────────────────────────────────────────────────────────────

/// Emit `agent-state-changed`.
pub fn emit_agent_state(app: &AppHandle, state: AgentState) {
    let _ = app.emit("agent-state-changed", AgentStateChanged { state });
}

/// Emit `message-appended`.
pub fn emit_message(app: &AppHandle, conversation_id: Uuid, message: Message) {
    let _ = app.emit(
        "message-appended",
        MessageAppendedPayload { conversation_id, message },
    );
}

/// Emit `tool-call-started`.
pub fn emit_tool_started(app: &AppHandle, message_id: Uuid, tool_call: ToolCall) {
    let _ = app.emit(
        "tool-call-started",
        ToolCallStartedPayload { message_id, tool_call },
    );
}

/// Emit `tool-call-finished`.
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