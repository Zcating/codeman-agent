# 0060 — automations LLM listener 迁移到 preload bridge

- **Status**: superseded
- **Date**: 2026-08-09 (superseded 2026-08-11)
- **Superseded by**:  — LLM Proxy Protocol (`codeman-llm://` custom protocol). 适用范围: chat LLM stream 跨进程 seam。 本 ADR 锁定的「automations LLM listener 走 preload bridge」模式**仍然有效**, 仅 chat LLM stream 部分被 supersede。
- **Scope**: `src/preload/index.ts`(+ 2 bridge 方法 + 4 type exports) · `src/renderer/src/shared/apis/invoke.api.ts`(mirror interface) · `src/renderer/src/plugins/automations/lib/main-listener.ts`(重命名为 `automation-llm.ts`,移除 `electron` import) · `src/renderer/src/plugins/automations/lib/automation-llm.test.ts`(测试改 mock `window.codeman`) · `src/renderer/src/__mocks__/ipc-mock.ts`(bridge stub) · `docs/adr/0060-automations-preload-bridge.md`(本文件)
- **Supersedes**: 无(落地 TODO 注释里标注的架构修复工作)
- **Related**:
  -  — Electron 壳(主/preload/main 三进程边界,本 ADR 严格遵循)
  -  — IPC channel 命名(camelCase 严格保持)
  -  — 自动化 plugin 主 ADR(TC 阶段遗留的 renderer-side `ipcRenderer.on` 误用,本 ADR 是其后续修复)
  -  — 同批 16 commits 的 effect-fn 现代化(本 ADR 是其同分支上紧跟的 IPC 架构修复)

## Context

### 用户报告的症状(dev mode 启动 Renderer 后)

```
Uncaught SyntaxError: The requested module
'/@fs/C:/Users/zcati/Documents/project/codeman-agent/node_modules/.pnpm/electron@39.8.10/node_modules/electron/index.js?v=06be1e8f'
does not provide an export named 'ipcRenderer'
(at main-listener.ts:5:10)
```

`/diagnosing-bugs` skill 触发。skill Phase 1-3 调研发现:**之前的 #15 + #16 修复是无效的** ——

| 之前的修复                                                                                                          | 实际效果                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Commit #15 `fix(vite): externalize electron in renderer bundle` (`optimizeDeps.exclude` + `rollupOptions.external`) | production build:electron 不被打进 bundle(✓ 巧合);dev mode:Vite 跳过预打包但仍从 node_modules serve CJS 源码(✗ 不解决问题) |
| Commit #16 `fix(renderer): guard setupAutomationMainListener against missing ipcRenderer`                           | **死代码** —— module 在解析阶段 `import { ipcRenderer } from "electron"` 就抛 SyntaxError,函数体从未执行                   |

**根因**:

| 项                                                                  | 事实                                                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `electron` npm 包 `index.js` 内容                                   | `module.exports = getElectronPath()` —— **只返回 Electron 二进制路径的字符串**,根本不暴露 `ipcRenderer` |
| `ipcRenderer` 实际来源                                              | Electron 运行时(主进程 / preload 进程)注入的全局对象                                                    |
| Renderer 能访问 `ipcRenderer` 的唯一途径                            | 通过 `contextBridge.exposeInMainWorld` 暴露的 preload bridge                                            |
| 当前 `main-listener.ts` 的 `import { ipcRenderer } from "electron"` | **结构上无法工作** —— browser context 无 `ipcRenderer`,且 npm 包本身就没这个 named export               |

### 调研事实修正(防未来重复犯错)

| 评审中假设                                                                | 调研后事实                                                                                                                                                                | 证据                                                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `import { ipcRenderer } from "electron"` 在 renderer 报错只是构建配置问题 | **错**。报错根因是**架构错误**:renderer 本来就不应该直接 import electron 包                                                                                               | `node_modules/electron/index.js:21` `module.exports = getElectronPath()`        |
| 给 module 加 `typeof ipcRenderer === "undefined"` guard 能修复            | **错**。guard 是运行时防御,但 SyntaxError 发生在模块**解析阶段**(更早),guard 永远没机会执行                                                                               | `main-listener.ts:5` 是 top-level import,Vite/浏览器解析时立即报错              |
| Production build 没报错,所以问题不大                                      | **误导**。production bundle 里 `main-listener` **完全消失** —— runtime guard 让整个 module 成死代码,被 tree-shake 整个删掉。dev mode 暴露问题是因为 Vite serve 真实源文件 | `dist/assets/index-*.js` 无 `electron`/`ipcRenderer`/`main-listener` 任何字符串 |
| 修复需要拆 preload 桥 + renderer 订阅 + 测试改写                          | **对**。这是结构性重构,需要 4 个原子 commit                                                                                                                               | preload 已有 `onStreamChunk` 模板可模仿                                         |

