# 0048 — 给 Agent 增加 `run_command` 命令行工具

**Status**: accepted · **Date**: 2026-08-03
**Scope**:
- 新增: `src/renderer/src/tools/run-command/` (renderer tool — 同 ADR-0038 webfetch 布局)
- 新增: `src/main/features/run-command/` (main exec + risk + confirm + IPC handler)
- 改: `src/preload/index.ts` + `src/main/ipc.ts` (注册 `runCommand` IPC)
- 改: `src/renderer/src/shared/apis/invoke.api.ts` (CodemanApi 增 `runCommand`)
- 改: `src/renderer/src/features/chat/lib/runtime.ts` (注入 `runCommandTool`)
- 改: `src/renderer/src/__mocks__/ipc-mock.ts` (mock 入口)
- 改: `CONTEXT.md` (`run_command` 词条)
- 计划: `.omo/plans/agent-cli-tool.md`

**Related**:
- ADR-0038 (webfetch — 镜像布局与 IPC 模式)
- ADR-0013 + 0013.1 (file-ops — 工具结构基线)
- ADR-0025 (Effect Schema 全栈)
- ADR-0026 (IPC channel camelCase)
- ADR-0003 (Effect-TS 逻辑层)

## Context

### 触发:Agent 缺本地命令执行能力

`@earendil-works/pi-agent-core` v0.80.3 不内置 shell/CLI 工具(经核查 `dist/index.d.ts` 与 `harness/utils/shell-output.ts` 均未导出 `AgentTool` 形态)。当前 Agent 工具集(经 ADR-0038 收敛后):

| 工具 | 范围 |
|---|---|
| `read_file` / `write_file` / `edit_file` / `search_files` / `delete_file` | 文件操作 |
| `webfetch` | 公网 HTTP 抓取 |
| `load_skill` | 加载技能 |
| MCP 工具集 | 用户/服务端注入 |

缺一类:**让 Agent 调用 shell/可执行程序**。典型场景:
- 跑 `pnpm test` / `pnpm build` / `git status` / `git diff` / `git commit` 等构建/版本控制命令;
- 跑项目内脚本 (`pnpm prisma migrate` / `pnpm typecheck` / 测试运行器);
- 触发系统工具(`where`, `echo`, 读取 PATH 信息)。

PI 不提供开箱即用工具 → 必须自建。

### 用户决策回顾(2026-08-03 `/grilling` 锁定)

| 主题 | 选择 |
|---|---|
| CLI 类型 | A:让 Agent 能执行命令行(不做独立 CLI 入口) |
| 权限策略 | B:默认允许,高风险命令确认 |
| 确认通道 | A:Electron `dialog.showMessageBox` 弹窗 |
| 风险识别 | C:规则匹配 + 命令解析 + 模型兜底 |
| 超时/取消 | C:每条命令独立超时 + 取消 + 流式 |
| 工具 API | C:对外只暴露 `run_command`(内部资源句柄管理生命周期) |
| 暴露范围 | C:默认暴露所有 Agent 会话 |

## Decision

### D1 — 单工具 `run_command`,内部资源句柄

```typescript
// 输入 (Renderer schema)
interface RunCommandParams {
  command: string;          // 完整命令字符串
  cwd?: string;             // 相对会话工作区
  timeoutMs?: number;       // 默认 300_000,最大 1_800_000
}

// 输出 (typed result)
type RunCommandResult =
  | { status: "ok";         exitCode: number; stdout: string; stderr: string; durationMs: number }
  | { status: "cancelled";  partialOutput: { stdout: string; stderr: string } }
  | { status: "timeout";    partialOutput: { stdout: string; stderr: string } }
  | { status: "error";      error: { kind: string; message: string } };
```

内部用 `startCommand` / `waitForCommand` / `cancelCommand` 资源句柄模型实现(electron main 进程),对外只暴露 `runCommand` 一个 IPC 通道。

**理由**:Agent 工具语义应保持原子化(无生命周期管理暴露),内部细节由 main 进程封装。

### D2 — IPC 走 main 进程 + renderer Service

与 webfetch/file-ops 同构:

```
AgentTool: run_command
  → renderer Service (run-command.api.ts)
  → invoke("runCommand", { command, cwd?, timeoutMs? })
  → preload (window.codeman.runCommand)
  → ipcMain.handle("runCommand", sandboxHandler(...))
  → main features/run-command/exec.ts (child_process)
```

