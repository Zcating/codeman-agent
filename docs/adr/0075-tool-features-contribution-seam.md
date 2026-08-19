# — 工具类插件并入 features：Tool Contribution seam + 侧边栏工具组

**Status**: accepted · 2026-08-14

## Context

### 1. ADR-0068/0070/0071/0073 之后 plugins/ 概念退化

ADR-0068 建立 `core/` 层、ADR-0070 建立 `LLMRuntime` 胶囊、ADR-0071 把六类工具（含 `load-skill` / `mcp` / `delegate-task`）全部迁入 `core/tools/`。此后 renderer 侧 plugins 只剩：settings tab + store（CRUD）+ IPC adapter + 导航元数据 —— 与 features 的文件布局（components/stores/lib）、IPC 模式、settings-tab 模式**没有任何结构性差异**。

ADR-0035/0037 建 plugins/ 的理由（"用户业务扩展、与 core flow 语义分离、独立 IPC 命名空间"）不再成立：**插件不再拥有任何执行能力**，扩展语义只剩一个目录名。deletion test：删除 plugins/ 不收敛复杂性，只把导航元数据与初始化摊回组合根 —— 通过。

### 2. chat runtime 仍是唯一 feature→plugin 逆流

`features/chat/lib/runtime.ts` import 3 个 multi-agents 模块（类型 / runner 工厂 / stream store），并亲手定义 `onStreamEvent` 写 plugin 的 Solid store。chat 拥有 plugin 的生命周期知识（拉列表、滤 enabled、建 toolRegistry、投影事件）—— 装配责任放错了模块。

### 3. multi-agent runner 本可归位 core

ADR-0071 Amendment 把 `createMultiAgentRunner` 留在 plugin 侧的唯一动机是"避免 core→plugin"。但 `MultiAgentConfig` 的 schema 真身在跨进程 `src/shared/lib/multi-agent-schema.ts`（core 已 import `ThinkingLevel`）—— 动机消失，runner 应迁回 core。runner 唯一不能做的是写 feature 的 UI store —— 经 deps 的事件 sink 解决。

### 4. 侧边栏需要表达新的分层

五个页面同挂「插件」组下，但架构上已经分裂为「工具类配置 feature」（skills/mcp/multi-agents）与「业务扩展 plugin」（automations）。侧边栏应镜像分层：插件组上方增加「工具」组。

## Decision

### D1. skills / mcp / multi-agents 迁入 `features/`；plugins/ 收缩为 automations

`src/renderer/src/plugins/{skills,mcp,multi-agents}/` → `src/renderer/src/features/{skills,mcp,multi-agents}/`（git mv，机械 move）。Plugin Registry保留，仅服务 automations（initialize + 导航）。

三个迁移 feature 的语义：**纯配置 + 展示**（CRUD + settings tab + 各自 UI）。执行能力全部在 core：

| 能力         | 执行位置                                                                  | 配置/展示位置                                          |
| ------------ | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| Skills       | `core/tools/load-skill/`（loadSkillTool）+ `core/llm/build-system-prompt` | `features/skills/`（CRUD + slash menu）                |
| MCP          | `core/tools/mcp/`（buildMcpTools）                                        | `features/mcp/`（CRUD）                                |
| Multi-Agents | `core/tools/delegate-task/`（runner，见 D3）                              | `features/multi-agents/`（CRUD + contribution，见 D2） |

**修订**：ADR-0035（renderer plugin registry）与 ADR-0037（plugins top-level architecture）在本 ADR 范围内被修订 —— 注册表保留但成员收缩；"plugin = 用户业务扩展"的语义仅对 automations 成立。

### D2. `core/llm/tool-contributions.ts`：Tool Contribution seam

```typescript
export interface ToolContributionContext {
  readonly provider: ProviderConfig;
  readonly baseToolTypes: readonly ToolType[]; // 不含 delegate-task
  readonly emitSubagentEvent: (toolCallId: string, e: CoreRuntimeEvent) => void;
}
export interface ToolContribution {
  readonly id: string;
  readonly provide: (ctx: ToolContributionContext) => Effect.Effect<readonly ToolType[], AppError>;
}
export const registerToolContribution: (c: ToolContribution) => void;
export const getToolContributions: (ctx) => Effect.Effect<readonly ToolType[], AppError>;
```

