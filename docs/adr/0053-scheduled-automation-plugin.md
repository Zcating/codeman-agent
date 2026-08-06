# 0053 — Scheduled Automation Plugin

**Status**: accepted · **Date**: 2026-08-06 · **Scope**: `src/renderer/src/plugins/automations/` (新增) + `src/main/features/automations/` (新增) + `src/renderer/src/plugins/index.ts` (改 — 注册新 descriptor) + `src/renderer/src/plugins/lib/plugins.barrel.test.ts` (改 — 加 automations 测试) + `src/main/index.ts` (改 — 启动 scheduler) + `src/main/ipc.ts` (改 — 注册 automation IPC handlers) + `src/main/db/` (改 — 新 migration `0007_automation_executions.sql`) + `src/renderer/src/shared/lib/ipc.ts` (改 — renderer IPC type 扩展) + `docs/adr/0053-scheduled-automation-plugin.md` (本文件) + `CONTEXT.md` (改 — 词汇表加 Automations 段)

**Related**: ADR-0002 (锁定 pi-mono runtime — automation 的 LLM action 走 pi-mono `Agent`), ADR-0015 (app-store/key 简化 — Provider 凭据复用), ADR-0019 (per-run transient agent — 每次 LLM action 新建独立 `Agent`), ADR-0025 (effect/Schema — 配置与 execution 表 schema 来源), ADR-0029 (form mode — Settings form 字段走 TanStack Form), ADR-0035 (Renderer Plugin Registry — 新 plugin 沿用 `PluginDescriptor`), ADR-0039 (主内容滚动区 — plugin tab 是 ScrollArea 页面), ADR-0045 (skills IPC split — automation IPC 模式借鉴), ADR-0048 (run_command — script action 沙箱与超时复用), ADR-0049 (multi-agents plugin — 同为 renderer plugin 第四个 builtin)

## Context

### 触发:用户/产品 2026-08-06 提出

> "增加自动化功能,放入插件。"

2026-08-06 grill-with-docs session 锁定本 ADR 内容。

### 探查事实

- **Renderer Plugin Registry 已存在**(`src/renderer/src/plugins/`),三个 builtin plugin:`skills`(ADR-0031)、`mcp`(ADR-0032)、`multi-agents`(ADR-0049)。PluginDescriptor 形状: `{ id, initialize: Effect, route, sidebar }`(per ADR-0035)。
- **持久化模式二选一**: Skills/MCP 走 `~/.agents/*.json`(per ADR-0015),Multi-Agents / Conversations / Workspaces 走 SQLite。配置类型选 JSON,运行日志选 SQLite。
- **pi-ai / pi-agent 仅在 renderer 端可用** — `createAgentRuntime`、`createSubAgent`(ADR-0049)、`anthropicStream` 全部引用位于 `src/renderer/src/features/chat/lib/`。**Main 端无法直接调 LLM,必须 IPC 跳 renderer**。
- **Sub-agent factory 现成 pattern** — `src/renderer/src/plugins/multi-agents/lib/sub-agent-factory.ts` 创建独立 `Agent` 实例(独立 systemPrompt + 工具白名单 + messages:[]),可作为 LLM action 的执行单元。
- **App 生命周期** — `src/main/index.ts` 有 `before-quit` + `window-all-closed`(非 darwin 退出)。Main 端 `setInterval` 在应用退出后停止,darwin 上窗口关闭但 app 仍存活。
- **run_command 沙箱模式** — `src/main/features/run-command/` 实现 workspace 路径校验(`fs.realpath()` 后检查路径是否在 workspace root 内),可直接复用为 script action 的沙箱(per ADR-0048)。
- **业界做法** — GitHub Actions / Zapier / Make / n8n 均采用 execution-level persistence(只存 metadata + final output,不存中间 messages)。n8n 用 `deduplicationKey` 防重复执行(我们的 queue 已防重复,无需 dedup key)。

### 设计张力(grill 已收齐)

