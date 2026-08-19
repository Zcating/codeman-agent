# — Provider lookup seam via existing ProviderApi & escape hatch removal

**Status**: proposed · 2026-08-12

## Context

### 1. automation-llm seam leak

`src/renderer/src/plugins/automations/lib/automation-llm.ts::getProviderConfigForModel` 通过 `(window as any).__appStore.value.providers` 读取 provider 配置。生产 bootstrap (`src/renderer/src/main.tsx:29-49`) 仅在 `window.__appStore` 上暴露 `refresh` 与 `refreshAsync`，**没有 `value` 属性**。

测试 `automation-llm.test.ts:27-45` 用 `Object.defineProperty(window, "__appStore", { value: mockAppStore, ... })` 装了带 `value` 形状的 fake global，让生产路径完全不被测试覆盖：

```
// 生产 bootstrap（main.tsx:38）
window.__appStore = { refresh, refreshAsync };  // 没有 value

// 测试 fake（automation-llm.test.ts:45）
window.__appStore = { value: { providers: [...] } };  // 装了 value

// automation-llm 读（automation-llm.ts:75, 81）
const appStore = (window as any).__appStore;
const settings = appStore.value;  // 生产里 → undefined
settings.providers?.find(...);    // 生产里 → TypeError
```

这是 **test seam ≠ prod seam**。`automation-llm` 在生产 LLM execution 静默失败（`TypeError: cannot read properties of undefined`）。

### 2. e2e escape hatches

`window.__appStore.refreshAsync` 与 `window.__chatStore.loadWorkspacesAsync` 安装于 `main.tsx:38, 51`，被以下 e2e helper 显式调用以「settle renderer state」：

- `e2e/03-layout-scroll.spec.ts:121-128` — `updateSettings` IPC 后强制 `appStore.refresh()`
- `e2e/mock-provider.ts:43-51` — 同上，scrape fixture 前同步 settings
- `e2e/10-home-agent.spec.ts:18-23` — 页面 reload 后强制 refresh（与 line 6 `page.reload()` 重复）
- `e2e/helpers.ts:118-119` — `__chatStore.loadWorkspacesAsync` 兜底 wait

`main.test.tsx:228-251` 有两个恒真断言：

```typescript
const mockWindow = { __appStore: undefined } as WindowWithAppStore;
expect('__appStore' in mockWindow).toBe(true); // tautology
```

这两个测试无论 main.tsx 是否真装 global 都通过 —— 不验证任何东西。

**已修复**（本 ADR 落地）：4 个 e2e helper 改用 `page.reload()`；main.test.tsx 两个恒真测试删除；main.tsx 不再安装 globals。

## Decision

### D1. automation-llm 通过现有 `ProviderApi.list()` 读取 providers

**`src/renderer/src/shared/apis/provider.api.ts`** 已经存在并 barrel export（`list` / `get` / `getModels` / `fetchModels` / `delete`）。`automation-llm.ts::getProviderConfigForModel` 改为：

```typescript
const providers = await Effect.runPromise(
  Effect.gen(function* () {
    const api = yield* ProviderApi;
    return yield* api.list();
  }).pipe(
    Effect.provide(ProviderApiLive),
    Effect.catchAll(() => Effect.succeed([])), // IPC 失败 → 空 providers → find 自然 miss
  ),
);
const provider = providers.find((p) => p.llm.models.some((m) => m.id === modelId));
if (!provider) {
  return null;
}
return { id, models, apiKey, baseUrl, defaultModel, systemPrompt: '', tools: [] };
```

**不新增 `ProviderApi` method、不新增 IPC channel、不动 preload / main handler**。复用现有 `getSettings` IPC 经 `ProviderApi.list()`（其内部实现即 `getSettings` IPC）。

**`automation-llm.ts::listAgents()` 保留现状**：仍用 `MultiAgentsApi.list()` inline `Effect.gen + Effect.provide(MultiAgentsApiLive)`（Q3 决议）。本 ADR 不重审 在 `.ts` 模块的适用范围。

### D2. 测试改用 `vi.mock` 现有 `ProviderApi`

`automation-llm.test.ts`：

- 删除 `Object.defineProperty(window, "__appStore", ...)`（lines 27-45）
- 新增：

```typescript
vi.mock('@codeman-frontend/shared/apis/provider.api', async () => {
  const actual = await vi.importActual<typeof import('@shared/apis/provider.api')>(
    '@codeman-frontend/shared/apis/provider.api',
  );
  return {
    ...actual,
    ProviderApiLive: Layer.succeed(actual.ProviderApi, {
      list: vi.fn(() => Effect.succeed(mockProviders)),
      get: vi.fn(),
      getModels: vi.fn(),
      fetchModels: vi.fn(),
      delete: vi.fn(),
    }),
  };
});
```

测试 seam = prod seam，都走 `ProviderApi` Context.Tag。

### D3. 移除 escape hatches + e2e helper 改用 page.reload()

