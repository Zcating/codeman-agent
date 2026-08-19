# 0016 — appStore.refreshProviderModels + service-only-in-store + runPromiseExit 标准化

**Status**: accepted (V1.8+, 2026-06-21)
**Supersedes**: 无 (与 平行扩展)
**Related**: (Effect-TS 逻辑层), (5+1 白名单), (Unified Provider schema), (Per-Conversation Agent), (appStore), CONTEXT.md Provider.llm / Provider.billing / ModelMeta / ProviderService / App Store

## Context

ADR-0015 把 Settings 写入收敛到 `appStore.set(patch)` + `settingsSaver.scheduleSave()` 单一通道,但 `ProviderCard.handleRefreshModels` (`src/features/settings/components/provider-card.tsx`) 仍是 4 步直接串 (`fetchModels` + 构造 `updated` Provider + `appStore.set` + `settingsSaver.scheduleSave`),组件 30+ 行,业务逻辑和 UI 反馈混在一起。grill-with-docs session (2026-06-21) 触到 4 个相关问题:

### 触发 1: fetchModels 业务逻辑散在组件里

`ProviderCard.handleRefreshModels` 把"拉取 + 写 state + 调度持久化"塞进 component,违背 的"UI → Effect → store"分层。同样的反模式在 `workspace-card.tsx:54-69` (`handleBrowse`)、`settings.tsx:72-79` (`clearHistory`)、`chat-view.tsx:85-93` (cancel) + `121-195` (startRun) 也存在。

### 触发 2: 边界场景下 store 进入"select 显示 X, default_model 是 Y"的不一致态

用户配 `default_model: "old-model"`,点 Refresh 后远端返回新 models 列表里不含 "old-model" (模型下架了)。当前代码把 `models` 数组**整个替换**,`default_model` 字段**不动**:

- `<select>` 下拉里看不到 "old-model" (浏览器 fallback 到第一项或空)
- store 里 `default_model` = "old-model" (无效值)
- 下次发 LLM 消息时传一个不存在的 model 给上游 → 错误

pre-existing bug,这次搬逻辑正好触到 `llm: { ...llm, models }` 这一行,顺手修。

### 触发 3: 组件层 `try { await Effect.runPromise(...) } catch (e) { String(e) }` 反模式

4 处组件 handler + 1 处启动 + 1 处 debounce flush 全部用 `Promise.catch` 或 `try { } catch (e) { ... String(e) ... }` 接 Effect 错误。`AppError` 是判别联合 (`{ kind: "IPC", message: string }` 等),`String(AppError)` 打成 `"[object Object]"` — 类型信息全丢,UI 上看到 "Refresh failed: [object Object]"。

桥接层 (`src/features/chat/stores/*.ts`, `src/features/billing/lib/billing.ts`, `src/features/file-tools/lib/file-tools.ts`) 已经统一用 `Effect.runPromiseExit` + `Exit.match`,组件层落后。

### 触发 4: service 操作散在组件层,违反 / 分层

ADR-0003: "UI 组件 `import { Effect, ... }` — 只能在 `store/` / `runtime.ts` / `subsystems/`"。ADR-0015: "所有对 Settings 的读写都走 app-store,禁止组件直接 `invoke("update_settings")` 或 `invoke("get_settings")`"。

组件层当前有 7 处 service 知识:

- `provider-card.tsx`: `ProviderService.fetchModels` (Effect.gen) + `delete_provider` IPC (V0 leftover,Rust 端无此命令)
- `workspace-card.tsx`: `pick_workspace_path` IPC (裸 invoke)
- `settings.tsx`: `clear_all_history` IPC (裸 invoke)
- `chat-view.tsx`: `AgentRuntime.cancel` + `AgentRuntime.run` (Effect.gen,各一处)
- `theme.ts`: `getSettingsBridge()` Promise 桥接函数 (ADR-0015 已标注弃用)
- `settings-saver.ts`: `appStore.forceFlush()` (合规,store 调)
- `index.tsx`: `appStore.refresh()` (合规,store 调)

## Decision

### D1. `appStore.refreshProviderModels(id): Effect<ModelMeta[], AppError>`

在 `src/shared/stores/app.store.ts` 加第 5 个公开方法:

