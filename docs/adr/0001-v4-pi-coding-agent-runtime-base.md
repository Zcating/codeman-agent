---
name: codeman-agent
description: V4 Architecture — pi-coding-agent as Runtime Base
colors:
  lab-sky-500: "oklch(0.685 0.169 230)"
  cool-paper: "oklch(0.985 0.003 230)"
  cool-charcoal: "oklch(0.18 0.008 230)"
  lab-graphite: "oklch(0.18 0.008 230)"
  lab-signal-error: "oklch(0.62 0.22 25)"
---

# ADR 0001 — V4 Architecture: pi-coding-agent as Runtime Base

**Status**: accepted · **Date**: 2026-08-20 · **Scope**: codeman-agent V4 全栈（runtime 层 / 数据层 / 安全模型 / 配置层 / 工具层 / 扩展层）
**Supersedes**: 历史的 V1–V3 ADR 系列（`docs/adr/` 在 V4 启动时清零重生成，本 ADR 不追溯具体编号）
**Related**: ADR 0002–0012（V4 专题）

## Context

V3 形态由 pi-mono (`@mariozechner/pi-ai` + `@mariozechner/pi-agent`) 锁定：renderer 侧的 `createAgentRuntime()` 工厂、`core/llm/` 自建运行时底座、`Queue-based Mailbox` 编排、自建 provider 适配器与 system prompt 组装器、MCP/skills/multi-agents 自建插件体系、SQLite 会话 + FTS5 全文搜索、workspace sandbox + PermissionService。

V3 的设计纪律是 AGENTS.md 的"最小动作、不重构没坏的东西"。但 V4 启动时用户表达了对 pi-coding-agent 作为运行时底座的明确诉求——pi-coding-agent 已经把 session 编排、tool registry、扩展系统、provider 目录、compaction 集成到一个上游持续维护的产品层。V3 的"自建运行时底座"与 pi-coding-agent 的"产品化层"在职责上高度重叠，导致V3 在 runtime 层反复重写以追上游（per-run transient / queue-based runtime / core/llm skeleton 等一系列 ADR），形成了与上游平行的运行时世界。

V4 必须打破这个平行世界。Grilled 决策链（14 步）已收敛：

| # | 决策 | 编码到 |
|---|---|---|
| A | 用 pi-coding-agent 替换自建运行时底座 | 本 ADR D1 |
| A2 | 全面拥抱（session JSONL / 内置工具 / ExtensionAPI / ModelRuntime） | 本 ADR D2–D6 |
| B1 | 全用 pi 内置工具，删除沙箱 + 权限 | ADR 0003 |
| C1 | 运行时迁 main process | ADR 0002 |
| D3 | 旧 SQLite 会话不迁移，弃置 | ADR 0005 |
| F1 | 保留 Solid 聊天 UI，纯视图层 | ADR 0002 |
| webfetch | 保留（defineTool 自定义工具） | ADR 0010 |
| 计费 | 已砍（事实修正，renderer 无 billing 代码） | ADR 0011 |
| I1 | 逐 feature 映射到 pi 生态 | ADR 0006 |
| J1 | Big-bang 整体切换 | ADR 0012 |
| K1 | 删 Workspace，用 pi cwd | ADR 0004 |
| L1 | API key 迁 pi ModelRuntime | ADR 0008 |
| N1 | System prompt 全部走 pi 机制 | ADR 0007 |
| O3 | pi 错误 → AppError 独立子类映射 | ADR 0009 |

## Decision

### D1. Runtime Base = `@earendil-works/pi-coding-agent`

V4 runtime 底座由 `@earendil-works/pi-coding-agent`（≥ 0.84.x）承载。底座提供：

