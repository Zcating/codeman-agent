# 0049 — Multi-Agents Plugin: Sub-Agent Delegation

**Status**: accepted · **Date**: 2026-08-03 · **Scope**: `src/renderer/src/plugins/multi-agents/` (新增) + `src/renderer/src/features/chat/lib/runtime.ts` (改 — 条件性注入 `delegate_task` tool) + `src/renderer/src/features/chat/components/chat-view.tsx` (改 — 集成 parallel-panel) + `src/main/features/settings/state.ts` + schema (改 — `Settings.subAgents: SubAgentConfig[]`) + `src/main/ipc.ts` (改 — 5 个新 IPC handler) + `src/preload/index.ts` (改 — expose `window.codeman.subAgents.*`) + `CONTEXT.md` (改 — 词汇表加 Multi-Agents 段)

**Related**: (锁定 pi-mono runtime — sub-agent 仍走 pi-mono `Agent` class), (per-conv 1 active 流 — sub-agent 在 tool execution 内运行,**不冲突**), (Queue-based runtime — sub-agent 工具调用是 tool execution,不触发 Conv active 流), (per-run transient agent — 每个 sub-agent 一次 `run()` 新建 `Agent`), (Bubble boundary — sub-agent 输出作为 tool result 进主 bubble,**不创建新 bubble**), ADR-0031/0032 (Skill/MCP 正交 — multi-agents 是新维度,不取代), (Renderer Plugin Registry — 新 plugin 沿用 `PluginDescriptor` 注册), (run_command AgentTool — multi-agents sub-agent 可调 run_command,作为其 allowedTools 之一)

## Context

### 触发：用户/产品 2026-08-03 提出

> "在插件处，增加 multi-agents 功能。"

2026-08-03 grill-with-docs session 锁定本 ADR 内容。

### 探查事实

- **pi-mono 无官方 multi-agent 样板**。官方 README 明确 *"Pi ships with powerful defaults but skips features like sub agents and plan mode."*。`AgentHarness` 是单 agent session 封装,无 `spawn` / `createSubAgent` / `delegate` 方法。
- **参考实现**: OpenAI Agents SDK `agent.as_tool(tool_name, tool_description, custom_output_extractor, max_turns)` — 把 `Agent` 实例包装成可调用 Tool。`as_tool` 返回的 `Tool` 在 execute 中跑 `Runner.run(agent, input)`,仅返回最终 output。**Mastra `AgentController.subagents[]`** — 父 agent 自动获得 `subagent` 工具,sub-agent 配置含 `allowedWorkspaceTools` / `defaultModelId`。本 ADR 以 OpenAI 模式为蓝本,Mastra 为扩展性参考。
- **codeman-agent 现状**: 单 `Agent` per conv,per-run transient 。`Agent` 类支持 `toolExecution: "parallel"`(默认),可在同一 turn 内并发执行多个 tool call — **天然支持并发 sub-agent**。
- **现有约束**: 每 conv 至多 1 active 流 ;bubble boundary = agent-turn boundary ;Skill/MCP 正交 (ADR-0031/0032);单 main webview 。

### 设计张力(grill 已收齐)

1. **multi-agents 语义是什么?**
   grill 决议:**Sub-agent 分发**。主 agent 委派子任务给 sub-agent,sub-agent 跑完返回结果,主 agent 整合。
   - 拒绝「多 Session」(本质是扩展现有 session 模型,不算真正的多 agent 协作)
   - 拒绝「Supervisor 编排」(需要新 Orchestrator 抽象,超出 V1 范围)
   - 拒绝「Agent-as-Tool」(语义上 V1 就是 Agent-as-Tool,但用户语言叫"sub-agent")
   - 拒绝「角色分工协作群」(共享上下文,需要新会话模型,违反 Non-goals "无分支会话")
2. **「插件处」位置?**
   grill 决议:**Plugin + Runtime 双层**。新 plugin descriptor + 扩展 runtime.ts。
