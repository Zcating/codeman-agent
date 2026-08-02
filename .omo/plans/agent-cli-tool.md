# 给 Agent 增加命令行工具

## 目标

为 Agent 增加 `run_command` 工具，使其能够调用 shell/可执行程序完成通用任务。
工具对外呈现为单个原子接口，内部由 Electron 主进程执行，遵守现有 IPC 模式。

## 范围

**In Scope**
- 新增 `run_command` AgentTool（基于 `@earendil-works/pi-agent-core` 的 `AgentTool` 接口）。
- 在 Electron 主进程注册 `runCommand` IPC handler，使用 `node:child_process`。
- 风险检测：命令解析 + 规则匹配 + 模型兜底。
- 高风险命令通过 Electron UI 弹窗确认（默认策略 B：高风险确认，普通放行）。
- 每条命令独立超时、取消、流式输出、输出截断。
- 单元测试与 IPC mock 测试。

**Out of Scope**
- 独立 CLI 入口（让用户从终端启动 Agent）。
- 工作区隔离 / 沙箱文件系统。
- 多 Agent 共享 CLI 会话。
- Windows UAC 提权 / Linux capability 提升。

## 设计

### 工具 API（Agent 视角）

单个工具 `run_command`：

```typescript
interface RunCommandParams {
  command: string;            // 完整命令字符串
  cwd?: string;               // 工作目录，相对当前会话工作区
  timeoutMs?: number;         // 默认 300_000；最大 1_800_000
}

type RunCommandResult =
  | { status: "ok";       exitCode: number; stdout: string; stderr: string; durationMs: number }
  | { status: "cancelled"; partialOutput: { stdout: string; stderr: string } }
  | { status: "timeout";   partialOutput: { stdout: string; stderr: string } }
  | { status: "error";     error: { kind: string; message: string } };
```

### Electron 架构

| 层 | 文件 | 职责 |
|---|---|---|
| Renderer (Tool) | `src/renderer/src/tools/run-command/run-command.ts` | 定义 `AgentTool`，参数 schema，调 IPC |
| Renderer (Schema) | `src/renderer/src/tools/run-command/schemas.ts` | Effect Schema |
| Renderer (API) | `src/renderer/src/shared/apis/run-command.api.ts` | `RunCommandApi` Service + Live layer（包装 invoke） |
| Preload | `src/preload/index.ts` | 暴露 `runCommand` 到 `window.codeman` |
| Main (IPC) | `src/main/features/run-command/ipc.ts` | 注册 `runCommand` handler |
| Main (Exec) | `src/main/features/run-command/exec.ts` | `child_process` 包装、取消、超时、输出截断 |
| Main (Risk) | `src/main/features/run-command/risk.ts` | 命令解析 + 规则匹配（pure，无 IO） |
| Main (Confirm) | `src/main/features/run-command/confirm.ts` | 通过 `dialog.showMessageBox` 弹窗 |
| Chat Runtime | `src/renderer/src/features/chat/lib/runtime.ts` | 注册到 `tools` 数组 |

### 风险检测（C 选项落地）

**步骤**：
1. 用 `shell-quote` / `parse-pretty` 把命令拆 token；
2. 维护高风险集合：`rm`, `del`, `format`, `shutdown`, `reg`, `diskpart`, `dd`, `mkfs`, `chmod`, `chown`, `sudo`, `iexe`, `Invoke-Expression`, `Remove-Item -Recurse` 等；
3. 检测破坏性 flag：`-rf`, `-fr`, `--force`, `/s`, `/q` 等；
4. 检测路径越界：解析后的绝对路径不在 `cwd` 内；
5. 检测下载并执行：`curl ... | sh`, `iex(...)`, `Invoke-WebRequest ... | iex`；
6. 解析失败或命中不确定命令 → 标记 `needsModelFallback = true`；
7. 风险判断结果附 `reason` 字符串，用于弹窗展示。

### 高风险弹窗确认（B 选项落地）

主进程通过 `dialog.showMessageBox`：

- 标题：`是否允许执行此命令？`
- 内容：完整命令、工作目录、风险类别、风险原因；
- 按钮：`允许一次` / `拒绝` / `停止当前任务`；
- 解析失败的命令默认需要确认；
- 模型兜底判断失败（不可用 / 超时）默认需要确认。

### 超时、取消、输出

- `AbortController` 持有 `child_process` 句柄；
- `signal.aborted` 时调用 `process.kill('SIGTERM')`，3 秒后未退出再 `SIGKILL`（Windows 用 `taskkill /pid /T /F`）；
- 默认超时 5 分钟，最大 30 分钟；超时分阶段取消；
- stdout/stderr 按行缓存，最近 1000 行常驻内存；
- 输出总大小超过 1 MiB 时截断为头 200 行 + 尾 200 行 + 摘要；
- 流式事件通过 IPC `webContents.send('runCommand:event', { commandId, event })` 回推（用于未来 Agent 流式读取；本期同步等待为主，事件通道预留）。

### 测试策略

| 文件 | 覆盖 |
|---|---|
| `risk.test.ts` | 命令解析 + 规则匹配单元测试 |
| `exec.test.ts` | `child_process` 包装：超时、取消、输出截断 |
| `confirm.test.ts` | 弹窗确认逻辑（mock `dialog`） |
| `run-command.test.ts` | Tool 层 IPC mock 测试 |
| `schemas.test.ts` | 参数 schema 边界 |

## 工作分解

按文件独立性切分，前 4 项可并行：

1. **Schemas + Risk 模块**（renderer schemas.ts + main risk.ts）— 无 IPC 依赖
2. **Exec 模块**（main exec.ts）— 无 UI 依赖
3. **Confirm 模块**（main confirm.ts）— mock dialog
4. **Renderer Tool + API + 测试**（依赖 schemas）— 与 #2、#3 并行（用 mock IPC）

后 2 项串行：

5. **IPC 接线**（preload + main/ipc.ts 注册）— 依赖 #2、#3 完成
6. **Runtime 注册**（features/chat/lib/runtime.ts）— 依赖 #4 完成

## 非目标 / 后续

- 模型兜底（解析失败时调用 LLM 判断风险）本期仅留接口，不实现。
- 工作目录是否默认受限于 Agent 工作区路径 → 留给后续安全加固工作。
- 输出作为事件流回推给 Agent（流式 partial result）→ 留给后续增强。
- 独立 CLI 入口（`codeman run`）→ 完全独立的后续工作单元。

## 验证标准

- `vp run typecheck` 通过；
- `vp run test` 全绿，新模块覆盖率 ≥ 80%；
- 弹窗确认 e2e：执行 `rm -rf /tmp/x` 触发弹窗，点击"允许一次"后命令继续；
- 超时：执行 `sleep 60` 设置 `timeoutMs: 1000`，返回 `{ status: "timeout" }`；
- 取消：从 UI 触发取消，立即返回 `{ status: "cancelled" }`；
- 输出截断：执行 `yes | head -n 100000`，返回内容包含头尾 + 摘要，不撑爆内存。

## 风险

- Windows 下 `child_process` 路径处理与 shell 选择（cmd.exe vs PowerShell vs bash）需统一；默认走 `cmd.exe /c`，用户参数里若含 PowerShell 惯用语法需文档说明。
- `shell-quote` 对 PowerShell 解析有限，兜底标记为高风险。
- 弹窗阻塞主进程：使用 `dialog.showMessageBox` 是同步的，会卡住所有 IPC；如出现性能问题改为非阻塞 webContents 事件回推。