```ts
refreshProviderModels(id: string): Effect.Effect<ModelMeta[], AppError> {
  return Effect.gen(function* () {
    const svc = yield* ProviderService;
    const models = yield* svc.fetchModels(id);
    // 写 state (functional updater) + auto-fallback default_model (D2)
    setSettings("value", (prev) => {
      const providers = (prev.providers ?? []).map((p) => {
        if (p.id !== id) return p;
        const newLlm = { ...p.llm, models };
        if (models.length > 0 && !models.some((m) => m.id === p.llm.default_model)) {
          newLlm.default_model = models[0].id;
        } else if (models.length === 0) {
          newLlm.default_model = "";
        }
        return { ...p, llm: newLlm };
      });
      return { ...prev, providers };
    });
    return models;
  })
    .pipe(Effect.provide(ProviderServiceLive))
    .pipe(Effect.mapError((e: TauriError) => ({ kind: "IPC" as const, message: e.message })));
}
```

`R = never`,layer 烤进去;`TauriError → AppError` 映射保持 appStore 公开 API 错误类型一致。返回 `ModelMeta[]` (不是 `Provider`) — 组件用 `models.length` 做成功提示文案。

**`settingsSaver.scheduleSave()` 仍由组件调**(保持 的 "shared → feature 单向依赖" 硬约束 — store 不引 `features/settings/lib/settings-saver`)。

**`props.onUpdate(updated)` 在新 handler 中不调** — 父组件 `onProviderChange` 是 idempotent re-sync,新设计下已是 no-op。

组件 handler 简化:

```ts
const handleRefreshModels = async () => {
  setIsRefreshing(true);
  setRefreshMsg(null);
  const exit = await Effect.runPromiseExit(appStore.refreshProviderModels(props.provider.id));
  if (Exit.isSuccess(exit)) {
    settingsSaver.scheduleSave();
    setRefreshMsg(`Loaded ${exit.value.length} model(s)`);
  } else {
    setRefreshMsg(`Refresh failed: ${formatAppError(exit.cause)}`);
  }
  setIsRefreshing(false);
};
```

### D2. Default Model Invariant

**不变量**: `Provider.llm.default_model` 始终是 `Provider.llm.models` 数组中某个元素的 `id`,或 `""` (空 models 时)。

`refreshProviderModels` 写 state 时强制执行:

- 若 `models.length > 0` 且 `default_model` 不在新数组中 → 改成 `models[0].id`
- 若 `models.length === 0` → 改成 `""`
- 已经在数组里 → 不动

不变量纳入 CONTEXT.md 词汇表(`Provider.llm` 段落 + 新增 "Default Model Invariant" 词条)。

### D3. 组件层 `runPromiseExit` 标准化,范围 = ① try-catch + ② .catch

| #   | 位置                                             | 改前                                                                                                                                                                                    | 改后                                                                                                                                         |
| --- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `provider-card.tsx:90-119` (handleRefreshModels) | `try { await Effect.runPromise(Effect.gen(...ProviderService...)) } catch (e) { setRefreshMsg(\`failed: ${e}\`) } finally { setIsRefreshing(false) }`                                   | `await Effect.runPromiseExit(appStore.refreshProviderModels(...))` + `Exit.match` + 错误用 `formatAppError(cause)` 输出                      |
| 2   | `provider-card.tsx:128-139` (handleDelete)       | `try { ... } finally { setIsDeleting(false) }` (无 catch)                                                                                                                               | `await Effect.runPromiseExit(appStore.deleteProvider(id))` + 成功/失败各自 `setIsDeleting(false)`                                            |
| 3   | `workspace-card.tsx:54-69` (handleBrowse)        | `try { ... } finally { setIsPicking(false) }` (无 catch,IPC 错误未处理)                                                                                                                 | `await Effect.runPromiseExit(appStore.pickWorkspacePath())` + 成功 setPathInput,失败 log + 同样 setIsPicking(false)                          |
| 4   | `settings.tsx:72-79` (clearHistory)              | `try { ... } catch (e) { console.error(...) }`                                                                                                                                          | `await Effect.runPromiseExit(appStore.clearAllHistory())` + `Exit.isSuccess` 检查 + 错误 log                                                 |
| 5   | `chat-view.tsx:121-195` (startRun)               | redundant `try { await Effect.runPromiseExit(... Exit.isSuccess ...) } catch (e) { console.error(...) } finally { ... }` — `runPromiseExit` 已经返回 `Exit`,外层 try-catch 是 dead code | 删外层 try-catch-finally,只保留 `Stream.runForEach(chatAgentStore.startRun(...), handler)` + `Effect.runPromiseExit` + `Exit.isSuccess` 检查 |
| 6   | `settings-saver.ts:23-30` (debounce flush)       | `Effect.runPromise(appStore.forceFlush()).catch(e => console.error(...))`                                                                                                               | `Effect.runPromiseExit(appStore.forceFlush())` + 失败时 log cause                                                                            |
| 7   | `index.tsx:38-42` (启动 refresh)                 | `Effect.runPromise(appStore.refresh()).catch(e => console.warn(...))`                                                                                                                   | `Effect.runPromiseExit(appStore.refresh())` + 失败时 log warn,保持"启动用默认"语义                                                           |