### 修复前的数据流(坏的)

```text
[main] executor.ts:102 window.webContents.send("automations:execute-llm", { executionId, action })
   ↓
[preload] (无 — 没有这条 channel 的 listener)
   ↓
[renderer] main-listener.ts:5 import { ipcRenderer } from "electron" ← SyntaxError
```

### 修复后的数据流(好的)

```text
[main] executor.ts:102 window.webContents.send("automations:execute-llm", { executionId, action })
   ↓
[preload] index.ts automationsExecuteLlm(handler) 注册 ipcRenderer.on("automations:execute-llm", listener)
   ↓ contextBridge.exposeInMainWorld("codeman", { automationsExecuteLlm, automationsSendLlmResult })
[renderer] automation-llm.ts setupAutomationMainListener() 订阅 bridge + 调用 handler
   ↓
[renderer] handleAutomationLlm → executeLlmInRenderer (纯逻辑) → window.codeman.automationsSendLlmResult
   ↓ contextBridge
[preload] index.ts automationsSendLlmResult → ipcRenderer.send("automations:execute-llm-result")
   ↓
[main] executor.ts:40 ipcMain.on("automations:execute-llm-result", ...)
```

## Decision

### D1 — preload 拥有 IPC 订阅,renderer 通过 `window.codeman` 调用

- **不再允许 renderer 直接 `import "electron"`**
- preload 在 `CodemanApi` 上加两个方法:
  - `automationsExecuteLlm(handler) → unsubscribe` (订阅 main → renderer 的 LLM 执行请求)
  - `automationsSendLlmResult(payload) → void` (fire-and-forget 发送 renderer → main 的结果)
- mirror 到 renderer 端 `invoke.api.ts` 的 `CodemanApi` interface,保持 `window.codeman` 类型完整

### D2 — bridge 形态镜像现有 `onStreamChunk` 模板

`preload/index.ts:220-226` 已有的 pattern:

```ts
onStreamChunk: (handler) => {
  const listener = (_e: unknown, evt: unknown) => handler(evt);
  ipcRenderer.on("stream-chunk", listener);
  return () => { ipcRenderer.off("stream-chunk", listener); };
},
```

新方法完全平行(handler 包装 + 返回 cleanup),保证整个 preload surface 的一致性。

### D3 — renderer 端纯逻辑与 IPC 订阅分离

`automation-llm.ts` 内部职责划分:

| 导出                              | 职责                                       | 测试方式                                    |
| --------------------------------- | ------------------------------------------ | ------------------------------------------- |
| `executeLlmInRenderer(action)`    | 纯函数,跑 LLM,无 IPC                       | mock `createSubAgent` + `window.__appStore` |
| `getProviderConfig(providerId)`   | 纯函数,从 `window.__appStore` 取 provider  | 同上                                        |
| `handleAutomationLlm(request)`    | orchestrate:调 execute + bridge.sendResult | mock bridge + createSubAgent                |
| `setupAutomationMainListener()`   | idempotent 注册 bridge 订阅                | mock bridge                                 |
| `cleanupAutomationMainListener()` | 取消订阅,清状态                            | 同上                                        |

`initializeAutomations`(在 `automations/index.ts`)只做 `Effect.sync(() => setupAutomationMainListener())`,无业务逻辑。

### D4 — 测试改 mock `window.codeman`,不 mock `electron`

之前的 `main-listener.test.ts` 用 `vi.mock("electron", ...)` —— 这恰恰**掩盖了 dev-mode SyntaxError**(因为 vitest 在 jsdom 下用 mock 替换,看不到 Vite serve 真实 CJS 源码的失败)。

新 `automation-llm.test.ts`:

