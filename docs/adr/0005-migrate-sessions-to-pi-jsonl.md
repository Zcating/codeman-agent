# ADR 0005 — Migrate Sessions to pi JSONL, Drop SQLite Conversation Storage

**Status**: accepted · **Date**: 2026-08-20 · **Scope**: codeman-agent V4 会话持久化层 / 数据迁移策略
**Related**: ADR 0001 (V4 总纲 D5), ADR 0004 (drop workspace)

## Context

V3 会话层在 SQLite + FTS5：

- `conversations` 表（id / title / system_prompt / created_at / updated_at / archived_at / workspace_id）
- `messages` 表（conversation_id / role / content / thinking / tool_calls / tool_results / model / token usage / created_at）
- FTS5 全文搜索（基于 `messages.content`）
- V3 `core/llm/runtime.ts` 的 `createAgentRuntime()` 通过 per-run transient Agent + store-as-source-of-truth 模式（per git log）持久化

pi-coding-agent 的 SessionManager 提供基于 JSONL 文件的会话持久化：

- `SessionManager.create(cwd)` 创建 session，session 文件存放在 cwd 下的 `.pi/sessions/`
- JSONL 树形结构（messages + branches）
- 支持 compaction、fork、clone
- 第三方工具（如 grep）可直接读 JSONL 文件

V4 必须选择会话存储：继续 SQLite 还是迁 pi JSONL。Grilled 决策：**session 迁 pi JSONL + 旧 SQLite 数据不迁移**。

## Decision

### D1. 删 SQLite 会话层