**新 helper** `src/shared/lib/format-app-error.ts`:

```ts
import { Cause } from "effect";
import type { AppError } from "./types";

/** 把 Effect Cause 拍平成人类可读字符串,保留 AppError.kind 信息。 */
export function formatAppError(cause: Cause.Cause<AppError>): string {
  return Cause.match(cause, {
    onEmpty: () => "Unknown error",
    onFail: (e) => formatOne(e),
    onDie: (defect) => String(defect),
    onInterrupt: () => "Interrupted",
    onSequential: (l, r) => `${formatAppError(l)}; ${formatAppError(r)}`,
    onParallel: (l, r) => `${formatAppError(l)}; ${formatAppError(r)}`,
  });
}

function formatOne(e: AppError): string {
  if (e && typeof e === "object" && "kind" in e && typeof e.kind === "string") {
    return `${e.kind}: ${e.message}`;
  }
  return String(e);
}
```

**范围排除**:

- `src/shared/lib/tauri.ts` 7 个 bridge 函数 (`getSettingsBridge` 等) — 已弃用,留作单独清理
- 测试里的 `await Effect.runPromise(...)` — 测试自己的 try/catch 断言不同,不动
- 裸 `Effect.runPromise(program)` 在 `chat-view.tsx:85` 之类 cancel 调用 — cancel 是不透明副作用,套 Exit 没价值
- `theme.ts` 的 `getSettingsBridge()` 不算反模式(它本身就在 `shared/stores/`),但被 D4 规则涵盖(D4 第 6 条)

### D4. service 操作只在 Store 出现 (硬规则)

**硬约束**: 组件层 (`.tsx` 文件,除 `shared/stores/*` 和 `features/*/stores/*` 外) **禁止**以下 3 种形态:

1. `Effect.gen(...yield* SomeService.method()...)` — service 直接调用
2. `await Effect.runPromise(invoke<...>("some_ipc"))` 或 `await Effect.runPromise(someService.method())` — IPC/Service 直调
3. 裸 `fetch(...)` / `window.fetch(...)` — HTTP 直调

**所有 service 调用必须包成 store method**,签名 `Effect<A, E, R=never>`,组件只调 `Effect.runPromiseExit(store.method(...))` + `Exit.match` 处理。

**测试豁免**: 测试代码 (`*.test.ts*`) 不受 D4 约束 — `it.effect(...)` + `Effect.gen(...yield* Service...)` 是 `@effect/vitest` 标准 pattern,不为测而测。

7 处违反 → 7 处 store 化:

| #   | 组件                                      | 旧形态                                                                            | 新 store method                                                                                               |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | `provider-card.tsx` (handleRefreshModels) | `Effect.gen(...yield* ProviderService.fetchModels...)`                            | `appStore.refreshProviderModels(id)` (D1)                                                                     |
| 2   | `provider-card.tsx` (handleDelete)        | `await Effect.runPromise(invoke("delete_provider"))` (V0 leftover, Rust 无此命令) | `appStore.deleteProvider(id)` — 纯 state mutation,不调 IPC (实际删除走 `appStore.set({providers: filtered})`) |
| 3   | `workspace-card.tsx` (handleBrowse)       | `await Effect.runPromise(invoke("pick_workspace_path"))`                          | `appStore.pickWorkspacePath()` — 内部 `WorkspaceService.pickPath()` (新增)                                    |
| 4   | `settings.tsx` (clearHistory)             | `await Effect.runPromise(invoke("clear_all_history"))`                            | `appStore.clearAllHistory()` — 内部 `SettingsService.clearAllHistory()`                                       |
| 5   | `chat-view.tsx` (cancel)                  | `Effect.gen(...yield* AgentRuntime.cancel...)`                                    | `chatAgentStore.cancel(convId)` (D5)                                                                          |
| 6   | `chat-view.tsx` (startRun)                | `Effect.gen(...yield* AgentRuntime.run...)` + 70 行事件处理                       | `chatAgentStore.startRun(conv, msg)` 返回 `Stream<RuntimeEvent, AppError>`,组件用 `Stream.runForEach` 接 (D6) |
| 7   | `theme.ts`                                | `await getSettingsBridge()` (Promise 桥接,ADR-0015 弃用)                          | `await Effect.runPromiseExit(appStore.refresh())` 一次性,5s 轮询也用                                          |