- `src/renderer/src/main.tsx` — 删除 `__appStore` / `__chatStore` 安装代码 + `WindowWithAppStore` / `WindowWithChatStore` 类型（lines 29-60）
- `src/renderer/src/main.test.tsx` — 删除两个恒真断言测试（lines 227-251）
- `e2e/mock-provider.ts::useMockProvider` — `await w.__appStore.refreshAsync()` 改为 `await page.reload()`（helper 内部封装，11 个 caller 不变）
- `e2e/03-layout-scroll.spec.ts::seedTallProviders` — 同上
- `e2e/10-home-agent.spec.ts::reloadPageForSettings` — 删除 line 18-23 try/catch refreshAsync block（line 6 `page.reload()` 已足够）
- `e2e/helpers.ts::clickNewConversationAndWait` — 删除 line 117-120 `__chatStore.loadWorkspacesAsync()` block（line 122 `codex-input` 等待已覆盖 bootstrap 完成）

**为何用 page.reload() 而非 DOM-based wait：** renderer 是 settings.json 唯一写入方，reactive store 不存在「外部写 → 自动 refresh」机制（生产不需要）。测试要强行让 renderer 看到 IPC 写入，最直接就是 reload（re-bootstrap），不走 global escape hatch。Reloader 在 helper 内部封装，caller 零改动。

### D4. Seam split 原则（防未来 review 再建议统一）

```
Interactive UI                → reactive store  (appStore.state.value.*)
Background IPC handler input  → typed IPC adapter (ProviderApi.list() filter)
```

`automation-llm` 是 main 触发的 background IPC handler，**renderer 不写该次调用的输入**；interactive UI（chat-view / home / settings tabs）则**renderer 既是读又是写**。两边对状态的 seam 需求本质不同：

- Interactive UI：用户操作 → renderer 本地 set + IPC 持久化 → reactive store 既是 source of truth 又 leverage UI 联动（modelId 切换、provider dropdown 联动等）
- Background async IPC handler：main 触发时需要的是调用那一刻的 fresh 输入快照，reactive store 的 stale cache 会让 LLM 用错 model

这条 seam 立足于**现状代码路径**，不依赖未来扩展。

## 关联

不重审 ADR-0060（preload bridge）。本 ADR 复用其框架下的现有 `ProviderApi` typed adapter。

## Alternatives considered

### 自动化 ProviderConfig 读取走 appStore（路径 A — 不选）

直接 `import { appStore } from "@codeman-frontend/shared/stores/app.store"`，读 `appStore.state.value.providers`。修当前 bug 但留下 staleness 风险：long-running session 里 main 端若改 provider，renderer cache 不会更新。`automation-llm` 是 background IPC handler，freshness 比 reactivity 重要。

### 加 `getProviderByModelId` IPC method（路径 B — 不选）

在 `ProviderApi` 加 `getProviderByModelId(modelId)` + main handler + preload bridge + `CodemanApi` interface。语义 pure，但每个 automation execution 多一次 IPC，且 `ProviderApi.list()` 内部已用 `getSettings` IPC，无需重复 surface。`list().find()` 单行足够。

### 加 `settingsUpdated` push IPC（路径 C — 不选）

main 端 settings 写后发推送，renderer 订阅后自动 refresh。**但在生产里不会触发** —— renderer 是 settings.json 唯一写入方（用户改 Settings → renderer IPC `updateSettings` → main 写盘），renderer 本地已 set state。push IPC 是死代码，仅为 e2e「外部写」场景存在。

### 保留 escape hatch（路径 D — 不选）

继续 `window.__appStore.refreshAsync` / `__chatStore.loadWorkspacesAsync` 作为 e2e 工具。问题是「test seam = prod seam」原则破：production 也暴露了只在测试用的 global，扩大攻击面（任何 renderer 模块都能误读）。

## Consequences

### Positive

- 真实生产 bug 被修复（automation LLM 不再静默失败）
- test seam = prod seam（`ProviderApi.list()` mock 即真 IPC adapter mock）
- production 不再有「只为 e2e 服务」的 global escape hatch
- **零新 IPC surface**：复用现有 `ProviderApi.list()` 与底层 `getSettings` IPC
- ADR 记录防未来 explore 重新提议统一 / 加 push IPC / 加新 IPC method

### Negative

- e2e helper 增加 `page.reload()` 调用（每个 helper ~1s 重启成本；总影响可忽略）
- `automation-llm.ts::listAgents` 仍 inline `Effect.gen + provide`（Q3 决议，不在本 ADR 重审）

### Neutral

- 没有改动 domain model（`Provider` / `ProviderConfig` 等概念不变），`CONTEXT.md` 不动
- 不影响 `automations.store` 的 6 个 action（ADR-0053.1 D4 要求 store action 返回 Effect，保留）

## Validation

- `pnpm run typecheck` 通过
- `pnpm run test` 通过（`automation-llm.test.ts` 新 mock 覆盖原 window global 路径；恒真断言测试删除后 main.test.tsx 通过）
- `pnpm run e2e` 通过（3 个 e2e helper 改 reload 后稳定）
- `pnpm run lint` 通过

## Rollback

若 e2e flaky 严重：

1. 恢复 `__appStore` / `__chatStore` 安装（需更新 ADR 「escape hatch 保留」一段）
2. 保留 `ProviderApi.list().find()` 但让 `automation-llm` 暂时读 `window.__appStore.value`（混合模式）

推荐直接修 e2e wait，避免走 rollback。