| # | 张力 | 决议 | 拒绝方案 |
|---|---|---|---|
| T1 | 「自动化」指什么? | **定时任务 (scheduled/cron) + 终端用户在 Settings UI 配置** | 事件驱动 / if-then rules / autonomous agent / OS 原生 Scheduler |
| T2 | 动作形态? | **独立 LLM 推理 + 自定义脚本(两种并存)** | 仅 AgentTool / 仅 user message 注入 / 仅脚本 |
| T3 | 定时器在哪? | **Electron Main 端 setInterval** | Renderer Solid 端(应用未启动不跑);OS 原生 Scheduler(过重) |
| T4 | Plugin 命名? | **`automations`** | `scheduled`(语义窄);`tasks`(Windows 风格);`crons`(技术感强) |
| T5 | 应用关闭时 missed run? | **标记 missed, 用户手动补跑** | 立即补跑(token 风险);丢;只跑一次 |
| T6 | Execution history 持久化? | **SQLite 新表 `automation_executions`** | `~/.agents/automations_history.json`(配置混入日志);内存(与 C 冲突) |
| T7 | Script 沙箱? | **复用 workspace sandbox** | 独立 sandbox(过重);无 sandbox(危险) |
| T8 | LLM action timeout? | **5 min 默认 + 可配置 (30s - 30min)** | 无超时;30s 硬编码;用户必填 |
| T9 | Provider 选择? | **强制配 providerId + modelId** | 默认 appStore(隐式依赖);fallback defaultModel |
| T10 | Execution 历史 UI? | **plugin tab 内 2 section (Rules + History)** | codeman-toast(消散后失忆);chat-view banner(语义冲突);footer 计数(弱) |
| T11 | Reentrancy? | **Queue(排队)** | Skip overlap(丢语义);并发 race |
| T12 | Schedule 表达? | **human-readable only,不引 cron-parser** | cron 标准(用户门槛高);仅 interval(80%);仅时间点 |
| T13 | Script timeout? | **5 min 默认** | 30s(与 run_command 对齐但 build 不够);必填 |
| T14 | 预装示例? | **不预装** | 1 个 disabled(参考价值);2-3 个 disabled(列表干扰) |
| T15 | Sidebar order? | **5** | 31(与 multi-agents 同段);6(居中) |
| T16 | Missed 阈值? | **1× period(严格)** | 1.5×(柔性);2×(宽松);用户配 |
| T17 | Manual Run now? | **每条 rule 行 Run now 按钮** | 改 enabled + 重启;detail dialog 内 |
| T18 | Execution 保留期? | **全表保留,UI 分页** | 每 rule 100 条 LRU;30 天;永久 + 手动清 |
| T19 | Schedule 预设? | **6 预设 + 自定义** | 3 预设;全自填;interval + 时间点 |
| T20 | LLM persistence? | **独立 SQLite 表 + execution-level(final_text + status + duration)** | 进 conversations 表(与业界不同);仅 metadata(无 final_text) |

## Decision

### D1 — AutomationRule: 配置 shape

```typescript
// src/shared/lib/automation-types.ts(主 + 渲染端共用)
export type AutomationId = string;  // uuid v7

export type AutomationSchedule =
  | { readonly kind: "interval"; readonly everyMs: number }
  | { readonly kind: "daily"; readonly hour: number; readonly minute: number }
  | { readonly kind: "weekly"; readonly weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; readonly hour: number; readonly minute: number };

export type AutomationAction =
  | {
      readonly kind: "llm";
      readonly systemPrompt: string;
      readonly userPrompt: string;
      readonly providerId: string;       // 引用 Provider.id
      readonly modelId: string;          // 引用 Provider.llm.models[].id
      readonly timeoutMs: number;        // default 300_000, range [30_000, 1_800_000]
    }
  | {
      readonly kind: "script";
      readonly language: "shell" | "javascript";
      readonly source: string;
      readonly workspaceId: string;      // 引用 Workspace.id
      readonly timeoutMs: number;        // default 300_000, range [5_000, 1_800_000]
    };

export interface AutomationRule {
  readonly id: AutomationId;
  readonly name: string;                // 用户定义,1 行
  readonly enabled: boolean;
  readonly schedule: AutomationSchedule;
  readonly action: AutomationAction;
  readonly createdAt: number;           // epoch ms
  readonly updatedAt: number;
}
```

**约束**:
- `name` 在所有 enabled rule 内**可重复**(不强制唯一,允许用户同名多 rule)
- `providerId` + `modelId` 必须在 Settings JSON 现有 provider 的 `models[]` 内,运行时校验
- `workspaceId` 必须在 SQLite workspaces 表内,运行时校验
- `enabled=false` 的 rule 不被 scheduler 注册 setInterval

### D2 — 配置持久化: `~/.agents/automations.json`

```typescript
// src/main/features/automations/automations-config.ts
const AUTOMATIONS_CONFIG_PATH = (): string =>
  join(app.getPath("home"), ".agents", "automations.json");

const AutomationsConfigFileSchema = Schema.Struct({
  version: Schema.Literal(1),
  rules: Schema.Array(/* AutomationRule schema,见 D1 */),
});

// readAutomationsConfig()、writeAutomationsConfig()、mcpConfigExists() 类比 mcp-config.ts
```