- **Session 编排**：`createAgentSession(options)`（headless SDK 主入口）+ `SessionManager.inMemory() / create(cwd) / open(path) / continueRecent(cwd) / list(cwd) / listAll(cwd)`（JSONL session 文件管理）+ `AgentSessionRuntime`（session replacement：new / fork / clone / switch）
- **Model & Auth**：`ModelRuntime.create()`（own `auth.json` + `models.json`，替代 V3 的 `createProviderFromConfig` + electron-store 明文 API key）+ `ModelRegistry`（sync facade 供 extensions 用）
- **Settings**：`SettingsManager.create() / inMemory()`（global + project-local 分层）
- **Tool Registry**：`defineTool()` 自定义工具 + `ExtensionAPI.registerTool()` 扩展点；内置 `createReadTool / createWriteTool / createEditTool / createBashTool / createGrepTool / createFindTool / createLsTool` 全套文件工具
- **Extension System**：`ExtensionAPI.registerTool / registerCommand / on(...) / events` pub-sub；`createEventBus()` 跨扩展通信；`ExtensionFactory / InlineExtension` 入口；`DefaultResourceLoader` 自动发现 extensions/skills/prompts/themes/context
- **Skills**：Agent Skills standard 原生支持（`/skill:name` + 自动发现 + manifest 注入）
- **Compaction**：上下文压缩内建

V3 自建的对应物**整体删除**：

- `core/llm/runtime.ts` 的 `createAgentRuntime()` 工厂
- `core/llm/anthropic-stream-fn.ts`、`build-system-prompt.ts`、`llm-tools-factory.ts`、`pi-provider-adapter.ts`、`runtime-to-pi-messages.ts` 等自建运行时层
- `core/llm/` 子目录（V3 renderer core sublayer）
- SQLite `conversations` / `messages` / `FTS5` 表
- 自建 `Skill` / `MCP` / `Multi-Agents` 插件体系
- 自建 `Workspace` 实体与 `WorkspaceService`
- 自建 `buildSystemPrompt` 组装器
- 自建 `Provider` schema 与 `Provider.billing` 子对象（V3 残留）

V3 `AGENTS.md` 中的 `Use existing libraries` 纪律保留——但 V3 的"现有库"是 `@earendil-works/pi-ai` + `@earendil-works/pi-agent-core`（V3 时点上游只有这两个包），V4 把"现有库"上推到 `@earendil-works/pi-coding-agent`（V4 时点上游已经发布该包）。

### D2. 进程边界：runtime in main, renderer as view

V3 runtime 跑在 renderer（webview）里——纯浏览器上下文，零 `node:` import。pi-coding-agent 依赖 Node（`cross-spawn`、`undici`、原生 WASM `photon-node`、`Node ≥22.19`）且 `SessionManager` 是文件系统的（`create(cwd)` 需要 cwd），无法跑在浏览器里。

V4 把 runtime 整体迁到 Electron main process。renderer 变成纯视图层：用户输入经 IPC 下发、事件流经 `webContents.send` 推到 renderer（V3 ADR-0025 D7 已有先例）。**详见 ADR 0002**。

### D3. 工具层：pi 内置 + webfetch 自定义

