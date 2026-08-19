# ADR 0002 — pi-mono 作为 agent 运行时

- Status: Accepted
- Date: 2026-06-13
- Scope: codeman-agent V1 agent 层
- Supersedes: none
- Related: ADR 0001 (Tauri 2 + Solid.js 壳)

## Context

codeman-agent 从被动计费 widget 转型为主动桌面 AI agent。
V1 需要一个真正的 LLM agent loop，支持工具调用、流式输出与
provider 抽象。我们评估了从零构建 loop vs 引入现有 TypeScript
agent 框架两种方案。

## Decision

采用 **pi-mono**（https://github.com/badlogic/pi-mono）作为
agent 运行时；agent loop 与 LLM provider 抽象由
`@mariozechner/pi-agent` 与 `@mariozechner/pi-ai` 提供。
计费工具以 TypeScript 端 `@tool()` 条目形式注册，其 handler
通过 Tauri IPC 命令调用 Rust adapter（"T1" 工具桥接模式）。

## Considered options

- **T1（已选）** —— TS 端工具注册。agent loop 位于 Tauri
  webview；工具定义在 agent 代码旁；tool handler 通过
  `invoke()` 调用 Rust。
- **T2 —— Rust 端 MCP server。** pi-agent 作为 MCP client。
  拒绝：多一层进程边界、每次工具调用 +50–200ms 延迟、生命周期
  代码更多。
- **T3 —— 自定义 RPC bridge。** 拒绝：没有收益，只有 T2 的
  复杂度加上非标准协议。

## Consequences

- agent loop 绑定到 Tauri webview（V8 / Chromium 内核）。这对
  `fetch` 形式的 LLM 调用没问题；Node 专属 API（如 `fs`、
  `process`）不可用。我们规避任何直接触文件系统的 pi-mono
  代码路径 —— 所有 file 形态的东西走 Tauri 命令。
- 工具 input / output schema 定义两次：一次为 TS 端 Zod schema
  （给 pi-agent），一次为 Rust 端 `Deserialize` impl（给
  adapter）。两者漂移是 silent-bug 来源。我们接受为 V1 技术
  债，并在 `src/agent/tools/billing.ts` 中加注释标记。
  `ts-rs` / `specta` codegen 已列入 V2 路线图。
- 工具调用从 agent 视角是同步的：LLM 阻塞直到工具返回。长时
  计费 API 调用（如 30s 超时）会冻结 agent。我们接受为 V1
  行为；流式 tool result 在 V2。
- LLM provider 支持以 pi-mono 发布版为准：他们加 provider 我
  们就拥有，他们删 provider 我们就失去。本仓不写任何
  bespoke provider 代码。

## References

- pi-mono：https://github.com/badlogic/pi-mono
- @mariozechner/pi-ai：LLM provider 抽象
- @mariozechner/pi-agent：agent loop