3. **pi-mono 是否有样板?**
   grill 决议:**无官方实现**,参考 OpenAI Agents SDK `agent.as_tool()`。
4. **sub-agent 配置来源?**
   grill 决议:**用户自定义**(设置面板 CRUD)。无 ship-with-app preset,无 marketplace。
5. **sub-agent 上下文?**
   grill 决议:**隔离**。Sub-agent 仅接收主 agent 传入的 task 文本,看不到主 conv 历史。
   - 拒绝「共享」(token 消耗高,上下文窗可能爆)
   - 拒绝「Summary」(主 agent 需先 summarize,多一层开销,V2+ 评估)
6. **sub-agent 工具集?**
   grill 决议:**用户在每个 sub-agent 配置中选**(`allowedTools: string[]`)。不允许「同主 agent 全可用」(安全风险)。
7. **并发模式?**
   grill 决议:**并行(默认 parallelism)**。主 agent 一个 turn 可调多次 `delegate_task`,sub-agent 并发跑。
   - 拒绝「串行」(延迟高)
8. **并发 UI?**
   grill 决议:**独立面板**。每个 sub-agent 一列,实时 streaming。
   - 拒绝「折叠进 tool result」(长并行输出挤占主 bubble)
   - 拒绝「最小汇总」(看不到过程,失去并行优势)
9. **返回结果格式?**
   grill 决议:**仅最终文本**。Sub-agent 最终 assistant message text 作为 tool result content。
   - 拒绝「完整过程」(token 高,主 agent 不需要看过程细节)
10. **配置存储?**
    grill 决议:**全局 electron-store**(与 Provider 同级)。
    - 拒绝「Workspace 级」(V1 简化,workspace 隔离 V2+ 评估)
11. **主 Agent 工具形式?**
    grill 决议:**单个 generic `delegate_task(agent_name, task)` tool**。Main agent 只需记 sub-agent 名,工具列表不增长。
    - 拒绝「N 个专属 `delegate_to_<name>` tool」(工具列表随 sub-agent 增长而膨胀,prompt bloat)
12. **Sub-agent 能否递归?**
    grill 决议:**V1 不允许递归**。Sub-agent factory 注入工具时不包含 `delegate_task` 本身,避免递归爆炸。

## Decision

### D1 — SubAgentConfig: 用户级配置 shape

```typescript
// src/renderer/src/plugins/multi-agents/lib/sub-agent.types.ts
export type SubAgentId = string;

export interface SubAgentConfig {
  readonly id: SubAgentId;                // uuid v7
  readonly name: string;                  // 用户定义, e.g. "Researcher" — 也是 tool 的 agent_name 参数值
  readonly description: string;           // 一行描述,用于 tool description 动态列表
  readonly systemPrompt: string;          // sub-agent 独立 system prompt
  readonly modelId: string;               // 引用 Provider.llm.models[].id
  readonly thinkingLevel: ThinkingLevel;  // "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
  readonly allowedTools: readonly string[];  // 工具名白名单(全局工具名空间)
  readonly enabled: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}
```

**约束**:
- `name` 在所有 enabled sub-agent 内**唯一**(dispatcher 用 name 做 Map key);重复 → Settings UI 拒绝保存。
- `allowedTools` 必须是当前可用工具名空间内的真名(主 agent 可见的 tool 名)。若工具名后续被禁用,sub-agent 启动时**静默跳过该 tool**(per fallback 风格)。
- `modelId` 必须 = `Provider.llm.models[].id`(Default Model Invariant)。删除/禁用 model 后,sub-agent 配置保留 `modelId` 但启动时校验失败 → Settings UI 标灰。

### D2 — 配置持久化: Settings.subAgents(全局 electron-store)

```typescript
// src/main/features/settings/state.ts 扩展
interface Settings {
  // ... existing fields
  subAgents: SubAgentConfig[];   // 新增, 默认 []
}
```

走 既有 Settings JSON 档,不引新 SQLite 表(与 Skills `enabledSkills` / MCP server config 同档原则一致)。

### D3 — IPC 接口: 5 个 handler

