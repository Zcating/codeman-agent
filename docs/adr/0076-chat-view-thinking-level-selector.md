# — Chat-View Thinking Level Selector (per-run transient)

**Status**: accepted · **Date**: 2026-08-17

## Context

主 Agent 的 `thinkingLevel` 在 `runtime.ts::buildAgent` 写死 `opts.thinkingLevel ?? 'medium'`,主 Agent 装配路径不传该参数 → 主 Agent 永远以 medium 思考,用户无法控制。子代理已可通过 `MultiAgentConfig.thinkingLevel` 配置。

pi-agent 语义:`thinkingLevel` 是 per-run 的 `Agent` 构造参数,库自身不持久化 —— 存哪里完全是应用层决定。

opencode 语义:无 chat UI 思考强度选择器。pi-ai wire 层:`thinkingLevel` → `reasoning` → Anthropic `thinking` 字段。

## Decision

### D1. 选择器形态与位置
chat-view 输入栏在 Provider select 之后加一个紧凑下拉,与 Agent / Provider 控件同排。级别集合 = 全 6 级 `off / minimal / low / medium / high / xhigh`。

### D2. 取值语义:per-run 临时态,不持久化
chat-view 持有会话内值,每次 `sendMessage` 时读取传入。不做 per-conversation 持久化,不做 localStorage 偏好,不做 Settings 全局项。

默认值跟随所选 agent。agent 切换时同步;无 agent 可选时回退 `medium`。用户可手动覆盖。

### D3. 模型能力联动:不支持 thinking 时隐藏选择器
选中模型 `ModelMeta.thinking !== true` 时选择器不渲染。切换回支持思考的模型时选择器重现。

### D4. 传输链路
```
chat-view 选择器 → sendMessage(id, text, provider, systemPrompt, thinkingLevel)
  → MainRuntimeRunOptions.thinkingLevel
    → CreateLLMRuntimeOptions.thinkingLevel
      → buildAgent({ thinkingLevel })
        → pi Agent.initialState.thinkingLevel
```

## Consequences

主 Agent 默认行为完全不变(跟随 agent 配置,无 agent 时 `medium`),无迁移、无 schema 变更。切换模型时选择器随模型能力显隐。