### D5. 新 store 落位 + clearAllHistory 归属

- `src/features/chat/stores/agent.ts` (新文件) — `chatAgentStore` 装 `startRun` (D6) + `cancel` + `destroy`。`AgentRuntime.run` 内部已返回 `Stream<RuntimeEvent, AppError | RuntimeError, SettingsService | MessageService>`,store 只是 wrap + bake `RuntimeLayer` 提供。
- `appStore.clearAllHistory()` — `clearAllHistory` 严格说不是 chat operation(清 SQLite `conversations` 表),但调用方在 settings 路由 advanced tab,且操作上跟"清 settings"概念同源(都是维护操作),留在 `appStore` 合理(共享 lib 域)。

### D6. streaming API 形状:沿用现有 Stream,只 wrap

`AgentRuntime.run` (在 `runtime.ts`) 当前已返回 `Stream<RuntimeEvent, AppError | RuntimeError, SettingsService | MessageService>`。`chatAgentStore.startRun` 只是 wrap 一次 + bake `RuntimeLayer` 提供:

```ts
import { AgentRuntime, RuntimeLayer, type RuntimeEvent } from "../lib/runtime";

startRun(
  conversation: Conversation,
  userMessage: Message,
): Stream.Stream<RuntimeEvent, AppError> {
  return Stream.unwrap(
    Effect.gen(function* () {
      const runtime = yield* AgentRuntime;
      return runtime.run(conversation, userMessage);
    }).pipe(Effect.provide(RuntimeLayer)),
  );
}
```

`Stream.unwrap` 接收 `Effect<Stream<A, E, R>, E2, R2>`,返回 `Stream<A, E | E2, R | R2>`。Layer 提供后 R=never。

**不**改 `runtime.ts` 本身 — 它已是 Stream 形态,D6 只需在 store 层 wrap。

组件用 `Stream.runForEach` 接 event,event handler 内 `Effect.gen + yield* Effect.sleep(Duration.zero)` 实现打字机式增量渲染(原 chat-view.tsx 已有此 pattern,只是移到 store 外的 handler 里):

```ts
// chat-view.tsx (new)
const effect = Stream.runForEach(
  chatAgentStore.startRun(conversation, userMsg),
  (event) =>
    Effect.gen(function* () {
      switch (event.type) {
        case "token": { ... break; }
        case "tool_call": { ... break; }
        case "tool_result": { ... break; }
        case "done": { ... break; }
        case "error": console.error(...); break;
      }
      yield* Effect.sleep(Duration.zero);
    }),
);
const exit = await Effect.runPromiseExit(effect);
```

`cancel` 同样 wrap:

```ts
cancel(convId: string): Effect.Effect<void, never, never> {
  return Effect.gen(function* () {
    const runtime = yield* AgentRuntime;
    yield* runtime.cancel(convId);
  }).pipe(Effect.provide(RuntimeLayer));
}
```

`destroy` 同样 wrap (用于 archive/delete conversation):

```ts
destroy(convId: string): Effect.Effect<void, never, never> {
  return Effect.gen(function* () {
    const runtime = yield* AgentRuntime;
    yield* runtime.destroy(convId);
  }).pipe(Effect.provide(RuntimeLayer));
}
```

## Considered Options

### D1 (新方法放哪) 3 选

