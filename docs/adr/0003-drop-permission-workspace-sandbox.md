# ADR 0003 — Drop Permission Model and Workspace Sandbox

**Status**: accepted · **Date**: 2026-08-20 · **Scope**: codeman-agent V4 安全模型 / 工具行为 / 词汇表清理
**Related**: ADR 0001 (V4 总纲 D4), ADR 0004 (drop workspace)

## Context

V3 维护了两套与 pi-coding-agent 安全语义**直接冲突**的运行时保护层：

1. **Workspace Sandbox**：`read_file` / `write_file` / `edit_file` 只能操作绑定 workspace root 内的文件，越界返回 `SandboxViolation` 错误（V3 ADR-0014 D2 + V3 ADR-0025 D2）。文件工具由 Electron main process handler 通过 `fs.realpath.native(path)` 检查路径是否在 workspace root 内。

2. **PermissionService + Permission Inline Dock**：`run_command` 工具在 main process 跑高风险命令时，先弹窗让用户 3 选 1（once / always / reject），UI 走 inline dock（V3 ADR-0077）。Session-scoped allow 规则存在内存 `Map<permission, Rule[]>` 中，不持久化。

pi-coding-agent 的官方安全语义（来自官方 README）：

> "Pi does not include a built-in permission system for restricting filesystem, process, network, or credential access. By default, it runs with the permissions of the user and process that launched it."

V4 采用 pi-coding-agent 全套内置工具（`createReadTool / createWriteTool / createEditTool / createBashTool / createGrepTool / createFindTool / createLsTool`）。这些工具**不**做 sandbox 校验、**不**触发权限确认——直接以当前用户权限操作文件系统与子进程。

V4 必须删除 V3 的两套保护层，否则会出现两套互不一致的安全模型（用户删文件：workspace sandbox 拦截但 pi bash 直接 rm 成功，行为不可预测）。

## Decision

### D1. 删 Workspace Sandbox