V4 文件工具（`read / write / edit / bash / grep / find / ls`）全部使用 pi-coding-agent 内置工具。`webfetch` 作为自定义工具通过 `defineTool()` / `ExtensionAPI.registerTool()` 注册` 底座（保留 SSRF 防护）。**详见 ADR 0003 + 0010**。

### D4. 安全模型：无沙箱、无权限

V3 的 Workspace Sandbox（`read_file` / `write_file` / `edit_file` 只能操作 workspace root 内）+ PermissionService（`run_command` 弹窗 3 选 1）+ Permission Inline Dock **整体删除**。V4 接受 pi-coding-agent 的官方安全语义（"runs with the permissions of the user and process that launched it"，README 明确说"no built-in permission system"）。

### D5. 数据层：会话迁 pi JSONL，旧 SQLite 弃置

V4 会话持久化由 pi-coding-agent 的 `SessionManager` 管理（JSONL session 文件，存 `~/.pi/`）。V3 SQLite `conversations` + `messages` + `FTS5` 整体删除，**旧用户数据不迁移**。**详见 ADR 0005**。

### D6. Feature 映射：skills/multi-agents/MCP 迁 pi 体系，automations 保留自建

V4 feature-to-extension 映射：

| V3 Feature | V4 归宿 | 机制 |
|---|---|---|
| Skills（双轨激活） | pi 原生 skills 系统 | Agent Skills standard，`/skill:name` + 自动发现 |
| Multi-Agents（delegate_task） | pi extension | 官方 subagent 示例 |
| MCP（JSON-RPC stdio client） | 自写 extension | pi 无内置 MCP client，按 README "build your own with extensions" |
| Automations（定时任务） | 保留自建 | pi 无对应，main 端调度器 + 事件桥 |
| Settings | ModelRuntime + SettingsManager | D8 |
| Chat UI | 保留 Solid 视图 | D2 |

**详见 ADR 0006**。

### D7. Workspace 概念删除，用 pi cwd

V3 的 Workspace 实体（SQLite 持久化 + 选择器 + workspace-bound conversation）删除。V4 直接用 pi 的 `cwd` 概念（`SessionManager.create(cwd)`）。**详见 ADR 0004**。

### D8. 配置存储：ModelRuntime

V3 的 provider 配置（`electron-store settings.json`）+ API key（明文存 settings.json，ADR-0015）整体迁到 pi 的 `ModelRuntime`（`auth.json` + `models.json`，存 `~/.pi/`）。仍是明文（pi 无加密），只是换位置。**详见 ADR 0008**。

### D9. System Prompt 走 pi 机制

V3 的 `buildSystemPrompt` 组装器（identity / tools / guidelines / workspace / AGENTS.md / skills / 用户默认 / cwd 页脚）整体删除。V4 用 pi 的 `DefaultResourceLoader`（自动加载 context 文件）+ `ExtensionAPI.on('before_prompt')`（extension 注册 section）。**详见 ADR 0007**。

### D10. 错误模型：pi → AppError 全量映射

V3 的 `AppError` + `TaggedError`（8 个子类，ADR-0025 D4）保留作为 renderer 边界错误类型。V4 的 pi 错误（model call failure / session error / tool execute exception / compaction error 等）在 IPC 边界**全量映射为独立 AppError 子类**（而非统一归为 `Unknown`）。**详见 ADR 0009**。

### D11. UI 形态：保留 Solid 聊天 UI

V4 renderer 保留 V3 的 Solid.js 聊天界面（消息流 + 工具调用可视化 + 输入区）。底层事件源从自建 runtime 换成 IPC 桥接的 pi session 事件。产品形态延续"桌面聊天 + 工具调用"第四面板。**详见 ADR 0002**。

### D12. 迁移策略：Big-bang

V4 启动采用 big-bang 整体切换（参考 V3 ADR-0025 D9 Tauri→Electron 迁移先例）。**详见 ADR 0012**。

### D13. 版本升级：0.80.3 → 0.84.x

V3 用 `@earendil-works/pi-ai` + `@earendil-works/pi-agent-core` 在 `0.80.3`。`@earendil-works/pi-coding-agent` 从 `0.84.1` 才开始发布，没有 `0.80.3` 版本——V4 必须全栈升到 `0.84.x`。注意 `0.82.0` 的 `AgentHarness` 重写是工具定义 API 的 breaking change；`0.83.0` 有 TypeBox 升级；`0.80.8` 移除了 `AuthStorage`（替换为 `ModelRuntime`）。

### D14. 计费工具：已砍（事实修正）

V3 的"内置 2 个计费工具（`get_balance` / `get_plan_quota`）"在 renderer 代码中已被移除（搜索 0 命中），仅在 `main/features/settings/` 留下 schema 定义。V4 正式删除相关词汇与 schema 残留。**详见 ADR 0011**。

## Consequences

### Positive

- **运行时底座统一**：从 pi-agent-core（V3 lock-in）上推到 pi-coding-agent（V4 lock-in），与上游产品化层对齐
- **会话 / 工具 / 扩展 / provider 目录**：上游持续维护，V4 不再追平行世界
- **Skills / Sub-Agents**：复用 pi 官方机制（`/skill:name` + extension subagent）
- **Compaction**：复用 pi 内建（V3 自建的 compaction-rewrite 作为 message-pair 删除）
- **代码量显著减少**：V3 的 `core/llm/`（10+ 文件）+ 自建运行时 + 自建 provider 适配 + 自建 system prompt + 自建 session + 自建 workspace + 自建 plugin registry 全部删除

### Negative

- **产品语义大幅改变**：从"沙箱桌面 agent"转向"编码 agent"，UI 上删去 Workspace 选择器 / Permission Inline Dock / SandboxViolation 报错，工具行为从"workspace 内"变为"cwd 内"
- **API key 明文存储迁移**：从 electron-store 迁到 pi 的 auth.json（仍是明文，pi 无加密）
- **Session 文件位置变化**：从 SQLite 迁到 JSONL session 文件（旧数据不可访问）
- **依赖复杂度**：引入 `pi-coding-agent` 的全套依赖（`pi-tui` 硬依赖但 headless 路径不加载、`@silvia-odwyer/photon-node` 原生 WASM 模块）
- **Node 版本硬约束**：`Node ≥22.19.0`——Electron 39 捆绑 Node 满足

### Neutral

- **Solid.js UI / Effect-TS 逻辑层 / Electron shell**：保留
- **TanStack Router / Vite / Tailwind v4 / lucide-solid / @ark-ui/solid**：保留
- **design tokens / Inter + Noto Sans SC / JetBrains Mono**：保留
- **测试基础设施（vitest / @solidjs/testing-library / Playwright e2e）**：保留，但 e2e mock LLM server 需适配 pi 的协议

## Cross-file impact

| 范畴 | 变化 |
|---|---|
| `docs/adr/` | 整体清零 → 重新生成 V4 ADR 0001–0012（12 个） |
| `CONTEXT.md` | 整体清零 → 按 V4 目标态词汇表从零写 |
| `package.json` | `dependencies` 新增 `@earendil-works/pi-coding-agent`；`@earendil-works/pi-ai` + `@earendil-works/pi-agent-core` 升 `0.84.x` |
| `src/renderer/` | `core/llm/` 子目录删除；`features/chat/` 重写为 IPC 事件订阅视图层；`features/mcp/` + `features/multi-agents/` + `features/skills/` 重写为 pi extension 注册 + IPC 桥；`features/settings/` 改读 `ModelRuntime` |
| `src/main/` | 新增 `pi-runtime/` 子模块（createAgentSession wrapper + IPC 流式事件桥 + provider 配置 + custom tools）；`features/file-ops/` + `features/run-command/` + `features/permission/` 删除（pi 内置工具接管 + 无沙箱/无权限）；`features/webfetch/` 保留并迁移为 `defineTool` 自定义工具；`features/automations/` 保留并桥接到 pi session 事件；`features/conversations/` + `features/workspaces/` 删除（pi SessionManager 接管） |
| `src/preload/` | `contextBridge` 暴露的 API 调整：保留 `webContents.send` 流式事件订阅；删除 conversations/workspaces/permission 相关 |
| `src/shared/` | `AppError` 子类扩展（pi 错误全量映射）；TypeBox ↔ effect/Schema 桥接保留并扩展 |
| `src/main/db/` | conversations / messages / FTS5 / workspaces 表删除；保留 automations 表（per ADR 0006） |

## Reversibility

V4 是产品代际变化（V3 → V4），从沙箱桌面 agent 转向编码 agent。回滚成本极高：

- 删 12 个 V4 ADR
- 重写 V3 CONTEXT.md 73KB 词汇表
- 重写 V3 core/llm/ + 自建运行时层
- 重新引入 SQLite 会话层 + FTS5 全文搜索
- 重新引入 Workspace 实体 + PermissionService + 自建 plugin registry

预计回滚耗时：单开发者全栈回归 4–6 周（含 e2e 重写）。

**接受不可逆代价**——V4 是产品演进需要，参考 V3 ADR-0025 D9（Electron 迁移接受不可逆）的先例。

## References

- pi-coding-agent：`https://github.com/earendil-works/pi`（`packages/coding-agent/`）
- pi-coding-agent SDK 入口：`createAgentSession / SessionManager / ModelRuntime / SettingsManager / DefaultResourceLoader / ExtensionAPI / defineTool / createReadTool / createBashTool / createEditTool / createWriteTool / createGrepTool / createFindTool / createLsTool / runPrintMode / runRpcMode`
- pi-coding-agent 官方 README："Pi does not include a built-in permission system... By default, it runs with the permissions of the user and process that launched it."
- V3 ADR 系列：在 V4 启动时整体清零，本 ADR 不追溯具体编号。历史决策的可借鉴模式保留在 git log 中。
- V4 ADR 0002–0012：本总纲的专题分解。