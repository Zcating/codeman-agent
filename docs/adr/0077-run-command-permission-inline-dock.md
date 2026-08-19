# — Run-Command Permission: Inline ChatView Dock

**Status**: accepted · **Date**: 2026-08-17

## Context

run-command 工具高风险命令的确认弹窗建在 Electron main 进程,调用 `dialog.showMessageBox` —— 这是 OS 级 native modal,跳出 chat 上下文。用户在使用 chat-view 与 LLM 交互时,遇到 tool call 触发的风险命令,确认弹窗会让用户离开 chat 进入 OS 桌面环境。

## Decision

### D1. 抽象:PermissionService (Effect Context.Service)
将 permission 从 `run-command` 模块内部提升为独立 `PermissionService`(main 端 Effect Service)。

Service 接口:
```ts
ask(input): Effect.Effect<void, RejectedError>
reply(input): Effect.Effect<void, NotFoundError>
list(): ReadonlyArray<PendingRequest>
```

reply 的三态:
- `once`:本条放行
- `always`:本条放行 + 写 session-scoped allow 规则(内存 Map,不持久化)
- `reject`:拒绝 + 同 session 其它 pending 链式拒绝

### D2. inline radio:覆盖 chat-view 输入框
用户决策 UI 渲染在 chat-view 输入框区,3 选 1 横向布局:拒绝 / 总是允许 / 允许一次。

### D3. 触发链路:renderer 两步 IPC
LLM tool_call → renderer AgentTool.execute 走两步 IPC:
```ts
const risk = await invoke('runCommandAssess', {command, cwd});
if (risk.kind === 'high') {
  const requestID = crypto.randomUUID();
  const decision = await waitForUserDecision(requestID);
  if (decision === 'reject') return PermissionDenied;
  return await invoke('runCommandExecute', {command, cwd, timeoutMs, decision});
}
return await invoke('runCommandExecute', {command, cwd, timeoutMs});
```

### D4. IPC channels
| Channel | 方向 | 用途 |
| --- | --- | --- |
| `runCommandAssess` | renderer → main | 同步调 main 端 `assessRisk`,返回 risk.kind |
| `runCommandExecute` | renderer → main | renderer 在用户决策后调;main 端 `executeCommand` |
| `runCommand:permission:asked` | main → renderer | main 端 publish permission pending 通知 renderer |
| `runCommand:permission:replied` | main → renderer | main 端 publish pending 解锁通知 |

`runCommand`(旧 IPC channel)保留路径作废,全部走 `runCommandExecute`。

### D5. Pending 状态机(main 端,Effect Deferred)
借鉴 opencode `@opencode/Permission`:
- ask: 创建 PendingEntry {info, deferred}, pending.set(id, entry), publish 'permission:asked', await deferred + ensure cleanup
- reply: switch on reply (once / always / reject)

### D6. "总是允许"语义 = 本次 session 生效
`always` 选择写入 `approved: Map<permission, Rule[]>`(内存,per-process)。不持久化到 SQLite 或 settings。

### D7. reject 语义 = 停止当前任务
reject 等价于"停止当前任务":
- Deferred.fail → tool execute 返回 `PermissionDenied`
- 链式拒绝:同 session 所有其它 pending 也 reject

## Consequences

### 新增
- `src/main/features/permission/index.ts` — PermissionService Effect Service
- `src/renderer/src/features/chat/components/permission-bar.tsx` — 覆盖 chat-input 的 3 选 1 组件
- IPC channels: `runCommandAssess`, `runCommandExecute`, `runCommandReply`

### 修改
- run-command 工具两步 IPC 调用
- chat.store 增加 `pendingPermissions` 状态 + `add/resolve` helpers
- chat-view 渲染 `<PermissionBar>`