| 选  | 描述                                                                                             | 选 / 不选                                                                             |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| A   | `appStore.refreshProviderModels(id)` (本次)                                                      | 选 — 单一聚合点,组件只关心 Effect + 反馈                                              |
| B   | 走 `features/settings/lib/provider-models.ts` 新 helper                                          | 不选 — `settingsSaver` 已经是 lib helper,再加一个会让 lib 域膨胀;store 是更聚合的归宿 |
| C   | 直接 `Effect.runPromiseExit(Effect.gen(...).pipe(Effect.provide(ProviderServiceLive)))` 留在组件 | 不选 — 搬动的目的就是消除这种"业务逻辑在组件里"的形态                                 |

### D2 (default_model fallback) 3 选

| 选  | 描述                                                                                             | 选 / 不选                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| A   | 搬逻辑时保持现状 (default_model 不动)                                                            | 不选 — 维持 pre-existing bug,改天还得回头修                                                                                   |
| B   | 自动 fallback 到 `models[0]?.id` (本次)                                                          | 选 — 重构触到这一行,顺手修 4 行,store 永远一致                                                                                |
| C   | Effect 返回 `{ models, warning: "default_model no longer available" }`,UI 在 `refreshMsg` 里展示 | 不选 — 走 warning 通道让 API surface 复杂化,与 D1 的 `Effect<ModelMeta[]>` 冲突;用户其实只看到 dropdown 自动跳,不需要文字警告 |

### D3 (runPromiseExit 范围) 3 选

| 选  | 描述                                                                  | 选 / 不选                                                                                              |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A   | 只动有 try-catch 的 4 处 (provider-card x2, workspace-card, settings) | 不选 — `chat-view.tsx` 的 redundant try-catch 看起来无害但确实是 dead code,留着给将来挖坑              |
| B   | ① + ② (本次)                                                          | 选 — 命中"接 Effect 错误然后 `String(e)` 丢类型"的所有反模式                                           |
| C   | B + bridge 函数也改                                                   | 不选 — 7 个 bridge 函数 6 个已弃用,改它们没 UX 价值;剩 1 个 `getSettingsBridge` 单独看(D4 第 7 条覆盖) |

### D4 (service-in-store 范围) 3 选

| 选  | 描述                                           | 选 / 不选                                           |
| --- | ---------------------------------------------- | --------------------------------------------------- |
| A   | 全部 7 处一起做 (本 PR)                        | 选 — 一次性达到"组件零 service 知识"                |
| B   | 只做 settings 域 (4 处) + provider-card (2 处) | 不选 — chat-view 留坑,新规则不完整                  |
| C   | 只做 provider-card (2 处) + ADR 落规则         | 不选 — 留 70 行 `Effect.gen` 违反新规则,读 ADR 困惑 |

### D5 (chat store 落位) 3 选

| 选  | 描述                                                                                                | 选 / 不选                                                 |
| --- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| i   | `src/features/chat/stores/agent.ts` 装 `cancel` + `startRun`,`clearAllHistory` 留 `appStore` (本次) | 选 — 跟 chat 域 `conversations.ts` / `messages.ts` 同模式 |
| ii  | 拆 3 个 store                                                                                       | 不选 — 过度拆分                                           |
| iii | 全部塞 appStore                                                                                     | 不选 — 违反"feature 自治"                                 |

### D6 (streaming API 形状) 3 选

| 选  | 描述                                              | 选 / 不选                                   |
| --- | ------------------------------------------------- | ------------------------------------------- |
| i   | 回调参数 (store 接受 `onEvent` 转手)              | 不选 — runtime 层已是 Stream,改造反而是逆向 |
| ii  | 沿用现有 Stream,store 只 wrap + bake layer (本次) | 选 — 不改 runtime.ts,store 是薄 wrapper     |
| iii | 拆 2 步 start + subscribe                         | 不选 — 复杂化,本 PR 不必                    |

## Consequences

### 正面

- `appStore` 公开 API 从 4 个扩到 5 个 + 新 `chatAgentStore` 3 个方法,全部签名遵循 `void | Effect<A, E, R=never>`
- 组件 handler 简化: `provider-card` `handleRefreshModels` 从 30 行 → 8 行;`chat-view` `send` 从 70 行 → 30 行 (事件处理外置)
- `default_model` 不变量在 store 层强制执行,UI 永远不会显示"select 跳到默认第一项,store 里 default_model 是无效值"的不一致
- `AppError` 类型信息 (`.kind` / `.message`) 经 `formatAppError` 落到 UI 文案,不再出现 "[object Object]"
- 7 处组件层 handler 统一到 `Exit` 模式,桥接层 (chat / billing / file-tools) 和组件层的代码风格统一
- D4 硬规则落地:组件层 0 个 service 知识,导入图清晰 (`component → store → service` 单向)
- 测试更细分: end-to-end happy path 1 个 (`settings.integration.test.tsx:211`),`refreshProviderModels` 单测 4 个在 `app.store.test.ts` 覆盖正常 / fallback / 错误 / 找不到 provider,`chatAgentStore` 单测 3 个在 `agent.test.ts` 覆盖 happy path / cancel / 错误