- **features/multi-agents** 启动时注册 contribution：MultiAgentsApi 拉配置 → enabled 过滤 → 组装 `{ type: 'delegate-task', agents, run }`；事件经 `ctx.emitSubagentEvent` sink 投影为 `CoreRuntimeEvent`
- **chat runtime** 装配：`toolTypes = [...baseToolTypes, ...(yield* getToolContributions(ctx))]`；`emitSubagentEvent` 写 chat 自己的 delegate-streams store。**chat 不再 import 任何 feature**
- **automations 不注册 contribution**（它不向主 agent 注入工具）

### D3. multi-agent runner 迁回 core；胶囊增加子代理构造模式

- `plugins/multi-agents/lib/{multi-agent-runner,multi-agent-factory}.ts` → `core/tools/delegate-task/multi-agent-runner.ts`（ADR-0071 Amendment **反转**）：`createMultiAgentRunner({ configs, provider, subAgentToolTypes, onEvent })` 在 core 内做 allowedTools name 过滤 + 子代理构造 + 执行 + 结果收集
- `core/llm/runtime.ts` 胶囊增加**子代理构造模式**：接收 name 过滤后的 `AgentTool[]` + `modelId` / `thinkingLevel` 覆盖，返回同构 `LLMRuntime`。`buildAgent` 停止 export（pi-agent `Agent` / `AgentEvent` 不再跨出 core）
- 顺带消除三重工具实例化：chat.store 的 snippets 派生、chat runtime 的 toolRegistry、createLLMRuntime 的 createTool 收敛为一处装配（`buildToolSet(toolTypes) → { tools, snippets }`）；`delegate_task` 进入系统提示

### D4. Parallel Panel + stream store 迁入 `features/chat/`

`plugins/multi-agents/components/{parallel-panel,multi-agent-stream}.tsx` + `stores/multi-agents-stream.store.ts` → `features/chat/components/` + `features/chat/stores/delegate-streams.store.ts`。stream store **收窄为结果型**：`{ toolCallId, agentId, agentName, status, finalText?, usage?, error? }`，删除 `events: AgentEvent[]`（写而不读的死数据 + pi 类型泄漏）。

归属论证：multi-agents 是纯配置 feature，流展示状态（主 agent turn 内 delegate 子流）是 chat-view 的呈现状态，不是 multi-agents 的配置域。

### D5. 类型与工具泄漏清理

| 边                                                                                                      | 处理                                                                  |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `shared/apis/multi-agents.api.ts` / `invoke.api.ts` / `automations` / `chat runtime` → plugin 类型 shim | 直连 `@shared/lib/multi-agent-schema`，删 `multi-agent.types.ts` shim |
| `plugins/multi-agents/components/multi-agent-stream.tsx` → `features/chat/lib/markdown`                 | `renderMarkdown` 下沉 `shared/lib/`                                   |
| `plugins/skills/components/settings-tab.tsx` → `features/settings/lib/settings-saver`                   | `settingsSaver` 下沉 `shared/lib/`                                    |
| `plugins/multi-agents/components/settings-tab.tsx` → `features/chat/lib/build-enabled-providers`        | `buildEnabledProviders` 归 `core/llm/`（provider-config 旁）          |
| `shared/apis/webfetch.api.ts` → `core/tools/webfetch/html-to-markdown`                                  | `html-to-markdown` 下沉 `shared/lib/`                                 |

### D6. 侧边栏「工具」组 + `/tools/*` 路由

- 新增**工具组**（折叠组，位于「插件」组上方），成员 skills / mcp / multi-agents。条目元数据 = **feature barrel 静态 manifest**：各 `features/<name>/index.ts` 导出 `{ id, label, path, icon }`；chat-sidebar 静态 import 组装（与 router.tsx 静态 import route 同模式，无注册机制）
- 路由 `{/plugins/skills,/plugins/mcp,/plugins/multi-agents}` → `/tools/{skills,mcp,multi-agents}`；`/settings/{skills,mcp}` redirect 同步更新；isActive 拆 `/tools` 与 `/plugins` 前缀；onMenuSelect 按 manifest path / registry path / conv id 三级分发
- 插件组收缩为 automations，`PLUGIN_ICONS` 静态表仅服务 registry 成员（feature 自带 icon）

### D7. bootstrap 直调

