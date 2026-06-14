//! 注册到 agent 的 Billing 工具。
//!
//! T1 工具桥接（ADR 0002）：工具定义存在于 TS（此处），
//! handlers 通过 Tauri IPC 命令调用 Rust 适配器。
//!
//! 注意：与 T18 spec 中的模板不同，安装的 pi-agent (0.9.0) 和
//! pi-ai (0.73.1) **不**导出带 `execute` 字段的 `tool()` 工厂。
//! 实际 API 是 pi-ai 的纯 `Tool` 接口（name、description、parameters）。
//! 工具执行由 pi-ai 的 agentLoop 通过 ProviderTransport 处理 — transport
//! 将 tools 传递给 LLM 并接收 tool_call 事件；没有 per-tool execute 回调。
//!
//! 如果新版 pi-mono 添加了带 `execute` 的 `tool()`，可以重构此文件
//! 使用该 API。目前，我们导出纯 Tool 对象。
//!
//! Effect 签名：
//!   get_balance、get_plan_quota：每个接受一个 provider id，返回
//!   Snapshot（Balance | PlanQuota）。错误通过 Tauri 命令的
//!   Result<T, AppError> 传播。

import { Type } from "@mariozechner/pi-ai";
import type { Tool } from "@mariozechner/pi-ai";

// 注意：模板显示了 `import { tool } from "@mariozechner/pi-agent"` 但该
// 导出在 pi-agent 0.9.0 中不存在。我们使用实际的 pi-ai Tool 接口。
// 还要注意 pi-ai 使用 TypeBox，不是 Zod。我们将 Zod enum 转换为 TypeBox enum。
const ProviderEnum = Type.Union([Type.Literal("deepseek"), Type.Literal("minimax")]);

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

// 关于 execute 处理的注意：
// pi-ai Tool 接口没有 execute 字段。工具执行由 pi-ai 的 agentLoop 完成：
// transport 将 tools[] 发送给 LLM，接收 tool_call 事件，
// transport 的 stream 函数返回工具结果。
// runtime（runtime.ts）订阅 tool_execution_start/end 事件并根据 toolName
// 分发到正确的 handler。
// 对于 billing 工具，handler 会调用 invoke("get_provider_snapshot", ...)
// 并返回 Snapshot。这是 T17 的工作（连接事件 handler）。