### 负面

- `appStore` 内部现在有 HTTP 副作用 (`ProviderService.fetchModels` 调 `window.fetch`),从"Settings 状态容器"轻度滑向"Settings 命令聚合器"。未来若再有"从网络拉数据并写 state"的需求 (`refreshBilling` / `refreshAllProviderModels`),需要明确边界:**HTTP 副作用必须经 `shared/lib/tauri.ts` 的 Service**,store 只做"调 service + 写 state"两步 (本次即如此)
- `chat-view.tsx:121-195` 删除 try-catch 后,`setRunning(false)` 仍在 `runPromiseExit` 之后无条件执行 — 与 try-finally 行为等价,但可读性依赖读者了解 `Effect.runPromiseExit` 不抛
- `formatAppError` 是新 helper,自带的依赖是 `Cause` from "effect"
- 测试 mock surface 变大。`provider-card.test.tsx` 之前只 mock `appStore`,现在要 mock `appStore.refreshProviderModels` 返回 Exit;`settings.integration.test.tsx` 之前 mock `globalThis.fetch`,现在 mock `appStore.refreshProviderModels`
- D4 硬规则下,theme.ts (`shared/stores/`) 用 `getSettingsBridge` 的部分需要改成 `Effect.runPromiseExit(appStore.refresh())`,但 theme.ts 本身是 store 文件所以仍合规;只是依赖 `appStore` 而非 `getSettingsBridge`
- `chatAgentStore.startRun` 内部 `Stream.unwrap` + `Effect.provide(RuntimeLayer)` 有 ~5 行开销,但每次调用都 bake 没问题(layer 引用是静态的)

### 不变

- 的"shared → feature 单向依赖"硬约束 — `settingsSaver.scheduleSave()` 仍由组件调,store 不引 feature lib
- 5+1 白名单 — `appStore` 仍在 `src/shared/stores/`,`chatAgentStore` 在 `src/features/chat/stores/`,新 helper `formatAppError` 在 `src/shared/lib/`
- pi-mono agent runtime, anthropic-messages-only 协议, SQLite FTS5, Tauri 单 webview — 全部不变
- `runtime.ts` 不改 — 它已是 Stream 形态,D6 只需 wrap
- 单 provider 单账号 / 无自动更新 / 无跨 session 记忆等 non-goals — 不变

## Timing

- **V1.8+ sprint**: 起 feature branch,落本 ADR
- 顺序: ADR + CONTEXT.md 词汇表 → 改 tauri.ts 加 `ProviderService.delete` + `WorkspaceService.pickPath` → 改 appStore + 加 4 个新方法 + 单测 → 创建 chatAgentStore + 单测 → 改 7 处组件 → 改 3 处测试 → vp run test + vp run typecheck → commit
- 不进 E2E spec (refresh models 的 end-to-end 已被 `settings.integration.test.tsx:211` 覆盖;E2E 跑真 Tauri + 真 fetch 慢且脆)

## References

- (Effect-TS 逻辑层) — D4 强化其"UI 不直接接 Effect 错误"约束
- (5+1 白名单) — store 位置约束
- (Unified Provider schema) — `Provider.llm` / `Provider.billing` shape
- (Per-Conversation Agent) — D6 沿用其 `AgentRuntime.run` Stream API
- (Settings 全局 app-store) — 本 ADR 是其 API 扩 + 加 D4 硬规则
- CONTEXT.md 词汇表 — 加 "Default Model Invariant" 段落;加 `appStore.refreshProviderModels` + `appStore.pickWorkspacePath` + `appStore.deleteProvider` + `appStore.clearAllHistory` 描述;加 `chatAgentStore` 简介
- grill-with-docs session 2026-06-21 — 决议依据
