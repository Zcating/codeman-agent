# 0011 — V1 chat 域走 anthropic-messages-only 协议

> **Status**: accepted · 2026-06-15 · 推翻  的"多 provider 假设"

V1 chat 域（`AgentRuntime` → pi-ai）只接受 `anthropic-messages` 协议；
`Settings.llm_providers[].api_type` 字段字面量固定为 `"anthropic-messages"`，
runtime 不实现其它协议分支。V1 唯一内置 LLM provider = MiniMax（通过其官方
Anthropic 兼容端点 `https://api.minimaxi.com/anthropic`）。

## 为什么

V1 的实际 LLM 合作伙伴只有 MiniMax（V1 同时把它用作唯一 Billing provider），
其官方提供 Anthropic Messages API 兼容层（见 `https://platform.minimaxi.com/docs`）。
在唯一上游 + 唯一协议的 V1 范围内，多 provider 抽象（openai / anthropic / google / groq / ...）
是未发布的过设计 —— 没有用户会被它帮到，反而要在 runtime 里维护多套
header、API 字段映射、event 流转换，徒增 T35 范围和 type drift 修复成本。

## Considered Options

- **(A) 多 provider**（沿用 pi-ai 默认形态）—— V1 无需求，
  且会触发 T35 全量（`pi-ai.getModel()` 适配 + `as any` 清理）。
- **(B) OpenAI 兼容 only** —— MiniMax 也有 OpenAI 兼容端点
  `https://api.minimaxi.com/v1`，但 chat 团队明确要 anthropic-messages 协议
  （理由：原生 Anthropic SDK 生态、structured output、extended thinking）。
- **(C) OpenRouter / LiteLLM 中转** —— 引入第三方代理层；V1 不接受，
  与 的"无 Radix / 无 Kobalte"同理 —— 第三方抽象不在 V1 评估。

## Consequences

- **正面**：runtime.ts model 构造退化为单一字段路径；T35 最小补丁边界清晰；
  protocol 层只需测一条线（spec 04-llm-stream）。
- **负面**：失去 V1 阶段对 OpenAI 生态（GPT / DeepSeek chat / Qwen / Ollama）
  的直接接入能力 —— 未来若要接，必须支持 anthropic-messages 协议或新开 ADR
  推翻本决策。
- **不可逆**：本决策打破 的多 provider 假设；恢复多 provider
  需要新开 ADR 论证 why-multi-provider-again。

## Supersedes

- § 隐含的"pi-mono 多 provider 假设"（保留 的
  pi-ai 选择与 Agent 循环设计，只收窄协议到 anthropic-messages）。