```typescript
// src/main/ipc.ts (改)
ipcMain.handle("subAgents:list", () => settings.get("subAgents"));
ipcMain.handle("subAgents:add", (_, config: SubAgentConfig) =>
  settings.set("subAgents", [...settings.get("subAgents"), config]),
);
ipcMain.handle("subAgents:update", (_, id: SubAgentId, patch: Partial<SubAgentConfig>) =>
  settings.set("subAgents", settings.get("subAgents").map((c) => c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c)),
);
ipcMain.handle("subAgents:delete", (_, id: SubAgentId) =>
  settings.set("subAgents", settings.get("subAgents").filter((c) => c.id !== id)),
);
ipcMain.handle("subAgents:setEnabled", (_, id: SubAgentId, enabled: boolean) =>
  settings.set("subAgents", settings.get("subAgents").map((c) => c.id === id ? { ...c, enabled, updatedAt: Date.now() } : c)),
);
```

`src/preload/index.ts` 暴露 `window.codeman.subAgents.{list, add, update, delete, setEnabled}`,renderer 走 Service Tag + Live Layer 包装(与 `McpService` / `SkillsService` 同模式)。

### D4 — Sub-Agent Factory: 隔离的 Agent 实例

```typescript
// src/renderer/src/plugins/multi-agents/lib/sub-agent-factory.ts
export function createSubAgent(
  config: SubAgentConfig,
  baseProvider: ProviderConfig,
  toolRegistry: ToolRegistry,
): Agent {
  const tools = config.allowedTools
    .map((name) => toolRegistry.get(name))
    .filter((t): t is AgentTool => t !== undefined);
  // 关键: 明确不注入 delegate_task 工具,避免递归 (V1 grill 决议)
  const toolsWithoutDelegate = tools.filter((t) => t.name !== "delegate_task");
  const model = buildModel(baseProvider, config.modelId);
  return new Agent({
    initialState: {
      systemPrompt: config.systemPrompt,
      model,
      thinkingLevel: config.thinkingLevel,
      tools: toolsWithoutDelegate,
      messages: [],
    },
    streamFn: anthropicStream,
    getApiKey: async () => baseProvider.apiKey ?? undefined,
    toolExecution: "sequential",  // sub-agent 内部默认 sequential(并发已在 dispatcher 层解决)
  });
}
```

**关键安全保证**:`toolsWithoutDelegate` 过滤掉 `delegate_task`,sub-agent 永远无法递归。V1 决定。

### D5 — Delegate Task Tool: 单个 generic dispatcher

```typescript
// src/renderer/src/plugins/multi-agents/lib/delegate-task-tool.ts
export function buildDelegateTaskTool(
  enabledConfigs: readonly SubAgentConfig[],
  baseProvider: ProviderConfig,
  toolRegistry: ToolRegistry,
  onStreamEvent: (event: AgentEvent, toolCallId: string, subAgentId: SubAgentId) => void,
): AgentTool {
  const configByName = new Map(enabledConfigs.map((c) => [c.name, c]));
  const descriptionList = enabledConfigs.map((c) => `- ${c.name}: ${c.description}`).join("\n");
  return {
    name: "delegate_task",
    label: "Delegate Task",
    description:
      `Delegate a task to one of the configured sub-agents. ` +
      `Each sub-agent runs in isolation (fresh context) with its own model and allowed tools. ` +
      `Multiple delegate_task calls in the same turn run in parallel.\n\n` +
      `Available sub-agents:\n${descriptionList}`,
    parameters: Schema.Struct({
      agent_name: Schema.String({
        description: `Name of the sub-agent. Must be one of: ${enabledConfigs.map((c) => c.name).join(", ")}`,
      }),
      task: Schema.String({ description: "The task to delegate to the sub-agent" }),
    }),
    executionMode: "parallel",  // 主 agent 同 turn 可调多次
    execute: async (toolCallId, params, signal) => {
      const config = configByName.get(params.agent_name);
      if (!config) {
        throw new Error(
          `Unknown sub-agent "${params.agent_name}". Available: ${[...configByName.keys()].join(", ")}`,
        );
      }
      const subAgent = createSubAgent(config, baseProvider, toolRegistry);
      const unsubscribe = subAgent.subscribe((event) => {
        onStreamEvent(event, toolCallId, config.id);
      });
      try {
        const result = await subAgent.prompt(params.task, undefined, { signal });
        if (result.stopReason === "error") {
          throw new Error(result.errorMessage ?? "sub-agent error");
        }
        const finalText = result.content
          .filter((c): c is TextContent => c.type === "text")
          .map((c) => c.text)
          .join("\n");
        return {
          content: [{ type: "text", text: finalText }],
          details: {
            subAgentId: config.id,
            subAgentName: config.name,
            model: config.modelId,
            usage: result.usage,
          },
        };
      } finally {
        unsubscribe();
        await subAgent.abort();
      }
    },
  };
}
```