不暴露 Node API 到 renderer(sandbox)。

### D3 — 落位 (与 ADR-0038 一致)

```
src/renderer/src/tools/run-command/
├── run-command.ts          # runCommandTool AgentTool 定义
├── run-command.test.ts     # tool 层测试 (mock IPC)
├── schemas.ts              # RunCommandParamsSchema
├── schemas.test.ts
├── index.ts                # barrel
└── AGENTS.md

src/main/features/run-command/
├── exec.ts                 # child_process 包装(超时/取消/输出截断)
├── exec.test.ts
├── risk.ts                 # 命令解析 + 规则匹配(pure)
├── risk.test.ts
├── confirm.ts              # dialog.showMessageBox 弹窗
├── confirm.test.ts
├── ipc.ts                  # IPC handler 注册
├── ipc.test.ts
└── index.ts                # 公开 API
```

`tools/run-command/` 根级仅允许 `index.ts`(barrel)+ `AGENTS.md` + 同级代码文件,无嵌套子目录。

### D4 — 风险检测 (C 选项落地,模型兜底留接口)

风险分类 → 触发弹窗确认:

| 类别 | 示例 |
|---|---|
| 高危命令 | `rm`, `del`, `format`, `shutdown`, `reg`, `diskpart`, `dd`, `mkfs`, `chmod`, `chown`, `sudo`, `iexe`, `Invoke-Expression`, `Remove-Item -Recurse` |
| 破坏性 flag | `-rf`, `-fr`, `--force`, `/s`, `/q` |
| 路径越界 | 解析后绝对路径不在 `cwd` 内 |
| 下载并执行 | `curl ... \| sh`, `iex(...)`, `Invoke-WebRequest ... \| iex` |
| 解析失败 | shell-quote 抛错 → 视为高风险,弹窗要求人工判定 |
| 兜底接口 (本期空) | `needsModelFallback = true` 时调用 LLM 判断 — 本期仅留 hook,默认实现为"弹窗确认" |

实现位于 `src/main/features/run-command/risk.ts`:**pure 函数**,无 IO,便于单元测试。

### D5 — 弹窗确认 (B 选项落地)

通过 `dialog.showMessageBox` 弹窗:

```
是否允许执行此命令？
命令: rm -rf ./node_modules
工作目录: C:\Users\zcati\project
风险类别: 高危命令 (rm) + 破坏性 flag (-rf)
风险原因: 该命令会递归删除目录且不可恢复

[允许一次]   [拒绝]   [停止当前任务]
```

- 默认按钮:`拒绝`(防误触);
- 用户拒绝 → 返回 `RunCommandResult` 的 `{ status: "error", error: { kind: "PermissionDenied", message: "用户拒绝执行" } }`;
- `停止当前任务` → 中断当前会话后续所有命令请求(本期实现为单命令拒绝 + cancel signal,任务级停止由 chat runtime 处理)。

### D6 — 超时、取消、输出

- `AbortController` 持有 `child_process` 句柄;
- `signal.aborted` → `process.kill('SIGTERM')`;3 秒后未退出 → Windows 用 `taskkill /pid /T /F`,POSIX 用 `SIGKILL`;
- 默认超时 5 分钟,最大 30 分钟;超时分阶段取消;
- stdout/stderr 按行缓存,最近 1000 行常驻内存;
- 输出总大小超过 1 MiB 时截断为头 200 行 + 尾 200 行 + 摘要(避免上下文窗口撑爆);
- 流式事件通道 `runCommand:event` 通过 `webContents.send` 回推,本期保留接口,工具同步等待为主。

### D7 — LLM-facing name: `run_command`

snake_case 与 file-ops 族一致(`read_file` / `write_file` 等历史命名,见 ADR-0038 D6)。新工具沿用 snake_case 与 file-ops 视觉对齐。

### D8 — 平台差异

- Windows:默认走 `cmd.exe /c <command>`,PowerShell 语法(`Invoke-Expression` 等)会触发 D4 高风险分类;
- macOS/Linux:走 `/bin/sh -c <command>`;
- `PATH` 由 child_process 自然继承,但 API key 等敏感环境变量需在 main 进程 `env` 构造时显式剔除(白名单: `PATH`, `HOME`, `USERPROFILE`, `TMP`, `TEMP`, `LANG`, `LC_ALL`)。

## Known Limitations (V1)

