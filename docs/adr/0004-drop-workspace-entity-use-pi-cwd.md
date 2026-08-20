# ADR 0004 — Drop Workspace Entity, Use pi cwd

**Status**: accepted · **Date**: 2026-08-20 · **Scope**: codeman-agent V4 数据模型 / UI 简化
**Related**: ADR 0001 (V4 总纲 D7), ADR 0003 (drop sandbox), ADR 0005 (sessions)

## Context

V3 Workspace 实体是一套独立的数据模型与 UI 组件：

- **数据**：`WorkspaceService` + SQLite `workspaces` 表 + `WorkspaceBoundConversation`（每个 Conversation 绑定 1 个 workspace）
- **UI**：Home workspace 选择器（"+ Add new workspace…"）→ 弹 OS folder picker → `deriveLabelFromPath` 自动派 label
- **行为**：创建后 `root_path` 不可变；agent 的 file tool 仅在该目录树下操作（per ADR 0003 沙箱已删）

V4 删除 Workspace 实体后，V3 这套数据 + UI 完全无对应物。同时 pi-coding-agent 自带 `cwd` 概念——`SessionManager.create(cwd)` 把 cwd 作为 session 的工作目录。V4 直接用 pi 的 cwd 替代 V3 Workspace。

## Decision

### D1. 删 Workspace 实体

- **删除词汇表词条**：`Workspace`、`Workspace-Bound Conversation`、`Add Workspace`、`Workspace Label Derivation`、`Last-Used Workspace`
- **删除 src/main/features/workspaces/**：`WorkspaceService` + SQLite `workspaces` 表 + workspaces DAO/mappers/migrations
- **删除 src/renderer/src/features/chat/lib/workspace-service.ts** 与 chat store 中的 workspace 相关代码
- **删除 src/renderer/src/features/home/components/workspace-picker.tsx**：Home 选择器
- **删除 SQLite migration**：`workspaces` 表创建脚本（db 版本号回退）

### D2. cwd 替代 workspace

V4 session 创建时通过 `window.codeman.piSetCwd(path)` IPC 设置 cwd：

```typescript
// src/main/pi-runtime/session-manager.ts
const sessionManager = SessionManager.create(cwd); // cwd 在 main 端从 IPC args 拿

const { session } = await createAgentSession({
  sessionManager,
  modelRuntime,
  cwd,
});
```

- 单 session = 单 cwd（pi 限制）
- cwd 变化 = 新 session（用 `SessionManager.open(path)` 切换 JSONL session 文件）
- 默认 cwd：`app.getPath("home")`（用户主目录），Renderer Home 显示当前 cwd，用户可通过 "Change cwd" 按钮调用 `dialog.showOpenDialog` 切换

### D3. UI 简化

V4 Home 简化：

- 不再有 workspace 选择器
- 显示当前 cwd 路径 + "Change cwd" 按钮
- "+ New conversation" → 创建新 session 时传当前 cwd

### D4. conversation 字段调整

V3 `Conversation.workspace_id: string` 字段删除。V4 `Conversation` schema 不再有 `workspace_id`，conversation 与 cwd 的关联通过 session JSONL 文件的目录隐含表达（session 文件存放在 cwd 下的 `.pi/sessions/`）。

## Considered

#### 选 1（已选）：彻底删 Workspace 实体
完全移除 SQLite workspaces 表 + WorkspaceService + UI 选择器。session 用 pi cwd。

#### 选 2：保留 Workspace 但去掉沙箱
保留 SQLite workspaces 表 + UI 选择器，但删除 sandbox 校验。问题：workspaces 表仅作为 cwd 路径的"label"，与 OS folder picker 直接选等价，无独立价值。**不选**。

#### 选 3：保留 Workspace 但用 OS Bookmark/SecurityScoped Resource（macOS）
跨平台 workspace 持久化需要 OS 级别的 bookmark（macOS SecurityScoped）或 Windows 快捷方式解析。V4 不引入平台特定依赖。**不选**。

## Consequences

### Positive

- **代码量减少**：`WorkspaceService` + workspaces 表 + 选择器 UI 删除
- **数据模型简化**：V4 SQLite 仅保留 `automations` + `automation_executions` 表（per ADR 0006）
- **UI 简化**：Home 不再有多 workspace 切换
- **与 pi 概念对齐**：cwd 是 pi 原生概念，无需自建数据模型

### Negative

- **失去 "Last-Used Workspace" 记忆**：V3 删除 `Last-Used Workspace` 词条（已废止），V4 没有 workspace 选择导致用户每次启动需要选 cwd
- **cwd 选择 UX 简化**：用户只能用 "Change cwd" 按钮切换，没有 V3 的"下拉 + 添加"模式
- **db migrations 历史回退**：workspaces 表创建 migration 删除，db schema_version 重设或保留为已存在的表（不强制）

### Neutral

- **OS folder picker 保留**：`dialog.showOpenDialog` 仍用于选择 cwd（与 V3 picker 同一 API）
- **路径 label 派生**：V3 `deriveLabelFromPath` 工具函数保留，cwd 切换时显示用

## Cross-file impact

| 路径 | 变化 |
|---|---|
| `src/main/features/workspaces/` | **整体删除** |
| `src/main/db/migrations/00XX-create-workspaces.sql` | **删除** |
| `src/main/db/schema.ts` | 移除 `workspaces` 表定义；保留 `automations` + `automation_executions` |
| `src/renderer/src/features/chat/lib/workspace-service.ts` | **删除** |
| `src/renderer/src/features/chat/stores/chat.store.ts` | 删除 workspaces 派生状态；conversation 无 `workspaceId` |
| `src/renderer/src/features/home/components/workspace-picker.tsx` | **删除** |
| `src/renderer/src/features/home/components/change-cwd-button.tsx` | **新建**：cwd 切换按钮 |
| `src/shared/lib/types.ts` | `Conversation` 删 `workspaceId` 字段；保留 `id / title / created_at / updated_at / archived_at` |
| `src/main/pi-runtime/session-manager.ts` | **新建**：cwd 管理 + session 创建 |
| `src/shared/lib/derive-label-from-path.ts` | 保留，用于 cwd label 显示 |
| `CONTEXT.md` 词汇表 | 删除：`Workspace`、`Workspace-Bound Conversation`、`Add Workspace`、`Workspace Label Derivation`、`Last-Used Workspace` |

## Reversibility

中等可逆：

- 恢复 Workspace 需重写 `main/features/workspaces/` + V3 `workspace-service.ts` + `workspace-picker.tsx` + V3 SQLite `workspaces` 表 + V3 conversation `workspaceId` 字段
- 但 pi-coding-agent 已经在用 cwd，撤回会留"双 cwd + workspace"平行概念

预计回滚耗时：1 周。

## References

- pi-coding-agent SessionManager：`create(cwd) / open(path) / continueRecent(cwd) / list(cwd) / listAll(cwd)`
- V3 ADR-0008-W（per git log）：Workspace 概念来源与历史，不追溯
- V3 ADR-0007（单 webview 约束）：不追溯