走 ADR-0015 `~/.agents/` 路径,与 skills / mcp 同根,不引 Settings JSON(避免污染主档)。

### D3 — Execution 持久化: SQLite `automation_executions` 表

**Migration 文件** `src/main/db/migrations/0007_automation_executions.sql`:

```sql
CREATE TABLE automation_executions (
  id TEXT PRIMARY KEY,                      -- uuid v7
  rule_id TEXT NOT NULL,                    -- 软 FK(rule 在 JSON,删除时保留历史)
  status TEXT NOT NULL,                     -- pending | running | success | failure | timeout | skipped | missed
  trigger_kind TEXT NOT NULL,               -- scheduled | manual | missed-replay
  started_at INTEGER NOT NULL,              -- epoch ms
  completed_at INTEGER,                     -- epoch ms
  duration_ms INTEGER,                      -- 跑完时填充
  final_text TEXT,                          -- LLM action final assistant text
  exit_code INTEGER,                        -- script action exit code
  stderr TEXT,                              -- script action stderr
  error TEXT,                               -- error message
  metadata_json TEXT                        -- 灵活元数据(workspace label / provider label / model id / trigger_rule_name)
);

CREATE INDEX idx_automation_executions_rule_started
  ON automation_executions (rule_id, started_at DESC);

CREATE INDEX idx_automation_executions_status
  ON automation_executions (status, started_at DESC);
```

**业界对齐**:与 n8n `ExecutionEntity`(只存 metadata + final output)对齐,不存中间 messages。

### D4 — Plugin Registry: 第 4 个 builtin

```typescript
// src/renderer/src/plugins/index.ts 增加
const automationsInitialize: Effect.Effect<void, AppError> = initializeAutomations();

const automationsDescriptor = {
  id: "automations" as const,
  initialize: automationsInitialize,
  route: { path: "/plugins/automations", label: "Automations" },
  sidebar: { icon: "Clock", order: 5, visible: true },
} satisfies PluginDescriptor;

if (!registered) {
  pluginRegistry.registerPlugin(skillsDescriptor);
  pluginRegistry.registerPlugin(mcpDescriptor);
  pluginRegistry.registerPlugin(automationsDescriptor);  // 新增
  registered = true;
}
```

**Sidebar order = 5** — 与 skills(3)/mcp(4)同段"用户主动配置的核心插件",multi-agents(30)为另一段"agent 协作"。

### D5 — Scheduler 架构 (Main process)

```typescript
// src/main/features/automations/scheduler.ts
class AutomationScheduler {
  private timers = new Map<AutomationId, NodeJS.Timeout>();
  private queues = new Map<AutomationId, Array<() => Promise<void>>>();  // per-rule FIFO
  private running = new Set<AutomationId>();                              // 当前正在跑的 rule

  async start(): Promise<void> {
    const config = await readAutomationsConfig();
    for (const rule of config.rules.filter(r => r.enabled)) {
      this.schedule(rule);
    }
  }

  stop(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  async reload(): Promise<void> {
    this.stop();
    await this.start();
  }

  async runNow(ruleId: AutomationId): Promise<void> {
    // 同 queue 机制,IPC handler 调用
    this.enqueue(ruleId, "manual");
  }

  private schedule(rule: AutomationRule): void {
    const tick = () => {
      this.enqueue(rule.id, "scheduled");
      const nextDelay = this.computeNextDelay(rule.schedule);
      this.timers.set(rule.id, setTimeout(tick, nextDelay));
    };
    const initialDelay = this.computeNextDelay(rule.schedule);
    this.timers.set(rule.id, setTimeout(tick, initialDelay));
  }

  private enqueue(ruleId: AutomationId, triggerKind: "scheduled" | "manual" | "missed-replay"): void {
    const existing = this.queues.get(ruleId) ?? [];
    existing.push(() => this.execute(ruleId, triggerKind));
    this.queues.set(ruleId, existing);
    if (!this.running.has(ruleId)) this.dequeue(ruleId);
  }

  private async dequeue(ruleId: AutomationId): Promise<void> {
    const queue = this.queues.get(ruleId);
    if (!queue || queue.length === 0) {
      this.running.delete(ruleId);
      return;
    }
    this.running.add(ruleId);
    const task = queue.shift()!;
    try { await task(); } finally {
      if (queue.length === 0) this.queues.delete(ruleId);
      this.dequeue(ruleId);  // 跑下一个
    }
  }

  private computeNextDelay(schedule: AutomationSchedule): number {
    // 算到下次触发的 ms,需考虑 daily / weekly 的"今天是否已过"
    // 用纯函数,不引 cron-parser
  }
}
```