skills / mcp 的 store 初始化与 multi-agents 的 contribution 注册改由 `main.tsx` 直调各 feature barrel（取代 registry 的 `initialize` 生命周期）；automations 仍走 registry `initializeAutomations()`。

## Alternatives considered

### Alt-1: 全搬 4 个 plugin（含 automations）进 features

- 拒绝：automations（调度 + LLM action 编排）是**持有编排的 feature**，与"纯配置"的迁移三个不是一类；plugins/ 保留这个成员让 registry 生命周期继续有意义（automations 有真实 initialize）。

### Alt-2: chat.store composition root 直连 multi-agents contribution（无注册表）

- 拒绝：保留一条 feature→feature 边在 chat 主装配路径上，与"chat 零感知 feature"的目标冲突。seam 只有 ~30 行（Map + register + get）。

### Alt-3: 侧边栏元数据走 shared 导航注册表

- 拒绝：与 tool-contribution 注册表（core）+ plugin-registry 并存三种注册机制，概念分裂。静态 manifest 是组合根显式配置，router 已同模式。

### Alt-4: 保持 /plugins/\* 路由

- 拒绝：路径命名与分组语义脱节（工具组条目导航到 /plugins/\*），isActive 前缀判断无法区分两组。

## Consequences

### 正面

- **依赖方向归零**：core → features/plugins 零引用（D3/D5 后保持）；plugin → feature 零边；chat → feature 仅剩导航 manifest 静态 import（chat-sidebar，D6 机制本身）与 skillsManifests$ 数据读（chat-view/home 斜杠菜单，沿用 pre-V3.3）
- **multi-agent 装配收敛**：runner 在 core（一处构造）、contribution 在 feature（一处配置）、事件 sink 在 chat（一处展示）—— 三重实例化与 AgentEvent 泄漏消除
- **侧边栏镜像架构**：工具组 = 能力配置，插件组 = 业务扩展；路由 /tools/\* 与分组同构
- **stream store 瘦身**：删 events 数组，store 与 pi 类型解耦
- **测试面**：chat runtime 测试删除全部 multi-agents mock；core 新增 runner 单测（胶囊子代理模式）

### 负面

- 目录 churn：3 个 feature move + 路由 + 侧边栏 + bootstrap，~40 文件 import 路径调整
- contribution seam 是新机制（~30 行 + 测试），chat runtime 需要理解 `getToolContributions` 契约
- stream store 从 multi-agents 迁 chat 是域语义决策 —— 后续维护者需知道"delegate 子流展示状态归 chat"

## Migration（6 commits）

| Commit | Scope                                                                                                                                                 | 验证门                                     |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| C1     | D5：类型/工具泄漏归位（shim 删除直连 shared；markdown/settingsSaver/html-to-markdown 下沉 shared；buildEnabledProviders 归 core/llm）                 | typecheck + 全量 vitest                    |
| C2     | D3：胶囊子代理模式 + `createMultiAgentRunner` 迁 core + `buildAgent` 出口关闭 + buildToolSet 一处装配                                                 | typecheck + runtime/delegate-task 单测     |
| C3     | D2：tool-contributions.ts + multi-agents contribution + chat runtime 改用 seam（含 eventMapper 单出口修复）+ chat runtime 的 multi-agents import 清零 | typecheck + chat runtime 单测              |
| C4     | D4：ParallelPanel + stream store 迁 chat（收窄结果型）+ chat-view 本地 import                                                                         | typecheck + stream store 单测              |
| C5     | D1 + D6：三个 feature git mv + feature barrel manifest + router /tools/\* + redirect + plugins/index.ts 收缩 + main.tsx bootstrap 直调 + 侧边栏工具组 | typecheck + 全量 vitest + e2e sidebar 断言 |
| C6     | 本 ADR + CONTEXT.md 词汇表更新                                                                                                                        | 文档一致性                                 |

Commit message 前缀：`refactor(core):`（C1-C3）/ `refactor(features):`（C4-C5）/ `docs(adr):`（C6）。

## Amendment (2026-08-14) — 实施落地修正