1. **模型兜底未实现**:`needsModelFallback = true` 时仅"标记 + 弹窗",未真正调用 LLM 判断风险;
2. **沙箱未启用**:`cwd` 仅做"路径越界检查",不强制命令必须在 `cwd` 内执行(用户可在弹窗中选择"允许一次"放宽);
3. **环境变量透传**:仅白名单透传,不区分用户级/会话级;
4. **PowerShell 解析精度**:`shell-quote` 对 PowerShell 语法支持有限,部分高危 PowerShell 命令可能漏检 → 依赖 D4 关键词兜底;
5. **同步等待输出**:流式事件通道虽注册,但工具 `execute()` 仍是同步等待完成才返回;流式 partial result 留作 V2。

## Considered Options

### D1 reject: 多工具 (startCommand / waitForCommand / cancelCommand)

将生命周期暴露给 Agent。**否决**:Agent 工具语义原子化,内部细节由 main 进程封装更可控;多工具增加 prompt 长度且容易写出"忘记取消"的工具调用。

### D7 reject: 单字名 `run`

`run` 太通用,LLM 可能误用为"run app / run server"等非 shell 含义。`run_command` 明确语义。

### D2 reject: 纯 renderer 端 (Node integration)

Electron renderer 启用 Node integration 会显著扩大攻击面,且 SSRF 之外没有"风险门控"自然落点。坚持走 main 进程 IPC。

## Consequences

### 正面

- Agent 具备 shell 执行能力,可覆盖"构建/版本控制/项目脚本/诊断工具"四类典型场景;
- 风险识别覆盖命令 + flag + 路径三个维度,漏报率低于纯关键词方案;
- 弹窗确认提供明确风险展示 + 用户决策路径,普通命令不打扰;
- 与 webfetch/file-ops 同构布局,工具集代码风格一致;
- 留出 `needsModelFallback` 接口,后续接入 LLM 风险判断无需重构。

### 代价

- 新增 IPC 通道 `runCommand` (36 → 37 channels);
- 新增依赖:`shell-quote` (命令解析);
- `src/main/features/run-command/` 5 文件 + 测试(预计 +12 files / ~600 LOC);
- `run-command` 风险规则需要长期维护(误报/漏报权衡)。

### 未变

- PI runtime 不变,新增工具是 `AgentTool` 注册,不改 `Agent` class;
- `features/` 下 chat/settings 不受影响;
- `tools/` 白名单(6+1)无需扩展 — run-command 落在已存在的 `tools/<name>/` 模式;
- `runtime.ts` 工具数组仅追加,不修改现有顺序。

## Rollout Plan

按 TDD + 并行派发实现,任务展开见 `.omo/plans/agent-cli-tool.md` 工作分解章节。预期 6 个独立 commit:

1. **Task A** (commit `xxxxxxx`): `risk.ts` + `risk.test.ts` (pure 风险识别,无 IPC)
2. **Task B** (commit `xxxxxxx`): `schemas.ts` + `schemas.test.ts` (renderer Effect Schema)
3. **Task C** (commit `xxxxxxx`): `exec.ts` + `exec.test.ts` (main 进程 child_process 包装)
4. **Task D** (commit `xxxxxxx`): `confirm.ts` + `confirm.test.ts` (main 弹窗)
5. **Task E** (commit `xxxxxxx`): `run-command.ts` + `run-command.test.ts` + `run-command.api.ts` + `ipc.ts` + `preload` + `invoke.api.ts` + `runtime.ts` + `ipc-mock.ts` (接线层)
6. **Task F** (commit `xxxxxxx`): ADR-0048 + CONTEXT.md 更新

并行性:
- A、B、C、D 文件集无交集,可并行实现;
- E 依赖 A/B/C/D 完成,串行;
- F 依赖 E,串行。

## References

- ADR-0038 (webfetch agent-tool — 镜像布局)
- ADR-0013 (file-io-tools — 工具结构基线)
- ADR-0013.1 (camelCase wire format)
- ADR-0025 (Effect Schema 全栈)
- ADR-0026 (IPC channel camelCase)
- ADR-0003 (Effect-TS 逻辑层)
- ADR-0010 (5+1 → 6+1 文件夹白名单)
- `@earendil-works/pi-agent-core` v0.80.3 `AgentTool` 接口 (types.d.ts:324-343)
- `.omo/plans/agent-cli-tool.md` (详细计划 + TDD 展开)