**Reentrancy = Queue(per-rule FIFO)** — 同一 rule 在 status=running 时新触发进 queue,等前一个跑完。

**Missed run 检测** — 应用启动时:`for each enabled rule, if lastCompleted + period < now, enqueue("missed-replay")`。1× period 严格阈值。

### D6 — Action Executor

```typescript
// src/main/features/automations/executor.ts
const executeAction = (
  rule: AutomationRule,
  triggerKind: TriggerKind,
  executionId: AutomationExecutionId,
): Effect.Effect<ExecutionOutcome, AppError> =>
  Effect.gen(function* () {
    switch (rule.action.kind) {
      case "llm":
        return yield* executeLlmAction(rule.action, executionId, rule.action.timeoutMs);
      case "script":
        return yield* executeScriptAction(rule.action, executionId, rule.action.timeoutMs);
    }
  });

// LLM action: IPC 跳 renderer spawn sub-agent(per ADR-0049 sub-agent-factory 模式)
const executeLlmAction = (
  action: Extract<AutomationAction, { kind: "llm" }>,
  executionId: AutomationExecutionId,
  timeoutMs: number,
): Effect.Effect<ExecutionOutcome, AppError> =>
  Effect.gen(function* () {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!window || window.isDestroyed()) {
      return yield* Effect.fail(new Unknown({ message: "No renderer window available" }));
    }
    // 通过 IPC `automations:execute-llm` 调 renderer
    // renderer 端 createSubAgent(...) + agent.prompt(userPrompt)
    // 返回 final assistant text
    // main 端 yield* Promise.race([ipcPromise, timeoutPromise]) 实现 timeout
  });

// Script action: 复用 run_command 的 workspace sandbox
const executeScriptAction = (
  action: Extract<AutomationAction, { kind: "script" }>,
  executionId: AutomationExecutionId,
  timeoutMs: number,
): Effect.Effect<ExecutionOutcome, AppError> => {
  // 复用 src/main/features/run-command/ 的 spawn + workspace path check + timeout
  // 区别:不弹 dialog.showMessageBox(自动化场景无 UI)
};
```

**LLM action 关键约束**:渲染端未启动 → 记 `failure: "no_renderer_window"`,不进 queue(用户可手动 Run now)。

### D7 — IPC 接口 (Main → Renderer / Renderer → Main)

```typescript
// src/main/features/automations/ipc.ts
ipcMain.handle("automations:list", () => manager.listRules());
ipcMain.handle("automations:create", (_e, args: { rule: AutomationRule }) => manager.createRule(args.rule));
ipcMain.handle("automations:update", (_e, args: { rule: AutomationRule }) => manager.updateRule(args.rule));
ipcMain.handle("automations:delete", (_e, args: { id: AutomationId }) => manager.deleteRule(args.id));
ipcMain.handle("automations:toggle", (_e, args: { id: AutomationId; enabled: boolean }) => manager.toggleRule(args.id, args.enabled));
ipcMain.handle("automations:run-now", (_e, args: { id: AutomationId }) => manager.runNow(args.id));
ipcMain.handle("automations:list-executions", (_e, args: { ruleId?: AutomationId; limit?: number; offset?: number }) => manager.listExecutions(args));
ipcMain.handle("automations:get-execution", (_e, args: { id: string }) => manager.getExecution(args.id));
ipcMain.handle("automations:run-missed", (_e, args: { id: AutomationId }) => manager.runMissed(args.id));  // 用户主动补跑 missed rule

// Main → Renderer (scheduler 触发 LLM action 时)
mainWindow.webContents.send("automations:execute-llm", { executionId, action });
```

Renderer → preload 暴露 `window.codeman.automations.*`,类型在 `src/shared/lib/ipc.ts` 扩展。

### D8 — UI: Plugin Tab 结构

```
/plugins/automations (page)
├── Rules section (顶部)
│   ├── [+ New Rule] 按钮
│   ├── Rule 列表 (table)
│   │   └── 每行: name | schedule summary | action kind | last status | enabled toggle | ▶ Run now | ⋯ menu (edit/delete)
│   └── (空态) "No automations. Click + to create."
└── Execution History section (折叠)
    ├── Filter: rule dropdown + status dropdown
    ├── Table: started_at | duration | status | trigger_kind | final_text (可展开)
    └── (空态) "No executions yet."
```

Rule 编辑 dialog(模态):
- Name (text)
- Enabled (checkbox, default true)
- Schedule (radio: Simple / Custom + dropdown of 6 预设 + 自定义 inputs)
- Action (radio: LLM / Script)
  - LLM branch: System prompt (textarea), User prompt (textarea), Provider (select), Model (select, 跟随 Provider 选), Timeout (number input, default 300000)
  - Script branch: Language (radio: shell / javascript), Source (textarea), Workspace (select), Timeout (number input, default 300000)
