# ADR 0002 — Runtime in Main Process, Renderer as Pure View

**Status**: accepted · **Date**: 2026-08-20 · **Scope**: codeman-agent V4 进程边界 / IPC 流式事件桥 / Renderer 角色
**Related**: ADR 0001 (V4 总纲), ADR 0006 (feature-to-extension mapping), ADR 0009 (error mapping)

## Context

V3 runtime 跑在 renderer（webview）里——纯浏览器上下文，零 `node:` import。pi-coding-agent 依赖 Node：

- `cross-spawn`（内置 `bash` 工具子进程）
- `undici`（HTTP client）
- `@silvia-odwyer/photon-node`（原生 WASM 模块，图像处理）
- `Node ≥22.19.0`（`engines.node` 约束）
- `SessionManager` 文件系统操作（`create(cwd)` 需要 cwd、`open(path)` 读 JSONL 文件）

这些在浏览器里根本跑不了。V4 必须把 runtime 整体迁到 Electron main process。

## Decision

### D1. Runtime 在 main process 启动

V4 main process 在 `app.whenReady()` 后创建 `PiRuntime` 单例：

```typescript
// src/main/pi-runtime/index.ts
import { createAgentSession, SessionManager, ModelRuntime, SettingsManager } from "@earendil-works/pi-coding-agent";

export async function createPiRuntime(opts: {
  cwd: string;
  providerConfigPath?: string;
}): Promise<PiRuntime> {
  const modelRuntime = await ModelRuntime.create({
    configPath: opts.providerConfigPath ?? path.join(app.getPath("userData"), "pi", "auth.json"),
  });
  const settingsManager = SettingsManager.create(/* ... */);
  const sessionManager = SessionManager.inMemory();

  const { session, ... } = await createAgentSession({
    sessionManager,
    modelRuntime,
    settingsManager,
    cwd: opts.cwd,
  });

  return { session, modelRuntime, settingsManager };
}
```

main process 暴露 IPC handlers：

- `ipcMain.handle("pi:create-session", ...)` → 创建 pi session
- `ipcMain.handle("pi:prompt", ...)` → 用户消息下发
- `ipcMain.handle("pi:abort", ...)` → 取消当前 stream
- `ipcMain.handle("pi:set-cwd", ...)` → 切换 cwd（替代 V3 的 workspace 切换）

### D2. 流式事件：main → renderer via `webContents.send`

沿用 V3 ADR-0025 D7 的 IPC 流式模式：

```typescript
// src/main/pi-runtime/event-bridge.ts
session.subscribe((event) => {
  const wc = BrowserWindow.fromId(senderId)?.webContents;
  if (!wc.isDestroyed()) {
    wc.send("pi:event", projectPiEvent(event));
  }
});
```

renderer 通过 `window.codeman.onPiEvent((event) => ...)` 订阅。

### D3. Renderer = 纯视图层

Renderer 不再持有任何 pi-related 类型，**不** `import "@earendil-works/pi-coding-agent"`。所有 pi 交互通过 `window.codeman.*` IPC API。

Renderer 侧的聊天 UI（消息流 / 工具调用可视化 / 输入区 / settings 页面）保留 V3 Solid.js 实现，事件源从 `core/llm/runtime.ts` 的 `Stream<RuntimeEvent>` 换成 IPC 桥接的 `PiEvent` 投影。

### D4. pi 事件 → UI 事件投影

V3 用的 RuntimeEvent（`token / thinking / tool_call / tool_result / done / message_stop / error`）保留为 renderer 边界事件类型。投影层在 main 端把 pi 的 `AgentEvent` 转为 `RuntimeEvent`：

```typescript
// src/main/pi-runtime/event-projector.ts
function projectPiEvent(evt: AgentEvent): RuntimeEvent {
  return match(evt)
    .with({ type: "message_update" }, (e) => projectMessageUpdate(e))
    .with({ type: "tool_execution_end" }, (e) => projectToolResult(e))
    .with({ type: "turn_end" }, (e) => projectTurnEnd(e))
    .with({ type: "agent_end" }, () => ({ type: "message_stop" }))
    .otherwise(() => null); // 未知事件不转发
}
```

**这是唯一允许 renderer 与 pi 事件耦合的层**——projection 后的事件类型保持稳定。