- `Object.defineProperty(window, "codeman", { value: { automationsExecuteLlm, automationsSendLlmResult }, ... })`
- handler 捕获 + 结果断言
- 11/11 测试通过(806ms)

`src/renderer/src/__mocks__/ipc-mock.ts` 同步加 no-op stub(`automationsExecuteLlm = () => () => {}`,`automationsSendLlmResult = () => {}`),防止其他测试在找不到这俩方法时崩。

### D5 — 反 anti-pattern:不动 `automationsRunMissed` 等 invoke handlers

preload `CodemanApi` 上已有的 `automationsList/Create/Update/Delete/Toggle/RunNow/ListExecutions/GetExecution/RunMissed` 都是 **invoke 调用**(renderer → main 单次往返),跟 IPC 订阅无关,不在本次修复范围。`__mocks__/ipc-mock.ts` 缺这些 mock 是历史遗留(单独清理任务),不在本 ADR scope。

## Implementation

### 5 个原子 commit(本分支 HEAD `131d689` 之后)

| #   | Hash      | 改动                                                                                  |
| --- | --------- | ------------------------------------------------------------------------------------- |
| #17 | `f9db246` | `feat(preload): add automationsExecuteLlm + automationsSendLlmResult bridge`          |
| #18 | `ebbfb38` | `refactor(automations): migrate main-listener from electron import to preload bridge` |
| #19 | `131d689` | `test(automations): rewrite listener tests against preload bridge mock`               |
| #20 | `058a5da` | `chore(mocks): add automations bridge stubs to ipc-mock`                              |
| #21 | (本 ADR)  | `docs(adr-0060): record preload bridge migration`                                     |

### 关键代码模式

preload 端(`src/preload/index.ts`):

```ts
// D2 — bridge subscription, mirrors onStreamChunk
automationsExecuteLlm: (handler) => {
  const listener = (_e: unknown, request: LlmExecuteRequest) => {
    // Swallow handler rejections — main has its own timeout + pending map,
    // renderer errors are best-effort reported via sendLlmResult.
    void Promise.resolve(handler(request)).catch(() => {});
  };
  ipcRenderer.on("automations:execute-llm", listener);
  return () => { ipcRenderer.off("automations:execute-llm", listener); };
},

automationsSendLlmResult: (payload) => {
  ipcRenderer.send("automations:execute-llm-result", payload);
},
```

renderer 端(`src/renderer/src/plugins/automations/lib/automation-llm.ts`):

```ts
export async function handleAutomationLlm(request: LlmExecuteRequest): Promise<void> {
  const { executionId, action } = request;
  let payload: LlmResultPayload;
  try {
    const result = await executeLlmInRenderer(action);
    payload = {
      executionId,
      status: result.status,
      finalText: result.finalText,
      error: result.error,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    payload = { executionId, status: 'error', error: errorMessage };
  }
  if (!window.codeman) return; // bridge unavailable (test safety)
  window.codeman.automationsSendLlmResult(payload);
}
```

## Verification

### 自动化验证

| 检查                           | 命令                                                                                     | 结果                     |
| ------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------ |
| Renderer 无 electron import    | `grep "from .electron." src/renderer/src/**/*.ts`                                        | **0 处**(✓ 满足 D1)      |
| Typecheck (web)                | `vp run typecheck:web`                                                                   | 0 errors                 |
| Typecheck (node)               | `vp run typecheck:node`                                                                  | 0 errors                 |
| 新测试通过                     | `vp run test src/renderer/src/plugins/automations/lib/automation-llm.test.ts -- --run`   | **11/11 passed** (806ms) |
| Production build 不含 electron | `vp run build` + `Select-String dist/assets/index-*.js -Pattern 'electron\|ipcRenderer'` | **0 matches**            |

### 手动验证(dev mode)

| 步骤                                          | 期望                                                                             | 状态       |
| --------------------------------------------- | -------------------------------------------------------------------------------- | ---------- |
| `vp run dev` 启动 Electron                    | Renderer 加载 index.html,无 SyntaxError                                          | 待用户验证 |
| DevTools console                              | 无 `does not provide an export named 'ipcRenderer'`                              | 待用户验证 |
| 创建一条 LLM action 的 automation rule + 触发 | Renderer 端 console 不抛错;main 端 `pendingLlmExecutions` Map 在 5min 内 resolve | 待用户验证 |