**关键设计点**:
- **工具名固定** `delegate_task`(不随 sub-agent 数量变化),主 agent 系统 prompt 稳定。
- **agent_name 动态列表**: tool description 内嵌 enabled sub-agent 列表,LLM 直接看到可用选项。
- **executionMode: "parallel"**: 配合 pi-mono `Agent.toolExecution` 默认值,主 agent 一个 turn 调多次 `delegate_task` 时并发执行。
- **agent_name 验证**: dispatcher Map 查找,unknown name throw → tool result 报错给主 agent → 主 agent 自行调整。
- **返回仅最终文本**: per D6 grill 决议。

### D6 — Runtime 集成: 条件性注入 delegate_task tool

```typescript
// src/renderer/src/features/chat/lib/runtime.ts (改, line 313-315 附近)
const enabledSubAgents = Object.values(subAgentsState.byId).filter((s) => s.enabled);
const delegateTaskTool = enabledSubAgents.length > 0
  ? buildDelegateTaskTool(enabledSubAgents, provider, toolRegistry, onStreamEvent)
  : null;
const tools = [
  ...fileTools,
  webfetchTool,
  ...mcpTools,
  loadSkillTool,
  ...(delegateTaskTool ? [delegateTaskTool] : []),
];
```

**关键**: 当用户**未配置任何 enabled sub-agent** 时,**不注入** `delegate_task` 工具(避免给 LLM 投毒)。per runtime 是 per-run transient,用户修改 sub-agent 配置后**下一次主 agent 消息**即生效。

### D7 — Stream State: 独立 Solid store 记录并发 sub-agent 流

```typescript
// src/renderer/src/plugins/multi-agents/stores/sub-agents-stream.store.ts
interface SubAgentStreamEntry {
  toolCallId: string;
  subAgentId: SubAgentId;
  subAgentName: string;
  events: AgentEvent[];
  status: "running" | "completed" | "error";
  startedAt: number;
  completedAt?: number;
  finalText?: string;
  error?: string;
}

const [streamState, streamActions] = createStore<{
  byToolCall: Record<string, SubAgentStreamEntry>;  // key = toolCallId
}>({ byToolCall: {} });
```

`onStreamEvent` 回调:
- 首次事件(`agent_start`)→ 创建 entry,status: "running"
- 后续 `message_update` → append 到 events[]
- `agent_end` → status: "completed",记录 finalText + completedAt
- 异常 → status: "error",记录 error

**清理时机**:`tool_execution_end` 时 entry 保留在 store(展示结果),用户滚动过远时按 LRU 清理(暂定 50 条)。

### D8 — UI: Settings Tab + Parallel Panel

**Settings Tab**(`src/renderer/src/plugins/multi-agents/components/settings-tab.tsx`):
- 列出所有 sub-agent(name + description + model + tool count + enabled toggle)
- 「+ Add sub-agent」按钮 → 弹 Codeman Dialog 编辑表单(基于 form 模式 per)
- 每条 sub-agent 行右侧 edit / delete
- 表单字段:name / description / systemPrompt(多行 textarea)/ modelId(Select)/ thinkingLevel(Select)/ allowedTools(多选 chips)

