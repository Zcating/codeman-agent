# ADR 0013 — V2 启动: File IO Tools + Workspace Sandbox

**Status**: accepted for design (V2 启动时实施), deferred for implementation
**Date**: 2026-06-17

## Context

V1.6+ 用户提出新需求: agent 应能读 / 写本地文件 (典型如 code review、
note taking、project scaffolding)。V1 CONTEXT.md Non-goals 锁
"无 shell、无文件系统、无 IDE 集成", V1 设计上避开了 agent 接触 fs。
webview 没有 fs 能力 (V8 / Chromium 内核), pi-mono agent loop 在
webview, fs syscall 必须经 IPC 到 Tauri (Rust)。

grill-with-docs 决议 (2026-06-17) 锁定: **架构沿用 Hybrid, 沙箱用
Workspace 边界, 5 工具, V2 启动**。

## Decision

### A. 架构: 沿用 Hybrid (D), 不迁 Node sidecar

pi-agent 仍跑 webview; fs syscall 走 Tauri command (Rust)。模式与
现有 billing tool 同构:

```
pi-agent (webview TS)
  → AgentTool.execute (e.g. read_file)
    → invoke("read_file", { workspace_id, path })
      → Tauri IPC
        → Rust #[tauri::command] read_file
          → canonicalize(path)
          → 验证 starts_with(workspace.root)
          → std::fs::read_to_string
        ← 返回 content
      ← 跨 IPC 返回
    ← 喂给 pi-agent
  → 喂回 LLM
```

### B. File Tool 族 (V2 内置 5 个)

| Tool           | 签名                                                           | 语义                                 |
| -------------- | -------------------------------------------------------------- | ------------------------------------ |
| `read_file`    | `(workspace_id, path) -> string`                               | 读全文                               |
| `write_file`   | `(workspace_id, path, content) -> ()`                          | 覆盖写 (原子 rename 兜底)            |
| `edit_file`    | `(workspace_id, path, old_text, new_text, replace_all?) -> ()` | search/replace (V2 启动时定细节)     |
| `search_files` | `(workspace_id, glob, content_pattern?) -> Match[]`            | glob + content 双过滤                |
| `delete_file`  | `(workspace_id, path) -> ()`                                   | 移至回收站 (Windows SHFileOperation) |

### C. 沙箱: Workspace-based, Rust 端校验

`Settings.workspaces: Array<{ id, label, root_path, enabled }>` —
用户在 Settings UI 配 1-N 个 workspace (类似 Claude Code `--add-dir`)。

每个 Tauri command **必须**先做:

```rust
let canonical = std::fs::canonicalize(&path)?;  // 解析 symlink + 归一化
let workspace = state.workspaces.iter()
    .find(|w| w.id == workspace_id && w.enabled)
    .ok_or(AppError::WorkspaceNotFound)?;
if !canonical.starts_with(&workspace.root) {
    return Err(AppError::SandboxViolation { path, workspace_id });
}
// ... 真正 fs 操作
```

越界返回 `SandboxViolation` (V1.5+ 错误码, 新增于本 ADR)。

### D. Settings UI: Workspace 管理页

新增 workspace 配置子组件 (Card 子件, 复用 shared/components/ui/card.tsx):

- 列表: 每个 workspace 一张 Card (id / label / root_path / enabled toggle)
- 新增: 文件 picker 选 root_path
- 删除: 二次确认 dialog

### E. Tauri command surface (V2 新增 5 个)

```rust
#[tauri::command]
async fn read_file(workspace_id: String, path: String) -> Result<String, AppError>;

#[tauri::command]
async fn write_file(workspace_id: String, path: String, content: String) -> Result<(), AppError>;

#[tauri::command]
async fn edit_file(
    workspace_id: String,
    path: String,
    old_text: String,
    new_text: String,
    replace_all: bool,
) -> Result<(), AppError>;

#[tauri::command]
async fn search_files(
    workspace_id: String,
    glob: String,
    content_pattern: Option<String>,
) -> Result<Vec<FileMatch>, AppError>;

#[tauri::command]
async fn delete_file(workspace_id: String, path: String) -> Result<(), AppError>;
```

所有 command 在 `src-tauri/src/commands/filesystem.rs` (V2 新建模块),
注册到 `lib.rs::invoke_handler` 的 Tauri builder。

## Considered Options

### D. Hybrid (chosen)

pi-agent 留 webview, fs 走 Tauri command。

**理由**:

- 与 ("所有 file 形态的东西走 Tauri 命令") 字面一致, 是延伸不是逆转
- 与 (billing 移 TS 同进程 tool dispatch) 同构, AgentTool.execute 模式直接复用
- Rust 端 `canonicalize + starts_with` 是现成 path validation, 不可绕过
- Tauri permission system 保护 invoke surface
- 0 进程边界, 0 额外延迟, 0 打包复杂度