> **注**:本 ADR 由 AI 编排自动完成,无法 headless 启动 Electron 验证 dev mode console(需要 GUI 交互)。用户本地 `vp run dev` 跑一次即可。

### Phase 1 反馈环说明(对 skill `/diagnosing-bugs`)

本次修复**未能用 tight red-capable loop 复现**:dev mode 错误只在真实 Electron renderer 中出现,vitest jsdom + `vi.mock("electron", ...)` 反而掩盖了它(skill Phase 5 警示:"no correct seam" 案例)。Phase 1 退化为:1) grep 全文确认 root cause(electron/index.js CJS);2) typecheck + build + 测试 + grep 联合确认修复覆盖。dev mode 真实复现只能由用户在本地完成。

## Consequences

### 收益

- **dev mode 启动不再白屏** —— Renderer 能正常加载,不再因 `main-listener.ts:5` 抛 SyntaxError 而整个 module 不可用
- **架构正确性** —— preload 是唯一拥有 `ipcRenderer` 的进程,renderer 通过 bridge 与之对话(对齐 三进程边界)
- **测试可观测性** —— 新 mock 模式在 vitest 下也能反映 dev mode 失败(如果未来再有人写 `import { ipcRenderer } from "electron"`,测试会因找不到全局而失败)
- **代码净减** —— `automation-llm.ts` 比原 `main-listener.ts` 净 -303 行(test 文件重写 + source 重命名 + 死代码清理)

### 代价

- **`__mocks__/ipc-mock.ts` 缺失其他 automations invoke mock** —— `automationsList/Create/Update/...` 仍未在 `buildCodemanMock()` 注册。已知问题,不在本 ADR scope(单独清理任务)
- **本地 dev 验证待用户** —— AI 无法 headless 验证 renderer console,需要用户本地跑 `vp run dev` 确认
- **历史 commit #15 + #16 需不需要回滚** —— 决策:**不回滚**。`optimizeDeps.exclude: ["electron"]` + `rollupOptions.external: ["electron"]` 在 production build 仍然有用(防止 electron 被意外打进 bundle);runtime guard 已被新代码替代但不影响功能

### 遗留 TODO

- [ ] 文档里 `main-listener.ts` 的 TODO 注释已被本 ADR 落地,可以删除
- [ ] `__mocks__/ipc-mock.ts` 补齐 `automationsList/Create/Update/...` invoke mock(独立 PR)
- [ ] e2e:补一条 Playwright spec 验证 Renderer 加载时无 console error,并触发一次 LLM automation 端到端跑通

## Alternatives Considered

### A. 只删 `main-listener.ts:5` 的 import,保留空 listener 函数

- **优点**:diff 最小,1 commit
- **缺点**:LLM execution 监听功能彻底失效(原代码路径在 renderer 里就跑不通),违反 AGENTS.md "简单优先,但要解决问题" 原则
- **拒绝**

### B. 把 `ipcRenderer.on` 调用套 `try/catch`

- **不适用**:`import` 失败不在 try/catch 管辖范围。SyntaxError 在模块解析阶段抛
- **拒绝**

### C. 保留 `main-listener.ts`,把 `ipcRenderer.on` 改成通过 `globalThis.__electron` 注入

- **优点**:diff 极小
- **缺点**:需要 preload 显式注入到 renderer 全局,绕过 `contextBridge`(违反 Electron 安全最佳实践)
- **拒绝**

### D. 完整 bridge 迁移(选中)

- **优点**:架构正确,代码净减,测试更真实
- **缺点**:5 个原子 commit,稍大
- **接受**

---

## 总结

本 ADR 落地了 早就标注的架构修复 TODO,把错误的 renderer-side `ipcRenderer.on` 迁移到正确的 preload bridge 模式。dev mode SyntaxError 根因是 `electron/index.js` 只返回二进制路径字符串(根本不暴露 `ipcRenderer`),不是构建配置问题;之前的 commit #15 + #16 修复在 production build 偶然工作(runtime guard 导致 tree-shake),dev mode 仍然崩溃。新设计镜像 `onStreamChunk` 模板,preload 独占 `ipcRenderer`,renderer 通过 `window.codeman.automationsExecuteLlm` / `automationsSendLlmResult` 与之对话。