**Parallel Panel**(`src/renderer/src/plugins/multi-agents/components/parallel-panel.tsx`):
- 在 chat-view 中,当检测到 `delegate_task` toolCall 进入 `tool_execution_start` 时,在消息流下方插入 parallel-panel
- 每列 = 一个 sub-agent stream,列内显示:sub-agent 名 + status badge + live streaming markdown
- 列宽自适应,2 列 / 3 列布局
- `tool_execution_end` 后,所有列保留 + 状态变 "completed",用户可折叠整组

### D9 — Plugin 注册: 沿用 PluginDescriptor 模式

```typescript
// src/renderer/src/plugins/multi-agents/index.ts (新增)
import { pluginRegistry } from "@/plugins/lib/plugin-registry";
import type { PluginDescriptor } from "@/plugins/lib/plugin-registry.types";

export const multiAgentsDescriptor: PluginDescriptor = {
  id: "multi-agents",
  initialize: Effect.succeed(undefined),  // 无需初始化
  route: { path: "/plugins/multi-agents", label: "Sub-Agents" },
  sidebar: { icon: "users", order: 30, visible: true },
};
```

`src/renderer/src/plugins/index.ts` 改 1 行:加 `pluginRegistry.registerPlugin(multiAgentsDescriptor)`。Per 单插件失败不阻塞首屏。

### D10 — 跨文件影响

| 文件 | 改动 |
|---|---|
| `src/renderer/src/plugins/multi-agents/` | **新增整树**(descriptor / types / factory / dispatcher tool / stores / components) |
| `src/renderer/src/plugins/multi-agents/lib/sub-agent.types.ts` | 新增 — `SubAgentConfig` / `SubAgentId` |
| `src/renderer/src/plugins/multi-agents/lib/sub-agent-factory.ts` | 新增 — `createSubAgent()` |
| `src/renderer/src/plugins/multi-agents/lib/delegate-task-tool.ts` | 新增 — `buildDelegateTaskTool()` |
| `src/renderer/src/plugins/multi-agents/stores/sub-agents.store.ts` | 新增 — Solid store + IPC bridge |
| `src/renderer/src/plugins/multi-agents/stores/sub-agents-stream.store.ts` | 新增 — 并发 stream state |
| `src/renderer/src/plugins/multi-agents/components/settings-tab.tsx` | 新增 — CRUD UI |
| `src/renderer/src/plugins/multi-agents/components/parallel-panel.tsx` | 新增 — 并发面板容器 |
| `src/renderer/src/plugins/multi-agents/components/sub-agent-stream.tsx` | 新增 — 单 sub-agent streaming |
| `src/renderer/src/plugins/multi-agents/index.ts` | 新增 — barrel + descriptor |
| `src/renderer/src/plugins/index.ts` | 改 1 行 — 注册 multi-agents 插件 |
| `src/renderer/src/features/chat/lib/runtime.ts` | 改 ~15 行 — 条件性注入 `delegate_task` tool + stream callback |
| `src/renderer/src/features/chat/components/chat-view.tsx` | 改 ~30 行 — ToolCall 检测 `delegate_task` 时挂载 parallel-panel |
| `src/main/features/settings/state.ts` + schema | 改 — `Settings.subAgents: SubAgentConfig[]` |
| `src/main/ipc.ts` | 改 — 5 个新 IPC handler |
| `src/preload/index.ts` | 改 — expose `window.codeman.subAgents.*` |
| `src/renderer/shared/lib/ipc.ts` | 改 — `SubAgentsService` Tag + Live Layer |
| `CONTEXT.md` | 改 — 词汇表加 Multi-Agents / Sub-Agent / Delegate Task Tool / Parallel Panel 段 |
| `docs/adr/0049-multi-agents-sub-agent-delegation.md` | 本 ADR |

## Considered Options

### Sub-agent 语义(已决议 Sub-agent 分发)