### D5. Abort 链路

Cancel 按钮 → `window.codeman.piAbort(conversationId)` IPC → main `AbortController.abort()` → fiber interrupt（pi 的 session-level abort）→ `webContents.send("pi:event", { type: "message_stop" })`。

V3 用了 `Effect.fork` + `AbortController` 的模式，V4 由 pi 的 session 自带 abort 机制。

## Consequences

### Positive

- **pi 全部依赖可在 main 加载**：`cross-spawn` / `undici` / `photon-node` 都是 Node 生态，无打包障碍
- **Session 文件系统持久化**：`SessionManager` 直接读写 JSONL session 文件
- **Renderer 体积减小**：pi-coding-agent 及其依赖不进 renderer bundle（Vite `externalizeDeps`）
- **Renderer 单进程崩溃不丢流**：agent 在 main process 运行，webview 重载不影响 in-flight 流

### Negative

- **IPC 流延迟**：每个 token 事件经一次 `webContents.send`（实测 < 5ms，可接受）
- **事件投影层是新代码**：必须正确处理 pi 的事件类型与 V3 RuntimeEvent 的差异
- **Main process 单点**：agent runtime 在 main process，main crash 会丢失所有 session state（pi SessionManager 持久化可部分恢复）

### Neutral

- **V3 既存 IPC handlers**（settings / webfetch / automations / file-ops 部分）部分保留并桥接到 pi
- **V3 既存 IPC handlers**（file-ops sandbox / run_command / permission / workspaces）删除

## Cross-file impact

| 路径 | 变化 |
|---|---|
| `src/main/index.ts` | 新增 `PiRuntime` 初始化 + IPC handlers 注册 |
| `src/main/pi-runtime/` | **新建**：index.ts / event-bridge.ts / event-projector.ts / session-manager.ts / model-runtime.ts |
| `src/main/ipc.ts` | 删除 file-ops / run-command / permission / workspaces / conversations handlers；新增 pi:* handlers |
| `src/main/features/file-ops/` | **删除**（pi 内置工具接管） |
| `src/main/features/run-command/` | **删除**（pi `createBashTool` 接管，无沙箱无权限） |
| `src/main/features/permission/` | **删除** |
| `src/main/features/workspaces/` | **删除** |
| `src/main/features/conversations/` | **删除**（pi SessionManager 接管） |
| `src/main/features/webfetch/` | 保留，重写为 `defineTool` 自定义工具（详见 ADR 0010） |
| `src/preload/index.ts` | `contextBridge` 暴露 `pi.*` API；删除 conversations / workspaces / permission / run_command 暴露 |
| `src/renderer/src/core/llm/` | **整体删除**（V3 自建运行时底座） |
| `src/renderer/src/features/chat/` | 重写为 IPC 事件订阅视图层；保留 Solid UI 组件 |
| `src/renderer/src/features/settings/` | 改读 `ModelRuntime` IPC 桥接（详见 ADR 0008） |
| `src/renderer/shared/lib/ipc.ts` | 调整：`window.codeman.pi.*` 替代 conversations / workspaces / permission / run_command |
| `src/renderer/shared/lib/runtime-event.ts` | 保留 RuntimeEvent 类型（事件投影的稳定边界） |
| `electron.vite.config.ts` | main bundle target `node22`（V3 是 `node20`，提一阶以满足 pi 的 `≥22.19`） |
| e2e 测试 | Playwright + Electron launcher 不变；mock LLM server 适配 pi 的协议 |

## Reversibility

中等可逆：

- 回滚需：恢复 V3 自建 runtime（`core/llm/`） + 恢复 V3 IPC handlers + 改 `electron.vite.config.ts` 回 `node20`
- 但 pi-coding-agent 已经在 main process 装好，撤回会留下"装好了不用"的包袱

预计回滚耗时：1–2 周（含 e2e 重写）。

## References

- pi-coding-agent SDK：`createAgentSession / SessionManager / ModelRuntime / SettingsManager`
- pi-coding-agent 事件类型：`message_update / tool_execution_start / tool_execution_end / agent_start / agent_end / turn_start / turn_end / compaction_start / compaction_end`
- V3 ADR-0025 D7 IPC 流式先例（参考模式，不追溯引用）