- [Save] / [Cancel]

### D9 — 词汇表新增

CONTEXT.md 新增 `### Automations (V3.2, ADR-0053)` 段,定义:
- **Automation (自动化)** — 端用户配置的定时任务单元,持久化于 `~/.agents/automations.json`
- **Automation Rule (自动化规则)** — 单条 automation 配置(Schedule + Action + 启用状态)
- **Automation Schedule (调度计划)** — `interval` / `daily` / `weekly` 三选一(per D1)
- **Automation Action (自动化动作)** — 触发时执行的具体形态(`llm` / `script`)
- **Automation Execution (自动化执行)** — 单次触发的实例,持久化于 SQLite `automation_executions` 表
- **Trigger Kind (触发类型)** — `scheduled` / `manual` / `missed-replay`
- **Missed Run (错失执行)** — 应用未启动期间本应触发但未执行的 scheduled run,启动时检测,用户手动补跑

### D10 — 范围外 (V1 不做)

- 走 OS 原生 Scheduler(Task Scheduler / launchd / cron)— D4 排除
- if-then rules / event-driven / autonomous agent — D1 排除
- 预装示例 rule — T14 排除
- 与 mcp-server / skill / sub-agent 运行时联动 — V2+
- 多租户 / 多用户 / 远程触发 — V2+
- 进主 conversations 表 — T20 排除
- cron 表达式解析 — T12 排除

## Implementation Outline

### Renderer (`src/renderer/src/plugins/automations/`)
- `index.ts` — barrel
- `lib/schema.ts` — 与 main 端一致的 `Schema.Struct` mirror
- `lib/schedule.ts` — human-readable schedule → nextDelay 计算
- `stores/automations.store.ts` — Solid store + IPC bridge(per ADR-0016 D4)
- `stores/executions.store.ts` — execution history Solid store
- `components/settings-tab.tsx` — plugin tab 主页(per ADR-0039 ScrollArea 页面)
- `components/rule-form.tsx` — rule 编辑 dialog
- `components/rule-list.tsx` — rules section 表格
- `components/execution-history.tsx` — history section 表格
- `components/execution-detail-dialog.tsx` — 单条 execution 详情(含 final_text / stderr / error)
- `*.test.tsx` / `*.test.ts`

### Main (`src/main/features/automations/`)
- `automations-config.ts` — `~/.agents/automations.json` 读写(类比 mcp-config.ts)
- `scheduler.ts` — `AutomationScheduler` 类(D5)
- `executor.ts` — `executeAction` / `executeLlmAction` / `executeScriptAction`(D6)
- `ipc.ts` — IPC handler 注册(D7)
- `service.ts` — 业务封装层(`listRules` / `createRule` / `updateRule` / `deleteRule` / `toggleRule` / `runNow` / `listExecutions` / `runMissed`)
- `db.ts` — `automation_executions` 表 CRUD
- `*.test.ts`

### Migration (`src/main/db/migrations/`)
- `0007_automation_executions.sql`(D3)

### 修改
- `src/renderer/src/plugins/index.ts` — 注册 `automationsDescriptor`(D4)
- `src/renderer/src/plugins/lib/plugins.barrel.test.ts` — 加 automations 注册测试
- `src/main/index.ts` — 启动 scheduler + 注册 IPC handler(D7)
- `src/main/ipc.ts` — `registerAutomationsIpc()` 调用
- `src/main/db/mod.ts` — 注册 migration `0007_`
- `src/renderer/src/shared/lib/ipc.ts` — renderer IPC type 扩展(D7)
- `src/preload/index.ts` — expose `window.codeman.automations.*`
- `CONTEXT.md` — 词汇表 Automations 段(D9)

## Verification

- [ ] `git status` 干净(worktree 内)
- [ ] `vp run typecheck` 通过
- [ ] `vp run test` 通过
- [ ] `vp run lint` 通过
- [ ] e2e:plugin tab 可见 → 新建 LLM rule → 1 min interval → 跑两次 → 第二次开始出现 history
- [ ] e2e:Missed run → 关 app 5 min → 重启 → "missed" 状态显示 → Run now 跑通
- [ ] e2e:script action 在 workspace 内跑(成功) + 越界路径(SandboxViolation)
- [ ] e2e:reentrancy → 30s rule,timeout 60s → 两次触发 → execution history 显示 status=skipped(因 queue head 未跑完)
- [ ] reviewer 报告零 finding + 显式盲区声明