- **删除词汇表词条**：`Sandbox Violation`、`File Tool`（V3 含 sandbox 语义部分）、`Workspace`（详见 ADR 0004）
- **删除 src/main/features/file-ops/**：`fs.realpath` 沙箱校验代码、`SandboxViolation` 错误抛出
- **删除 src/renderer/src/tools/file-ops/**：V3 自建 `read_file` / `write_file` / `edit_file` / `search_files` / `delete_file` 的 `AgentTool` 定义
- **删除 `src/renderer/src/core/tools/file-*-tool.ts`** 等文件工具实现

V4 文件工具由 pi 内置 `createReadTool / createWriteTool / createEditTool / createGrepTool / createFindTool / createLsTool` 提供，操作 cwd 下任意文件（**无沙箱边界**）。

### D2. 删 PermissionService + Permission Inline Dock

- **删除词汇表词条**：`PermissionService`、`Permission Request`、`Permission Decision`、`Permission Inline Dock`
- **删除 src/main/features/permission/**：Effect Service `ask/reply/list` 实现
- **删除 src/renderer/src/features/chat/components/permission-bar.tsx`：Inline Dock UI
- **删除 src/renderer/src/features/chat/stores/permission.store.ts**：V3 的 pending permissions signal

V4 `run_command` 由 pi 内置 `createBashTool` 提供（直接子进程执行用户权限下的命令，**无弹窗确认**）。

### D3. webfetch 保留 SSRF 防护

V3 的 `webfetch` 工具在 main process 端实施 SSRF 防护（URL scheme 校验 + DNS 预解析 + IP 黑名单 + 大小限制 + 超时）。V4 把 `webfetch` 作为 `defineTool` 自定义工具**保留**该防护（详见 ADR 0010）。

### D4. 词汇表清理

V3 `CONTEXT.md` 词汇表中与权限 / 沙箱相关的词条**整体删除**：

- `Sandbox Violation`
- `Permission Service / Permission Request / Permission Decision / Permission Inline Dock`
- `File Tool`（V3 沙箱部分；迁移到 pi 内置后，文件工具语义变为"cwd 下的任意操作"）
- `Run Command`（V3 权限门部分；迁移到 pi 内置后，bash 工具语义变为"用户权限裸跑"）

## Considered

#### 选 1（已选）：全删，接受 pi 安全语义
删除 V3 沙箱 + 权限层，接受 pi 默认安全模型。

#### 选 2：在 pi 内置工具外层包安全校验
对 `createReadTool / createWriteTool` 等的 `execute` 函数做 cwd 校验拦截。问题：pi 的内置工具是深层闭包（内部可能再调子函数如 `createEditTool` 用 read-modify-write），包一层校验容易遗漏内层路径。**不选**。

#### 选 3：用 pi extension 重新实现文件工具
自写 5 个文件工具作为 pi extension，在 execute 内做 sandbox 校验。问题：跟 pi 内置工具重复、用户需在 settings 中显式禁用 pi 内置工具才能用自建版本，UX 复杂。**不选**。

## Consequences

### Positive

- **安全模型单一**：V4 全用 pi 默认安全模型，无"两套 sandbox 行为不一致"的 bug
- **工具行为对用户透明**：用户清楚知道 pi 跑在用户权限下，无"workspace 边界"心智负担
- **代码量显著减少**：V3 的 file-ops sandbox + PermissionService + permission-bar + permission.store 全部删除

### Negative

- **用户失去"workspace 边界"保护**：agent 可操作 cwd 下任意文件、任意 bash 命令，无任何拦截
- **取消"3 选 1 权限确认"**：V3 ADR-0077 的"高风险命令弹窗"产品语义删除
- **跨平台行为差异**：pi bash 工具在 Windows 走 `cmd.exe /c`，在 POSIX 走 `/bin/sh -c`，跨平台可能产生命令解析差异
- **产品定位改变**：从"沙箱桌面 agent" → "编码 agent"（详见 ADR 0001 D14 与 ADR 0011）

### Neutral

- **webfetch 的 SSRF 防护保留**：定义在 `defineTool` 的 execute 内部，独立于沙箱
- **API key 仍存明文**：仅位置从 `electron-store settings.json` 迁到 pi `auth.json`（详见 ADR 0008）

## Cross-file impact

| 路径 | 变化 |
|---|---|
| `src/main/features/file-ops/` | **整体删除** |
| `src/main/features/permission/` | **整体删除** |
| `src/main/features/run-command/` | **整体删除**（沙箱 + 权限门部分，bash 工具由 pi `createBashTool` 提供） |
| `src/renderer/src/tools/file-ops/` | **整体删除** |
| `src/renderer/src/features/chat/components/permission-bar.tsx` | **删除** |
| `src/renderer/src/features/chat/stores/permission.store.ts` | **删除** |
| `src/main/pi-runtime/tools/` | **新建**：注册 pi 内置 `createReadTool / createWriteTool / createEditTool / createBashTool / createGrepTool / createFindTool / createLsTool` |
| `src/main/pi-runtime/tools/webfetch.ts` | **新建**（详见 ADR 0010） |
| `src/shared/lib/errors.ts` | `SandboxViolation` TaggedError 子类删除；保留 `NotFound / Unauthorized / Network / InvalidConfig / Database / ToolCall / Unknown` + 新增 pi 错误映射子类（详见 ADR 0009） |
| `CONTEXT.md` 词汇表 | 删除：`Sandbox Violation`、`Permission Service`、`Permission Request`、`Permission Decision`、`Permission Inline Dock`、`File Tool`、`Run Command`（V3 沙箱/权限部分） |

## Reversibility

低可逆：

- 恢复 Workspace Sandbox 需重写 `main/features/file-ops/` + V3 `tools/file-ops/` + ADR-0014 D2 硬规则
- 恢复 PermissionService 需重写 `main/features/permission/` + `permission-bar.tsx` + `permission.store.ts` + ADR-0077

预计回滚耗时：1–2 周。

## References

- pi-coding-agent 安全语义：README "Pi does not include a built-in permission system..."
- pi-coding-agent 内置工具：`createReadTool / createWriteTool / createEditTool / createBashTool / createGrepTool / createFindTool / createLsTool`
- V3 ADR-0014 D2 / ADR-0025 D2（Workspace Sandbox）：不追溯，决策记录在 git log
- V3 ADR-0077（run_command permission inline dock）：不追溯