- **删除 SQLite 表**：`conversations`、`messages`、`FTS5 messages_fts`
- **删除 src/main/features/conversations/**：`ConversationService` + `MessageService` + DAO/mappers
- **删除 src/main/db/migrations/00XX-create-conversations.sql** + `000X-create-messages.sql` + `00XX-create-fts.sql`
- **删除 src/renderer/src/features/chat/stores/conversations.store.ts**（V3 chat store 合并 messages.store + agent.store + conversations.store）

### D2. 旧数据不迁移

V3 用户**已积累的 SQLite 会话历史不迁移**。升级到 V4 后：

- 旧 conversations / messages 表**整体删除**（不保留为"已归档"，彻底清空）
- 旧 FTS5 索引删除
- 用户首次启动 V4 时看到空 session 列表

理由：
- SQLite → JSONL 的 schema 转换无完整对应物（V3 的 message 含 thinking / tool_calls / tool_results 复杂 schema，pi JSONL 的消息格式不同）
- 旧会话内容可能引用 V3 workspace（已删除），即使导入也语义残缺
- 大多数 V3 用户实际活跃会话数少（per git log V3 ADR-0014 D2 软上限 1000）；数据价值低
- 简化 V4 启动流程，无迁移代码路径

### D3. 删 FTS5 全文搜索

V3 `FTS5 messages_fts` 删除。V4 **不引入对应全文搜索机制**（session 列表 UI 不提供按 content 搜索）：

- pi JSONL session 文件可通过 OS 工具（grep / ripgrep）搜索——这是给开发者用户的 escape hatch
- 用户 UI 看到的 session 列表仅按 `title / created_at / updated_at` 排序与筛选

### D4. pi SessionManager 作为唯一 session 源

V4 main process 单实例持有 `SessionManager`，所有 session CRUD 走 pi API：

```typescript
// src/main/pi-runtime/session-manager.ts
const sessionManager = SessionManager.create(cwd);

// 列 session
const sessions = await sessionManager.list(cwd);

// 创建新 session
const newSession = await sessionManager.create(cwd);

// 打开已有 session
const openedSession = await sessionManager.open(path);

// 继续最近 session
const recentSession = await sessionManager.continueRecent(cwd);

// 派生标题（从首条 user message）
const title = deriveTitle(newSession.entries.find(e => e.type === "user"));
```

### D5. UI 简化

V4 session 列表 UI：

- Home 主区：列出当前 cwd 下所有 sessions（`sessionManager.list(cwd)`）
- 每条显示：title + created_at + updated_at
- 无全文搜索框
- 点 session → `sessionManager.open(path)` + 订阅事件流（per ADR 0002 D2）
- "+ New" → `sessionManager.create(cwd)`

### D6. 词汇表清理

V3 `CONTEXT.md` 词汇表中与会话持久化相关的词条**整体删除**：

- `Conversation`（V3 SQLite 实体语义；V4 重新定义为 pi session 的 UI 投影）
- `Message`（V3 SQLite 实体语义；V4 重新定义为 pi session entry）
- `Bubble Boundary`（V3 renderer 渲染规则；V4 由 pi 事件投影决定）
- `Context Compaction`、`Compaction Entry`、`Compaction Marker`、`Auto Compaction Threshold`（V3 自建压缩机制；V4 改用 pi 内建 compaction）
- `Input History / Input History Cursor`（V3 历史栈；V4 简化为 pi session 自身的 history）

新增 V4 词条：

- `Pi Session`（基于 pi-coding-agent `SessionManager` 管理的 JSONL session 文件）
- `Session Entry`（pi session 文件中的单条记录：user / assistant / tool_use / tool_result / system）

## Considered

#### 选 1（已选）：全删 SQLite + 不迁移旧数据
彻底删除 SQLite 会话层，session 由 pi JSONL 管理，旧用户数据丢弃。

#### 选 2：保留 SQLite 作为 UI 投影层 + pi JSONL 作为 agent 状态
双轨：SQLite 用于 session 列表 UI 展示（title / created_at / updated_at），pi JSONL 作为 agent 运行时状态。问题：双写、双读、ID 映射、一致性——典型 dual-source-of-truth 反模式（per V3 git log ADR-0020 已 supersede 该模式）。**不选**。

#### 选 3：迁 SQLite → JSONL 但保留 SQLite 作为只读备份
旧数据导出为 JSON 文件供用户手动备份，新数据走 pi JSONL。问题：导出脚本 + 用户操作步骤 + 用户多半不会真用。**不选**。

## Consequences

### Positive

- **数据层单一**：V4 SQLite 仅保留 automations 相关表（per ADR 0006），会话数据统一在 pi SessionManager
- **Session 文件可移植**：JSONL session 文件可用 git / 文件备份 / 跨机器同步
- **代码量显著减少**：V3 conversations.store + messages.store + agent.store（合并后） + ConversationService + MessageService + FTS5 索引 全部删除
- **pi 的高级功能解锁**：compaction / fork / clone / tree structure 立即可用

### Negative

- **V3 旧用户数据丢失**：升级 V4 后看不到历史会话（grilled 决策已接受此代价）
- **失去 FTS5 全文搜索**：V3 用户习惯的 session 内容搜索功能删除
- **Title 派生规则不同**：V3 title 由首次 user message 截取 + 后续可编辑；V4 pi session title 由 pi 自动管理（per `SessionManager.create` 默认行为，可能与 V3 行为不一致）
- **session 文件位置分散**：每个 cwd 下独立 `.pi/sessions/` 目录，不像 V3 SQLite 单点存储

### Neutral

- **DB migration 工具保留**：`src/main/db/` 的 schema 迁移框架（`migrations/` 目录、`migrate` 函数）保留，automa tions 表继续使用
- **V3 automations 表保留**：per ADR 0006 automations 仍由 SQLite 持久化

## Cross-file impact

| 路径 | 变化 |
|---|---|
| `src/main/features/conversations/` | **整体删除** |
| `src/main/db/migrations/00XX-create-conversations.sql` | **删除** |
| `src/main/db/migrations/00XX-create-messages.sql` | **删除** |
| `src/main/db/migrations/00XX-create-fts.sql` | **删除** |
| `src/main/db/schema.ts` | 移除 conversations / messages / FTS5 表定义；保留 automations 相关 |
| `src/main/pi-runtime/session-manager.ts` | **新建**：cwd-scoped session CRUD |
| `src/renderer/src/features/chat/stores/conversations.store.ts` | **删除** |
| `src/renderer/src/features/chat/stores/messages.store.ts` | **删除** |
| `src/renderer/src/features/chat/stores/agent.store.ts` | **删除**（per V3 ADR-0020 已合并到 conversations.store，V4 整体删除） |
| `src/renderer/src/features/chat/stores/chat.store.ts` | 重写为 IPC 桥接层（订阅 pi events + 调用 pi IPC API） |
| `src/renderer/src/features/chat/components/chat-view.tsx` | 重写：session 列表来自 pi SessionManager IPC；消息流来自 IPC 事件投影 |
| `src/shared/lib/types.ts` | `Conversation` / `Message` schema 简化为 pi session UI 投影（id / title / created_at / updated_at） |
| `src/shared/lib/input-history.ts` + `input-history.store.ts` | **删除**（V4 由 pi session history 接管） |
| `CONTEXT.md` 词汇表 | 删除：`Conversation (V3 SQLite 实体)`、`Message`、`Bubble Boundary`、`Context Compaction`、`Compaction Entry`、`Compaction Marker`、`Auto Compaction Threshold`、`Input History`、`Input History Cursor`；新增：`Pi Session`、`Session Entry` |

## Reversibility

低可逆：

- 恢复 SQLite 会话层需重写 `conversations.store + messages.store + ConversationService + MessageService` + SQLite 表 + FTS5 索引
- 旧数据已丢，无恢复路径
- 撤回 V4 用户面临"两个 session 系统"的混乱

预计回滚耗时：2–3 周 + 旧数据已无法恢复（接受不可逆）。

## References

- pi-coding-agent SessionManager：`create(cwd) / open(path) / continueRecent(cwd) / list(cwd) / listAll(cwd)`
- pi-coding-agent Session JSONL：tree 结构 + compaction + fork/clone
- V3 SQLite + FTS5 持久化（per git log）：不追溯
- V3 ADR-0020（per-run transient agent + store source of truth）：不追溯