- **拒绝「多 Session」**: 本质是扩展现有 session 模型,不算真正多 agent。
- **拒绝「Supervisor 编排」**: 需要新 Orchestrator 抽象,超出 V1 范围。
- **拒绝「角色分工协作群」**: 共享上下文,需要新会话模型,违反 Non-goals "无分支会话"。

### 工具形式(已决议 单个 generic dispatcher)

- **拒绝「N 个 `delegate_to_<name>`」**: 工具列表随 sub-agent 增长而膨胀,prompt bloat。
- **拒绝「两者都要」**: 复杂度上升,选择压力小。

### 并发(已决议 parallel by default)

- **拒绝「串行」**: 延迟高,无法满足用户「主 agent 委派多个调研任务并发」用例。
- **拒绝「并发 + UI 折叠」**: 折叠进 tool result 与现有 MCP tool call 视觉无差异,失去并行感。

### Sub-agent 递归(已决议 V1 不允许)

- **拒绝「允许 + depth limit」**: V1 简化原则,任何"部分允许"会增加 surface 风险。
- **拒绝「允许 + canDelegate 字段」**: V1 简化原则,V2+ 再评估。

### 配置存储(已决议 全局)

- **拒绝「Workspace 级」**: V1 简化。
- **拒绝「全局 + workspace 覆盖」**: V1 简化。

## Consequences

### 正面

- **端用户有「多 agent 协作」入口**: 从 0 → 1 跨越。Settings 即可配置,不依赖外部生态。
- **Pi-mono 之上的纯 DIY 实现**: 无新依赖,无外部 SDK。借鉴 OpenAI `agent.as_tool()` 已验证模式。
- **与 Skill/MCP 正交**: 多 agent 是新维度,不取代 Skill(知识)/MCP(能力)。Sub-agent 可调用 Skill 工具 + MCP 工具 + 文件工具。
- **Per-run transient 兼容**: Sub-agent 每次 `run()` 新建 Agent,符合。无状态泄露。
- **Bubble boundary 不破坏**: Sub-agent 输出作为 tool result 进主 bubble,UI 无新 bubble 概念,符合。
- **并发原生支持**: pi-mono `toolExecution: "parallel"` 默认值天然支持多 sub-agent 并发。

### 代价

- **Token 成本放大**: 并发 sub-agent 多次 LLM 调用,需 Settings UI 加 budget 显示(V2+ 评估)。
- **错误处理面增加**: sub-agent 失败 / timeout / 用户取消 / unknown agent_name 需 UI 反馈。
- **Plugin 启动开销**: 启动时 plugin registry 注册 multi-agents(几乎 0 开销,沿用)。
- **runtime.ts 改造 ~15 行**: 共享文件改动,影响 chat feature 主路径。

### 不可逆性

推翻本 ADR 需:
- 删 `src/renderer/src/plugins/multi-agents/` 全树
- 回退 `runtime.ts` `delegate_task` 注入
- 回退 settings-schema `subAgents` 字段
- 回退 chat-view.tsx parallel-panel 集成
- 回退 5 个 IPC handler
- 撤回本 ADR + 重写

总改动 ≥ 12 文件 + 1 ADR。成本中等 → 不可逆标记成立(但恢复可行)。

## References

- OpenAI Agents SDK `agent.as_tool()`: https://github.com/openai/openai-agents-python/blob/main/examples/agent_patterns/agents_as_tools.py
- Mastra `AgentController.subagents[]`: https://mastra.ai/docs/agent-controller/subagents
- pi-mono Agent class: `node_modules/@earendil-works/pi-agent-core/dist/agent.d.ts`
- pi-mono README 节选: *"Pi ships with powerful defaults but skips features like sub agents and plan mode."*
- 现有 PluginRegistry 模式: + `src/renderer/src/plugins/lib/plugin-registry.ts`
- runtime.ts 集成点: + +
- Skill/MCP 正交职责: +
- grill-with-docs session 2026-08-03 — 决议依据
- 计划原文: `.omo/plans/multi-agents-plugin.md`