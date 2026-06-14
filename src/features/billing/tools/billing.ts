//! Billing tools registered with the agent.
//!
//! T1 tool bridging (ADR 0002): tool definitions live in TS (here),
//! handlers invoke Rust adapters via Tauri IPC commands.
//!
//! NOTE: Unlike the template in T18's spec, the installed pi-agent (0.9.0) and
//! pi-ai (0.73.1) do NOT export a `tool()` factory with an `execute` field.
//! The actual API is pi-ai's plain `Tool` interface (name, description, parameters).
//! Tool execution is handled by pi-ai's agentLoop via ProviderTransport — the
//! transport passes tools to the LLM and receives tool_call events; there is no
//! per-tool execute callback.
//!
//! If a newer pi-mono version adds `tool()` with `execute`, this file can be
//! refactored to use that API. For now, we export plain Tool objects.
//!
//! Effect signature:
//!   get_balance, get_plan_quota: each take a provider id, return a
//!   Snapshot (Balance | PlanQuota). Errors propagate via the Tauri command's
//!   Result<T, AppError>.

import { Type } from "@mariozechner/pi-ai";
import type { Tool } from "@mariozechner/pi-ai";

// NOTE: The template showed `import { tool } from "@mariozechner/pi-agent"` but that
// export does not exist in pi-agent 0.9.0. We use the actual pi-ai Tool interface.
// Also note pi-ai uses TypeBox, not Zod. We convert Zod enums to TypeBox enums.
const ProviderEnum = Type.Union([
  Type.Literal("deepseek"),
  Type.Literal("minimax"),
]);

export const getBalance: Tool = {
  name: "get_balance",
  description:
    "Fetch the current balance for a billing provider (DeepSeek or MiniMax). Returns amount, currency, and auto-recharge flag.",
  parameters: Type.Object({
    provider: ProviderEnum,
  }),
};

export const getPlanQuota: Tool = {
  name: "get_plan_quota",
  description:
    "Fetch the current plan quota (remaining / total tokens) for a billing provider (DeepSeek or MiniMax).",
  parameters: Type.Object({
    provider: ProviderEnum,
  }),
};

export const billingTools: Tool[] = [getBalance, getPlanQuota];

// NOTE on execute handling:
// The pi-ai Tool interface has no execute field. Tool execution is done by
// pi-ai's agentLoop: the transport sends tools[] to the LLM, receives
// tool_call events, and the transport's stream function returns tool results.
// The runtime (runtime.ts) subscribes to tool_execution_start/end events and
// dispatches to the correct handler based on toolName.
// For billing tools, the handler would call invoke("get_provider_snapshot", ...)
// and return the Snapshot. This is T17's concern (wiring the event handler).