### A. Node sidecar (rejected)

spawn node 子进程跑 pi-mono, Tauri webview JSON-RPC 转发。

**否决理由**:

- 与 第 38-40 行字面冲突 ("agent loop 绑定到 Tauri webview")
- 与 第 174 行延期冲突 ("E. billing 进 Node sidecar (V1.6+) 评估", 当时未做)
- +50-200ms 工具调用延迟 (跨进程 IPC)
- 进程生命周期复杂 (spawn / kill / 孤儿 / 重启)
- node `fs` 拿到全 disk 权限, 沙箱需自写, 弱于 Tauri permission system
- 打包需嵌入 node 二进制 (Tauri 单 binary → binary + node sidecar)
- 用户最初提案 ("webview 不能 fs → pi 必须后端") 在 Hybrid 下彻底解决, Node sidecar 实际为 file IO 增加代价不增加能力

### B. Rust 重写 agent loop (rejected)

弃 pi-mono, 自己用 Rust 写 agent loop。

**否决理由**:

- ~6 个月起的工作量
- 失去 pi-mono 自动获得的 LLM provider 维护 (他们加 provider 我自动获得, 我加要自己实现)
- 与 + 实质逆转
- V2 范围超界, 应为 V3+ 长期议题

### C. Rust 主导 (rejected)

Rust 成为 agent runtime, webview 只渲染。

**否决理由**:

- 产品从 "webview 跑 agent" 变成 "native agent + 嵌入式 webview UI", 定位大变
- Solid UI → Rust 的桥接需要重写 chat runtime / store 拓扑 / IPC surface
- 失去 Effect-TS 逻辑层优势

## Consequences

### 正面

- V1 Non-goal "无文件系统" 解除, agent 能与本地文件交互
- 沙箱由 Rust path validation 保证, 不可绕过
- 5 工具实现模式与现有 billing tool 同构, 桥接层 / 测试 / IPC 模式直接复用
- Settings UI 用现有 Card 子件, 无新设计系统
- 与 + 不冲突, 是延伸不是逆转
- Tauri store 仍为 API key 唯一存储, LLM / Billing 密钥处理不变

### 代价

- Tauri command 表面 +5 (V2 共 ~13 个 IPC)
- Settings schema + workspaces 字段 + V1 → V2 migration 逻辑
- Settings UI + workspace 管理页 (Card 子件, ~1-2 天)
- File tool schema + execute handler (5 个, ~1 周)
- Tauri command Rust 实现 + sandbox path validation (~1 周)
- 集成测试 + E2E spec (~1 周)
- **总计 ~2-3 周全栈工作量**
- V2 启动时需评估: edit_file 语义细化 (line 边界 / 边界 replace_all 行为) /
  write_file 原子性 (写时断电保护) / search_files 大目录性能 /
  delete_file 回收站跨平台一致性 / 大文件 context window 截断

### 未变

- pi-mono 仍跑 webview (与 + 一致)
- 单进程, 单 main 窗口, 单 Tauri 包
- Effect-TS 逻辑层, UI 不导入 effect
- Tauri store 仍为 API key 唯一存储
- LLM / Billing 工具不接触 fs (V1.5 已分离, 路径不变)
- 单一持久化路径 (Tauri store + SQLite)

## Timing

- **V1.5 sprint 不动**: 继续完成 billing 迁移 + features 5+1 重构
- **V2 启动时**: 起 feature branch, 实施本 ADR
- 本 ADR 在 V2 启动前是 "design accepted, implementation deferred" 状态
- V1.5 期间若再有 file IO 需求讨论, 引本 ADR 作 design reference, 不重新打开架构讨论

## Amendments

- **Amended by **（2026-07-12）：上表（B. File Tool 族）字段名规则从 snake_case（`workspace_id` / `old_text` / `new_text` / `replace_all` / `content_pattern`）改为 camelCase（`workspaceId` / `oldText` / `newText` / `replaceAll` / `contentPattern`）。本 ADR 的 5-工具架构 / Hybrid 决策 / Workspace 沙箱 / Tauri command 签名（Rust 内部 snake_case 不变）等决策不受影响。Field 名变更同步到 file-tools 域（含 5 个 `Schema.Struct` field + 测试 fixture + `createFileTools` wrapper）。

## References

- (pi-mono agent runtime) — 锁定 webview, 避开 fs 代码路径
- (Unified Provider schema) — billing 移 TS 同进程 tool dispatch 模式
- (anthropic-messages-only) — LLM 协议层
- CONTEXT.md "File IO (V2 路线图, via)" — 新增词汇表
- CONTEXT.md V1 Non-goals — "无文件系统" 由本 ADR 解除 (V2 启动时)
- grill-with-docs session 2026-06-17 — 决议依据