- **sink 形态修正（D2/D3）**：实际实现 `SubagentStreamSink { onStart(toolCallId, ref), onEnd(toolCallId, result) }`（结果型，start/end 两点），非逐 token CoreRuntimeEvent 投影 —— 与 D4 的 store 收窄配套（UI 只渲染 finalText/status）。`ToolContributionContext` 的字段为 `{ provider, baseToolTypes, sink }`。
- **store 收窄提前到 C2**：delegate-task 接缝切换迫使 `events: AgentEvent[]` 死数据删除提前（runner 不再产生 raw AgentEvent）；C4 只做文件迁移 + 字段改名（`multiAgentId` → `agentId`、`multiAgentName` → `agentName`）+ `MultiAgentId` 归位 `@shared/lib/multi-agent-schema`。
- **delegate_task 进系统提示未落地（D3 尾句）**：chat.store 的 snippets 派生已收敛到 `buildToolSet`（base 六工具，漂移消除），但 delegate_task 贡献在 runtime run() 内才解析、systemPrompt 在 run() 前组装 —— 鸡生蛋未解。runtime.snippets 含 delegate_task，chat.store 未消费。留待 systemPromptBuilder 设计（独立 ADR 评估）。
- **eventMapper 单出口修复（C3）**：agent_end 双重映射消除，mapper 仅在 `emitRef.single` 单出口应用；chat 仍走 runForEach 投影（未迁移到 eventMapper，保持现状）。
- **`enabled` 字段不存在于 MultiAgentConfig schema**：contribution 与旧 runtime 行为一致，仅按 `configs.length > 0` 注入 delegate-task。
- **`buildBaseToolTypes` 单一来源（2026-08-14 审查修正）**：chat runtime 与 chat.store 各手写一份的 5 项基础工具类型字面量抽为 `features/chat/lib/base-tool-types.ts` 的 `buildBaseToolTypes(workspaceId, mcpTools)`——D3「一处装配」的真正单一来源。
- **`delegate_task` 排除守卫（2026-08-14 审查澄清）**：`createMultiAgentRunner` 的 `t.name !== 'delegate_task'` 过滤保留——它是 runner 边界的防御性守卫（subAgentToolTypes 的调用方约定不含 delegate-task，但 runner 契约不禁止），单测 `multi-agent-runner.test.ts:171` 显式喂入 delegate-task 锁定该行为，非死代码。
- **chat runtime 剥离 + mcp 贡献化（2026-08-14 architecture review 候选 1+2 落地）**：
  - **`features/chat/lib/runtime.ts` 删除**：`createAgentRuntime` 的通用装配下沉 `core/llm/main-runtime.ts` 的 `createMainRuntime`（validate → baseToolTypes → contribution ctx → createLLMRuntime → 订阅透传 → prompt 全链路）；chat 侧只剩 `features/chat/lib/runtime-events.ts` 的 `RuntimeEvent` 类型 + `mapCoreToRuntimeEvent` 投影（chat.store 订阅处调用）。`Runtime` / `Per-Conversation Runtime` 词汇更新。
  - **mcp 成为第二个 Tool Contribution adapter（D2 落地）**：`features/mcp/lib/contribution.ts` 注册 `mcpContribution`（自含 `Effect.provide(McpApiLive)`，每次 run() lazy fetch，catchAll → 空数组，per D8）。chat runtime / chat.store 的 `McpApi` import 清零；`buildBaseToolTypes(workspaceId, mcpTools)` → `buildBaseToolTypes(workspaceId)`（基础 4 项，mcp 移出）并迁 `core/llm/base-tool-types.ts`。
  - **`dynamicToolSnippets` 删除（D2 语义统一）**：mcp 工具描述不再显式注入 system prompt —— 贡献工具的可见性靠 API tools 参数（与 delegate-task 同等待遇）。`buildSystemPrompt` 的 `dynamicToolSnippets` 参数与 2 个测试用例删除。
  - **helper 归位**：`runtime-validate-provider` / `runtime-to-pi-messages` 迁 `core/llm/`（createMainRuntime 内部使用）；`main-runtime.test.ts`（原 chat runtime.test.ts 58KB）订阅处经 `mapCoreToRuntimeEvent` 投影断言（与生产消费方式一致）。
