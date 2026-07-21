//! MCP plugin types (ADR-0032).
//!
//! Re-exports from src/shared/lib/types.ts where mini-3 sub-agent defined them.

export type {
  McpServerStatus,
  McpServerConfig,
  McpTool,
  McpCallResult,
  McpServerInfo,
  McpToolEntry,
} from "../../shared/lib/types";
