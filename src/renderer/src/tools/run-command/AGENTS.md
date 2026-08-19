# run_command — Shell 命令执行工具

`tools/` 是 6+1 白名单的新成员，与 `features/` 同级，存放 LLM-facing AgentTool 定义。每个 `tools/<name>/` 根级仅允许 `index.ts` + `AGENTS.md`，文件扁平不允许嵌套子目录。

## 文件清单

| 文件 | 用途 |
|------|------|
| `schemas.ts` | Effect Schema: `RunCommandParamsSchema` |
| `schemas.test.ts` | schema 边界值/拒绝测试 |
| `run-command.ts` | `runCommandTool` AgentTool 定义 |
| `run-command.test.ts` | 工具完整测试 (IPC mock) |
| `index.ts` | barrel 导出 |

外部依赖: `src/shared/apis/run-command.api.ts` (Service Tag + Live Layer)。

## 命名约定

- Schema field: camelCase (`command`, `cwd`, `timeoutMs`)
- Tool name: snake_case `run_command` (与 file-ops 族命名对齐，ADR-0048 D7)
- IPC channel: `"runCommand"`
- Method on window.codeman: `runCommand(args)`

## 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `command` | `string` | 是 | 完整命令字符串 |
| `cwd` | `string` | 否 | 工作目录，默认 `process.cwd()` |
| `timeoutMs` | `number` | 否 | 超时毫秒，默认 300_000（5 分钟），最大 1_800_000（30 分钟） |

## 结果形状

```typescript
type RunCommandResult =
  | { status: "ok";          exitCode: number; stdout: string; stderr: string; durationMs: number }
  | { status: "cancelled";   partialOutput: { stdout: string; stderr: string } }
  | { status: "timeout";     partialOutput: { stdout: string; stderr: string } }
  | { status: "error";       error: { kind: string; message: string; exitCode?: number } };
```

## 行为约束

| 项 | 值 |
|----|-----|
| 平台 | Windows (`cmd.exe /c`) / POSIX (`/bin/sh -c`) |
| 默认超时 | 5 分钟 |
| 最大超时 | 30 分钟 |
| 输出截断 | 1 MiB 以上：头 200 行 + `[... N bytes omitted ...]` + 尾 200 行 |
| 环境变量 | 仅透传白名单：`PATH`, `HOME`, `USERPROFILE`, `TMP`, `TEMP`, `LANG`, `LC_ALL`, `SystemRoot` |

## 风险模型

高风险命令触发确认弹窗（`dialog.showMessageBox`），分类依据：

| 类别 | 示例 |
|------|------|
| 危险命令 | `rm`, `del`, `format`, `shutdown`, `reg`, `diskpart`, `dd`, `mkfs`, `chmod`, `chown`, `sudo`, `Invoke-Expression`, `Remove-Item` |
| 破坏性 flag | `-rf`, `-fr`, `--force`, `/s`, `/q`, `-Recurse`, `-Force` |
| 路径越界 | 解析后绝对路径不在 `cwd` 内 |
| 解析失败 | shell-quote 抛错（视为高风险） |

用户拒绝 → 返回 `{ status: "error", error: { kind: "PermissionDenied", message: "用户拒绝执行" } }`。

## Task E 边界

- `src/main/features/run-command/exec.ts` — child_process 包装（超时/取消/输出截断）
- `src/main/features/run-command/risk.ts` — 命令解析 + 规则匹配（pure）
- `src/main/features/run-command/confirm.ts` — dialog.showMessageBox 弹窗
- `src/main/features/run-command/ipc.ts` — IPC handler 注册
- `src/main/ipc.ts` — `ipcMain.handle("runCommand", ...)`
- `src/preload/index.ts` — `codeman.runCommand` 暴露
- `src/renderer/__mocks__/ipc-mock.ts` — 测试 mock