- **Db 消息转换单一装配点 + 会话状态纯 reducer（2026-08-14 architecture review 候选 1+2 落地, C9）**：
  - **`toPiMessages` 收进 `buildAgent`**：`createLLMRuntime` / `createSubagentRuntime` 的 `messages` 入参从 pi `AgentMessage[]` 改为 Db `Message[]`；`buildAgent` 内部 `findDefaultModel → toPiMessages` 一次完成（单一装配点）。`main-runtime.ts` 的 `createProviderFromConfig + findDefaultModel` 8 行转换删除（piProvider 建而即弃问题消除）。`toPiMessages` 留在 `core/llm/runtime-to-pi-messages.ts`（doCompaction 的 proxy 路径继续使用）。
  - **`conversation-reducer.ts`**：`handleEvent` 的 213 行 11 case switch 拆为纯 reducer `createConvReducer({ newId })(state, evt) → state`（ts-pattern 风格，`newId` 注入保证 stub/错误消息 id 确定性）；chat.store 的 handleEvent 缩至 ~22 行（reducer 调用 + persist/logger/conversations 同步副作用）。16 个新 reducer 测试（逐 case 覆盖，含 done 空 content 跳过守卫、error 无 stub 建错误卡片）；chat.store.test.ts 74 个存量用例保持绿（行为等价验证）。
- **reducer 模式回滚 → Solid produce 路径式更新（2026-08-14, C9 修正）**：纯 reducer「返回全量新 `ConversationState` → `setStore('byId', convId, next)`」导致**应用卡死**——Solid 细粒度响应式下，全量替换让每次 token 事件（高频）都替换整个 conv 节点，chat-view 的全部 accessor 与 MessageBubble 列表订阅失效重算，长对话时 UI 线程阻塞。修复：**保留 `conversation-handler.ts` 单一模块设计**（唯一 seam `createConversationHandler`，deps 注入 getState/setState/persistAssistant/syncConversations/newId，副作用编排不变），**回滚 reducer 模式**——`setState` 语义改为收 Solid `produce` draft fn（`setStore('byId', convId, produce(fn))`），只标记被触碰的 draft 字段，细粒度订阅保持有效。21 个 handler 测试经真实 Solid produce 应用断言状态变换。**教训**：Solid `createStore` 更新必须路径式（`setStore(..., key, fn)` 或 `produce`），全量替换状态对象会使细粒度响应式退化为全量重渲染——本项目对此类性能回归缺 e2e 渲染基准，已记录为改进方向。
- **LLMRuntime 单通道化（方案 D，2026-08-14 architecture review 候选 3-5）**——`core/llm/runtime.ts` 接口从 5 成员（`events` + `prompt` + `cancel` + `snippets` + `subscribed`）缩为 3 成员（`run(content): Stream<CoreRuntimeEvent, RuntimeError>` + `cancel` + `snippets`）：
  - **run 冷流单通道**：消费者拉取时注册订阅并触发 prompt（取代旧 subscribed 时序信号）；`agent_end` 事件负责流结束；register 返回值 = 中断清理（agent.abort）。
  - **错误统一 E 通道**：新增 `RuntimeError`（Schema.TaggedError，renderer `shared/lib/errors.ts`，入 AppError 联合）。agent 失败载体 = `turn_end.message.errorMessage`（pi 不 reject，失败以错误消息收尾）；投影异常 / prompt reject 同通道 fail。run 不再发 `'error'` 事件——`'error'` 事件保留于 CoreRuntimeEvent 类型，由 main-runtime catchAll 转译（chat 错误卡片契约不变）。
  - **死数据清除**：pi-agent-core 真实 `agent_end` 仅 `{ messages }`——旧 `finalText/usage/isError/error` 读取为死字段（真实链路恒 undefined）；`agent_end` 载荷移除，`runToResult(stream)` 从最后 turn_end 的 text/usage 提取结果（usage 映射 pi `AssistantMessage.usage` 的 input/output）。
  - **eventMapper 删除**（C3 遗留收尾）：生产零调用，投影职责已归订阅处 `mapCoreToRuntimeEvent`。
  - **turn_end 类型化**：`toolCalls/toolResults` 声明为 shared `ToolCall[]`/`ToolResult[]`（无 null，空数组）。
  - **投影模块**：`mapAgentEventToCore` 三处散点（message_update 快路径 / blocks 路径 / turn_end 聚合）收编 `core/llm/runtime-event-projection.ts` 的 `projectAgentEvent`（内部 seam，随 run() 行为锁定）。
  - **调用方适配**：main-runtime 退化为纯 Stream 组合（fromEffect → flatMap → catchAll）；automation-llm / multi-agent-runner 改用 runToResult + Effect.catchAll（`result.error` 字段检查删除，prompt 抛错从 Unknown 语义改为 RuntimeError → 调用方既有 ToolCall 包装不变）。
