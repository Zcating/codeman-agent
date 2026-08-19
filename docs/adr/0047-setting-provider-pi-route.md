# 0047 — Setting/Provider 改走 PI `createProvider()` + 3 个 setting 域收敛

- **Status**: accepted
- **Date**: 2026-08-02
- **Scope**: `src/renderer/src/features/settings/**` + `src/renderer/src/features/chat/lib/{runtime,build-model,anthropic-transport,pi-provider-adapter}.ts` + `src/renderer/src/features/chat/stores/chat.store.ts` + `src/main/features/settings/state.ts` + `src/renderer/src/shared/stores/app.store.ts` + `src/renderer/src/shared/lib/types.ts` + `src/renderer/src/shared/apis/provider.api.ts` + `docs/adr/0043-...md` (D4 标记的 pre-existing 设计债关闭)
- **Supersedes**: 无(per 锁的"runtime 路径"决定从"绕开 PI provider 抽象"变为"沿 PI `createProvider()`");在 / 0015 / 0016 / 0029 基础上的**收敛**,不是逆转
- **Related**:
  -  — pi-mono 选型来源
  -  — `apiType: "anthropic-messages"` 锁单值
  -  — `Provider.llm` shape
  -  — `Provider.apiKey` 明文落 settings.json
  -  — `Default Model Invariant`
  -  — ProviderCard 走 TanStack Form
  -  — D4 标记 renderer schema 重复为已知设计债(本 ADR 关闭)
  - [CONTEXT.md](../../CONTEXT.md) — `Provider` / `Provider.llm` / `Default Model Invariant` / `App Store` 词汇表

## Context

### 触发 1: 现有 runtime 完全绕开 PI provider 抽象

`src/renderer/src/features/chat/lib/runtime.ts` 当前走法:

1. `Provider` config from `appStore.state.value.providers[]` (camelCase shape, per)
2. 手工构造 `ProviderConfig` flat shape (`runtime.ts:93`,`ProviderConfig = { apiKey?, baseUrl, defaultModel, systemPrompt, tools, workspaceId?, enabledSkills? }`)
3. `buildModel(provider, modelId)` (`build-model.ts:11`) 构造 PI `Model<"anthropic-messages">` 静态 shape
4. `new Agent({ model, tools, systemPrompt, streamFn: anthropicStream, getApiKey: async () => provider.apiKey })` (`runtime.ts:322-337`)
5. `getApiKey` 回调绕过 PI 的 `auth.resolve` 机制

**问题**:
- (a) `Provider` config → `ProviderConfig` flat shape 的转换是 hand-rolled,**untyped cast**(新增 `Provider` 字段后 `ProviderConfig` 不报错)
- (b) `buildModel()` 构造的 PI `Model<"anthropic-messages">` 缺 `cost` / `maxTokens` / `input: ("text"|"image")[]` / `thinkingLevelMap` 等 PI 标准字段
- (c) 走自己的 `anthropicStream`(`anthropic-transport.ts`)而非 PI 的 `@earendil-works/pi-ai/api/anthropic-messages`,意味着**未来 PI 升级 transport 实现我们不跟**
- (d) `getApiKey` 回调是反 PI 抽象 — PI 设计`Provider<TApi>.auth.resolve()` 来解决这个,我们用回调绕开

### 触发 2: Schema 双实现,renderer schema 字段名与 runtime 不一致

`src/renderer/src/features/settings/lib/schemas.ts` 当前 shape(snake_case):

```ts
Schema.Struct({
  default_model: Schema.String,
  base_url: Schema.String,
  api_type: Schema.Literal("anthropic-messages", "openai-chat"),
  models: Schema.Array(Schema.Struct({ id, label, deprecated, thinking? })),
  models_endpoint: Schema.optional(Schema.String),
  // ...
})
```

`src/renderer/src/shared/lib/types.ts` 实际 `Provider` shape(camelCase,per CONTEXT.md /):

```ts
interface ProviderLlm {
  defaultModel: string;
  baseUrl: string;
  apiType: "anthropic-messages" | ...;
  models: ModelMeta[];
  modelsEndpoint?: string;
  // ...
}
```

**`schemas.ts` 字段名(snake_case)与 `types.ts` 字段名(camelCase)不一致**。表单验证实际用 `effectSchema(Schema.Struct({baseUrl, apiKey, model, enabled}))` (camelCase,per `provider-card.tsx:50-57`),所以 snake_case schema **实际未被 form 验证**。`ProviderSchema` / `SettingsSchema` 只被 types-only import 引用,没被实际 decode/encode。

ADR-0043 D4 明确说:这是 "pre-existing 设计冗余, out of scope"。

### 触发 3: `Default Model Invariant` 未覆盖所有写路径

ADR-0016 D2 不变量 `Provider.llm.defaultModel ∈ Provider.llm.models[].id ∪ {""}` 当前只在 `appStore.refreshProviderModelsImpl` 写 store 时强制。**未覆盖**:
- `appStore.set({ providers: [...] })` 手动编辑
- `add-provider-dialog.tsx` 添加新 provider
- `SettingsState.update()` 写盘
- 应用启动 `appStore.refresh()` 从磁盘 load

### 触发 4: 本项目用的 PI 实际是 earendil fork

`package.json` 声明 `@mariozechner/pi-ai` / `@mariozechner/pi-agent-core`,**但** `node_modules/@mariozechner/` 实际是 junction 指向 `node_modules/@earendil-works/pi-ai@0.80.3`(`node_modules/.pnpm/@earendil-works+pi-ai@0.80.3_ws@8.21.0_zod@4.4.3/`)。ADR-0002 写的 "pi-mono" upstream 实际是 earendil fork 的 v0.80.3。本 ADR 锁:**实际 API 形状以 `@earendil-works/pi-ai@0.80.3` 的 `.d.ts` 为准**,文档引用以 `node_modules/@earendil-works/pi-ai/dist/` 实测为准,README 是 secondary source。

## Decision

### D1 — Schema 统一为 camelCase(关闭 已知设计债)

**`src/renderer/src/features/settings/lib/schemas.ts` 改 camelCase 字段名**,与 `src/renderer/src/shared/lib/types.ts` 对齐:

| 旧(snake_case) | 新(camelCase) |
| --- | --- |
| `default_model` | `defaultModel` |
| `base_url` | `baseUrl` |
| `api_type` | `apiType` |
| `models_endpoint` | `modelsEndpoint` |
| `api_key` | `apiKey` |
| `default_llm_provider_id` | `defaultLlmProviderId` |
| `user_language` | `userLanguage` |
| `start_at_login` | `startAtLogin` |
| `remember_position` | `rememberPosition` |
| `remember_size` | `rememberSize` |
| `default_size` | `defaultSize` |
| `min_size` | `minSize` |
| `auto_archive_after_days` | `autoArchiveAfterDays` |
| `max_history` | `maxHistory` |
| `user_can_edit` | `userCanEdit` |
| `schema_version` | `schemaVersion` |
| `llm_providers` | `llmProviders` (legacy) |

**JSON on-disk 格式保持 camelCase**(per 已定 wire format = camelCase;`SettingsState.load/save` 不做任何转换,直接 read/write camelCase)。

**保留 helper**:`withMessage`, `BaseUrlSchema`, `ModelSchema`, `ApiKeySchema`(已 camelCase)。

**删除 dead `llmProviders: Schema.Array(Schema.Unknown)` 字段**(line 47,per V1.5 合并已无意义)。

**类型导出路径**:`type Provider = Schema.Schema.Type<typeof ProviderSchema>`(from `schemas.ts`)**与** `interface Provider`(from `types.ts`)**统一为后者**;前者用 `Schema` derive 改用 `interface` 直接写,types.ts 为 single source of truth。

#### D1.5 — on-disk wire format:保持 camelCase,无转换层

`src/main/features/settings/state.ts` 的 `load()` 直接 `sanitize(raw)`(main schema 已是 camelCase),`save()` 直接 `JSON.stringify(this.cache)`。**不引入** snake_case ↔ camelCase 转换层:

- wire format 已是 camelCase(ADR-0024 D10:V3.1 起新写盘 / 新读盘全 camel,含一次性 `migrateV15SnakeToCamel()` 迁移存量 snake 文件)
- 应用未正式上线,无真实用户 settings.json 需要保持 snake_case 兼容;转换层是无谓复杂度(违反简单优先)
- 明确拒绝过「wire snake + IPC 层 bridge」(其 Rejected (a))——本 D1 不复活该方案

**拒绝**:
- A. 在 renderer schema 内部做 snake_case ↔ camelCase 转换:违反 simple 优先(双重映射)
- B. 把 main schema 也改 snake_case:破坏 已立的 camelCase runtime 形状 + 的 camelCase wire
- C. 跨进程共享 schema(`src/shared/schema`):架构变更,需独立 ADR;不绑本 PR

### D2 — `Default Model Invariant` 集中化

**抽纯函数** `enforceDefaultModelInvariant(llm: ProviderLlm): ProviderLlm` 到 `src/renderer/src/features/settings/lib/provider-invariant.ts`(~15L):

```ts
export function enforceDefaultModelInvariant(llm: ProviderLlm): ProviderLlm {
  if (llm.models.length === 0) {
    return { ...llm, defaultModel: "" };
  }
  const matched = llm.models.find((m) => m.id === llm.defaultModel);
  if (matched) return llm;
  return { ...llm, defaultModel: llm.models[0].id };
}
```

**覆盖 4 个写路径**:

| 位置 | 改动 |
| --- | --- |
| `appStore.refreshProviderModelsImpl` (L107-121) | 已有 fallback 逻辑抽出 → `enforceDefaultModelInvariant` 调用 |
| `appStore.set(patch: Partial<Settings>)` | 改为 `set(patch, opts?: { enforceInvariant?: boolean })`,默认 `enforceInvariant: true`;`applyPatch` 内部 detect `patch.providers` 触发 |
| `appStore.refresh()` (`refreshImpl`) | `setSettings("value", fresh)` 之前 `enforceDefaultModelInvariant(fresh.providers)` 遍历 |
| `add-provider-dialog.tsx` onSubmit | 调 invariant;不通过 → toast error |
| `SettingsState.update()` (main 端) | sanitize 后调 `enforceDefaultModelInvariant`(main 端复制纯函数,**不**跨 main→renderer 共享函数,避免 cross-feature dependency) |

**测试** `provider-invariant.test.ts` 5 case:
1. 空 models → `defaultModel = ""`
2. `defaultModel` 在 models 中 → 保留
3. `defaultModel` 不在 models 中 → fallback 到 `models[0].id`
4. 多 match 第一个 → 保留
5. `defaultModel` 已 `""` 且 models 非空 → 保留 `""`(用户显式清空)

### D3 — PI `createProvider()` 迁移(关 D1 决策;核心)

> **2026-08-02 修正**:本 D3 原稿假设 "删 `streamFn` 字段,Agent 不再传" — 实测 `pi-agent-core@0.80.3` 的 `Agent` 类 **必须** `streamFn`(compat API,`agent.d.ts:9` `streamFn?: StreamFn`),不接受 `Provider<TApi>`。`createProvider()` 是新 API,产出 `Provider<TApi>` 自带 `.stream()`,`Agent` 消费不了。用户二次决策(**收敛版**):保留 `Agent` 架构,`createProvider()` 仅作 **Model 目录工厂**,transport 换 PI `anthropicMessagesApi()` 薄包装。以下为修正后设计。

**新增** `src/renderer/src/features/chat/lib/pi-provider-adapter.ts`(~90L):

```ts
import { createProvider, type Provider as PiProvider, type Model as PiModel, type ApiKeyAuth, type ProviderAuth } from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import type { ModelMeta } from "@codeman-frontend/shared/lib/types";

/** 运行时向 adapter 提供的 provider 片段(非完整 settings Provider;runtime 只持有 ProviderConfig) */
export interface PiProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: ModelMeta[];
  modelsEndpoint?: string;
}

/** 把我们的 ModelMeta 转成 PI Model<"anthropic-messages">。缺字段 hardcoded fallback。 */
function modelMetaToPiModel(meta: ModelMeta, baseUrl: string, providerId: string): PiModel<"anthropic-messages"> {
  return {
    id: meta.id,
    name: meta.label,
    api: "anthropic-messages",
    provider: providerId,
    baseUrl,
    reasoning: meta.thinking ?? false,
    input: ["text"],  // V1 不支持 vision input
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },  // V1 不显示 cost
    contextWindow: meta.contextWindow ?? 200_000,
    maxTokens: 8192,  // PI default;V1 不暴露
  };
}

/** 我们的 apiKey → PI ApiKeyAuth(只接 apiKey,拒 OAuth;resolve 是同步常量,透传 settings key) */
function buildApiKeyAuth(apiKey: string): ApiKeyAuth {
  return {
    name: "API key",
    resolve: async () => ({ auth: { apiKey } }),
  };
}

export function createProviderFromConfig(cfg: PiProviderConfig): PiProvider<"anthropic-messages"> {
  const piModels: PiModel<"anthropic-messages">[] = cfg.models.map((m) =>
    modelMetaToPiModel(m, cfg.baseUrl, cfg.id),
  );
  const auth: ProviderAuth = { apiKey: buildApiKeyAuth(cfg.apiKey) };
  return createProvider<"anthropic-messages">({
    id: cfg.id,
    name: cfg.name,
    baseUrl: cfg.baseUrl,
    auth,
    models: piModels,
    ...(cfg.modelsEndpoint
      ? {
          refreshModels: async () => {
            const res = await fetch(cfg.modelsEndpoint!, {
              headers: { Authorization: `Bearer ${cfg.apiKey}` },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            return parseModelsApiResponse(json).map((m) =>
              modelMetaToPiModel(m, cfg.baseUrl, cfg.id),
            );
          },
        }
      : {}),
    api: anthropicMessagesApi(),
  });
}

/** 从 PI provider 的 getModels() 里找 defaultModel;models 空时返回 synthetic "auto" model(保留当前 runtime 行为) */
export function findDefaultModel(
  provider: PiProvider<"anthropic-messages">,
  defaultModelId: string,
): PiModel<"anthropic-messages"> {
  const models = provider.getModels();
  const found = models.find((m) => m.id === defaultModelId);
  if (found) return found;
  return {
    id: defaultModelId || "auto",
    name: defaultModelId || "auto",
    api: "anthropic-messages",
    provider: provider.id,
    baseUrl: provider.baseUrl ?? "",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  };
}
```

**新增** `src/renderer/src/features/chat/lib/anthropic-stream-fn.ts`(~15L)替换 `anthropic-transport.ts`:

```ts
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import type { StreamFn } from "@earendil-works/pi-agent-core";

/** Agent 的 streamFn 薄包装:PProvider 的 api stream。Agent loop 已把 getApiKey 注入 options.apiKey。 */
export const anthropicStream: StreamFn = (model, context, options) =>
  anthropicMessagesApi().stream(model, context, options);
```

**auth header 行为**:PI transport 用 Anthropic SDK,`apiKey` 存在时发 `x-api-key`(Anthropic 标准),**不是** `Authorization: Bearer`。Anthropic 兼容端点(MiniMax `/anthropic` / DeepSeek `/anthropic`)按设计接受 Anthropic SDK 的 `x-api-key`(它们即为官方 SDK 适配)。**风险记录**:极端情况下若某兼容端点只收 Bearer,需改传 `headers: { authorization: ... }` 覆盖(`assertRequestAuth` 已支持)。QA 需对真实 provider 实测一次。

**`refreshModels` auth header 特别记录**:`refreshModels` 的 fetch 使用 `Authorization: Bearer`(与 streaming 的 `x-api-key` 不一致,QA 需覆盖此路径)。

**改 `src/renderer/src/features/chat/lib/runtime.ts`**:
- `ProviderConfig` 加 `id: string` + `models: ModelMeta[]`(runtime 需要它们构 PI provider)
- `run()` 内删内联 Model 构造(L300-311)→
  ```ts
  const piProvider = createProviderFromConfig({
    id: provider.id,
    name: provider.id,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey ?? "",
    models: provider.models,
  });
  const model = findDefaultModel(piProvider, provider.defaultModel);
  ```
- `streamFn: anthropicStream`(新薄包装 import),`getApiKey` 保留(Agent 注入 options.apiKey)
- 删 `import { anthropicStream } from ".../anthropic-transport"`

**改 `src/renderer/src/features/chat/stores/chat.store.ts`**:
- `sendMessage` 签名 `provider: ProviderConfig` 不变;`augmentedProvider` 的 `...provider` spread 自动带新字段
- compaction L174 `buildModel(appProvider, ...)` → `createProviderFromConfig({ id: appProvider.id, name: appProvider.label, baseUrl: appProvider.llm.baseUrl, apiKey: appProvider.apiKey, models: appProvider.llm.models, modelsEndpoint: appProvider.llm.modelsEndpoint })` + `findDefaultModel`
- compaction L180-202 内联 piProvider hack **删除**,直接 `createModels()` + `models.setProvider(createProviderFromConfig(...))`
- `no_api_key` CompactionFailed 检查保留(显式 `if (!appProvider.apiKey)` 而非 buildModel throw)

**改组件 ProviderConfig 构造点**:
- `home.tsx:110-116` + `chat-view.tsx:226-...`:加 `id: providerConfig?.id ?? ""`, `models: providerConfig?.llm?.models ?? []`
- `chat.store.test.ts` `defaultProvider` fixture:加 `id` + `models`

**删**:`build-model.ts` + `build-model.test.ts`;`anthropic-transport.ts`(619L)+ `anthropic-transport.test.ts`(440L);`parseSseLine` / `buildAnthropicRequestBody` / `parseSseStream` 无外部引用(仅 anthropic-transport.test.ts 自用)。

**新增测试** `pi-provider-adapter.test.ts`(4 case):
1. happy: `createProviderFromConfig` 产出 provider,`getModels()` 含 `models` 映射(id/name/baseUrl/provider 字段正确)
2. `findDefaultModel` 命中 models 内 model → 返回它
3. `findDefaultModel` 未命中(或空 models)→ 返回 synthetic "auto" model(id = defaultModel || "auto")
4. 缺 modelsEndpoint → 无 `refreshModels` 选项(`refreshModels` 为 undefined)

**新增测试** `anthropic-stream-fn.test.ts`(1 case):
- mock `anthropicMessagesApi().stream` 被调,返回 stream 对象

**保留**:`validateProvider()` 浅验证(超出 scope);`getApiKey` 回调机制(Agent compat API 要求);`runtime-validate-provider.ts`。

**验证额外注意**:
- `runtime.ts` 内联 Model 构造删后,`model.provider` 从硬编码 `"anthropic"` 变为 `provider.id`(user provider id)。`agent-loop.js` 的 `getApiKey(config.model.provider)` 用 `model.provider` 查 key — 现在传的是 user provider id 而非 "anthropic",但 `getApiKey: async () => provider.apiKey ?? undefined` 忽略参数,无影响。
- mock server 兼容:PI SDK 打 `{baseUrl}/v1/messages`,mock baseUrl `http://127.0.0.1:50000/mock/anthropic` → `.../mock/anthropic/v1/messages`,与现 mock-server 路由一致。

### D4 — 接 `apiKey`,拒 OAuth(per 用户决策)

`buildApiKeyAuth()` 只生成 `ApiKeyAuth` 子集。`ProviderAuth.oauth` 字段不引入,`@earendil-works/pi-ai/oauth` entrypoint 不引。

**`ProviderAuth` 形如**:`{ apiKey: ApiKeyAuth }`(无 `oauth` 字段)。

**未来 OAuth 接入**:`createProviderFromConfig` 加 `oauth?: OAuthAuth` 形参,V3+ 评估(per 用户决策"V3+")。

### D5 — 3 atomic commit 顺序与依赖

| # | Commit | 文件 | 依赖 | 估时 |
| --- | --- | --- | --- | --- |
| 1 | `A. refactor(settings): unify schema to camelCase ` | `schemas.ts` + `state.ts` + `types.ts` + 2 测试 | 无 | 2-3d |
| 2 | `B. refactor(settings): centralize default-model invariant ` | `provider-invariant.ts`(新)+ `app.store.ts` + `add-provider-dialog.tsx` + main 端 `state.ts` 复制 + 5 测试 | A 不依赖(独立)| 1d |
| 3 | `C+D. refactor(chat): migrate to PI createProvider() (ADR-0047 D3+D4)` | `pi-provider-adapter.ts`(新)+ `anthropic-stream-fn.ts`(新)+ `runtime.ts` + `chat.store.ts` + `home.tsx` + `chat-view.tsx` + 删 `build-model.ts` + 删 `anthropic-transport.ts` + 4+1 测试 | A + B | 3-4d(修正:收敛版,保留 Agent) |

**实施顺序**:串行(A → B → C+D)。A 和 B 改动文件集无交集,**理论上可并行**(`run_in_background=true` 派发 2 个 subagent),但**实际**为简化协调,先 A 后 B;若 A 失败 B 自动 rebase 重跑。

**3 commits 落 master 前**:
- A、B、C+D 各自分配独立 subagent,每个 subagent 配 `workdir=<worktree-absolute-path>`(per /work-work 护栏)
- 主会话**不写一行代码**,只做 TDD 拆 + subagent 派发 + 复核

### D6 — `SettingsState` IPC 边界(on-disk 保持 camelCase)

D1.5 决策的细则。`SettingsState` 在 `load()` / `save()` 两端都**不做字段名转换**,直接读写 camelCase(与 main schema、ADR-0024 D10 wire format 一致):

```ts
load(): Settings {
  if (this.cache !== null) return this.cache;
  let raw: unknown = {};
  if (existsSync(this.filePath)) {
    try { raw = JSON.parse(readFileSync(this.filePath, "utf-8")); } catch { raw = {}; }
  }
  this.cache = sanitize(raw as Partial<Settings>);
  this.save();
  return this.cache;
}

private save(): void {
  if (this.cache === null) return;
  writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2), "utf-8");
}
```

**为什么不做 snakeToCamel / camelToSnake**:

- `sanitize()` 走 `Schema.decode(SettingStruct)`,`SettingStruct` 是 camelCase;on-disk 直接存 camelCase,无 decode 失败问题。
- on-disk snake_case 的「历史兼容旧 V1.x settings.json」理由不成立:应用未正式上线,无真实用户数据;ADR-0024 D10 已用一次性 `migrateV15SnakeToCamel()` 处理存量 snake 文件,且明确拒绝「wire snake + IPC bridge」方案。
- 若未来需兼容旧 snake 文件,应走 的 migration 管线(load 入口一次迁移),而非每次 load/save 都做转换。

**测试**:
- `state.test.ts` 已有覆盖(load 空文件 / 写盘 round-trip 等)

## Considered Options

### A 候选(Schema 统一)3 选

| 选 | 描述 | 选 / 不选 |
| --- | --- | --- |
| 1 | renderer schema 改 camelCase + IPC 边界显式转换(本 ADR) | **选** — 关闭 设计债,简单直接 |
| 2 | main schema 也改 snake_case | 不选 — 破坏 已立的 camelCase runtime |
| 3 | 跨进程共享 schema(`src/shared/schema`) | 不选 — 架构变更,需独立 ADR;不绑本 PR |

### B 候选(Invariant 集中化)3 选

| 选 | 描述 | 选 / 不选 |
| --- | --- | --- |
| 1 | 抽 `enforceDefaultModelInvariant()` 纯函数,4 个写路径调(本 ADR) | **选** — 单一真源,无运行时代价 |
| 2 | 把 invariant 放 main schema `sanitize()` 内部 | 不选 — renderer store 写时仍能破 invariant(sanitize 只在 disk 路径) |
| 3 | invariant 放 `appStore.set` 内置 default true | 选 sub-option(本 ADR D2) — 但**只覆盖 renderer 写路径**,main 端 disk 路径仍需独立 |

### C+D 候选(PI route)5 选

| 选 | 描述 | 选 / 不选 |
| --- | --- | --- |
| 1 | **收敛至 PI `createProvider()`(保留 Agent)**(本 ADR D3) | **选** — 与 PI v0.80.3 升级方向对齐;`ProviderAuth` 抽象层为未来 OAuth 留 seam;`Model` 字段补齐 |
| 2 | Adapter 层,保留 `ProviderConfig` + 现有 `getApiKey` 回调 | 不选 — scope 小但重复 PI 抽象;用户已选全量 |
| 3 | Plugin 路线(3 个选项平型走) | 不选 — doubles 代码量 |
| 4 | 推迟 PI 路线,只做 A+B | 不选 — 用户已选全量 |
| 5 | 走内置 provider factory(`anthropicProvider()` / `MiniMaxProvider()` 等) | 不选 — `Provider` config 在 settings.json 是 user-editable,内置 factory 是固化 catalog;user model list 跟内置 catalog 不对齐 |

## Consequences

### 正面

- **ADR-0043 D4 已知设计债关闭**:renderer schema 与 runtime 对象字段名统一,`Schema.decode(SettingsSchema)` 真正可用,form 验证与 disk schema 单一真源
- **`Default Model Invariant` 真集中**:4 个写路径全覆盖,UI dropdown 与 store `defaultModel` 永远一致
- **PI 升级方向对齐**:未来 PI 改 `Provider<TApi>` / `AuthResult` 字段我们跟得上;`createProvider()` 是 PI 官方推荐 extension API(per README "Custom Providers / createProvider()" 章节)
- **`Model<TApi>` 字段补齐**:`cost` / `maxTokens` / `input` 字段可灌(目前 hardcoded 0/8192/["text"],V1 UI 不显示;V2+ 可用)
- **删 `buildModel.ts` + `build-model.test.ts`**(~50L + 30L 删)
- **`ProviderConfig` 扩展而非删除**:加 `id` + `models` 字段,runtime 用它构 PI provider(收敛版修正,`Agent` compat API 仍需 streamFn,ProviderConfig 保留)
- **删 `anthropic-transport.ts`(619L)+ test(440L)**:走 PI `anthropicMessagesApi()` 薄包装,PI 升级 transport 我们免费跟随
- **测试 seam 升级**:`pi-provider-adapter.test.ts` mock `anthropicMessagesApi` 注入;不用 mock `fetch` + `ProviderConfig` 拼装

### 负面 / 代价

- **新依赖**:`@earendil-works/pi-ai/api/anthropic-messages.lazy`(lazy wrapper,首次请求才加载 SDK);renderer bundle 体积 +~50KB(SDK 实际大小待测)
- **`ModelMeta` → `Model<"anthropic-messages">` mapper 缺字段 hardcoded**:cost=0 / maxTokens=8192 / input=["text"];V1 UI 不消费,无功能损失;但**结构上不真实**,未来如要显示 cost 需重新思考数据来源
- **`SettingsState` IPC 边界转换**:2 个纯函数 + 4 单测,~30L;但只 main 端有,renderer 端 schema 改后无转换
- **`createProviderFromConfig` adapter 复杂度**:~90L;`buildModel()` 是 ~30L;adapter 大 3x 是因为接 `Provider<TApi>` 全套接口(`auth.resolve` / `getModels` / `refreshModels`)
- **auth header 变化风险**:PI transport 发 `x-api-key`(Anthropic SDK 标准),非 `Authorization: Bearer`。Anthropic 兼容端点按设计接受;QA 需对真实 provider 实测,若失败改传 `headers: { authorization }` 覆盖
- **`runtime.ts` 内联 Model 构造删后 `model.provider` 从 `"anthropic"` 变 user provider id**:`getApiKey` 忽略参数,无影响;但需在代码注释 + 本 ADR 记录(防未来读者困惑)
- **`ProviderConfig` 加字段 = 3 个构造点改动**:`home.tsx` + `chat-view.tsx` + `chat.store.test.ts` fixture;30+ test 调用点共享 fixture,改 1 处即可
- **未来 OAuth 接入的预留**:`createProviderFromConfig` 形参留 `oauth?: OAuthAuth`(D4 决定 V1 不实现,V3+)

### 不变

- (pi-mono 选型) — upstream 由 `@mariozechner/pi-ai` 名字看是 pi-mono,实际是 earendil fork v0.80.3(per D4 校正);但 **API 形态与 pi-mono 兼容**(同是 pi-ai 0.80.x 线)
- (anthropic-messages only) — `apiType: "anthropic-messages"` 锁单值不变,`anthropicMessagesApi()` 硬编码
- (Unified Provider schema) — `Provider.llm` shape 不变;只是 runtime 侧加 `pi-provider-adapter` 层
- (app-store + 明文 key) — `Provider.apiKey` 仍明文落 settings.json,`apiKeyAuth.resolve` 透传
- (refreshProviderModels + invariant) — 不变量词条保留;**D2 是它的强化**(集中化),不逆转
- (Form mode) — ProviderCard 走 TanStack Form 不变
- IPC contracts (channel 名 + 参数类型)— 完全不变(renderer 内部重构)
- `add-provider-dialog` 老 signal + onSubmit 范式 — 不动(per /work-work Must NOT)
- e2e spec 设置路径 — 不动

## Risks

- **R1**: `pi-provider-adapter.ts` 100L 是新模块,需 TDD 严格红绿重构;`buildModel` 删前必须有等价 PI Model 输出测试(防"功能回归")
- **R2**: `anthropicMessagesApi()` 立即加载 SDK,bundle size +50KB(估);若超 600KB 阈值需改用 `.lazy` 后缀
- **R3**: `ModelMeta` → `Model<"anthropic-messages">` mapper 的 `provider` 字段必须填 user provider id(per `modelMetaToPiModel` 的 `.with({ provider })`);漏填 PI 内部路由失败
- **R4**: `SettingsState` load/save 不做字段名转换,on-disk 即 camelCase;性能无转换开销
- **R5**: `enforceDefaultModelInvariant` 是 fallback 而非 throw,用户编辑 `defaultModel` 后 save 之前会"自动跳"到 `models[0]`,可能让用户困惑(为何我改完点 Save 字段没保存);**ADR 章节记录行为**(per /work-work Must NOT 解除);V2+ 加 UI warning

## Verification

每 commit verify gates:

```
# Commit 1 (A: schema 统一)
vp run typecheck                  → exit 0
vp run test                       → 285 + 0 = 285 全过 (无 case-conversion 测试 — D1.5 无转换层)
vp run lint                       → 无新违规

# Commit 2 (B: invariant 集中化)
vp run typecheck                  → exit 0
vp run test                       → 285 + 5 = 290 全过
vp run lint                       → 无新违规

# Commit 3 (C+D: PI route)
vp run typecheck                  → exit 0
vp run test                       → 290 - 1(删) + 3(新) = 292 全过
vp run lint                       → 无新违规
grep -r "buildModel\|ProviderConfig" src/  → 仅在 plan/ADR 出现

# Manual smoke test
vp run dev
# 1. Settings → 改 MiniMax baseUrl → Save → 验证 settings.json on-disk 仍 camelCase
# 2. Settings → 改 model → Save → 重启 app → refresh() 加载后 defaultModel 不变
# 3. Chat → 发消息 → 走 PI `createProviderFromConfig` → stream 成功
# 4. Settings → Add Provider → 加 OpenAI-compatible 自定义 → Refresh models 成功
```

无新 e2e spec(spec-03 / spec-04 覆盖 settings + chat 路由 happy path)。

## Rollout

3 atomic commit on `refactor/setting-provider-pi-route` worktree branch:

```
1. refactor(settings): unify schema to camelCase
2. refactor(settings): centralize default-model invariant
3. refactor(chat): migrate to PI createProvider() (ADR-0047 D3+D4)
```

merge to master 用 `--no-ff`(per AGENTS.md)。

## References

-  /  /  /  /  /  /
- `@earendil-works/pi-ai@0.80.3` `dist/models.d.ts` (CreateProviderOptions / Provider / createProvider) + `dist/auth/types.d.ts` (ProviderAuth / ApiKeyAuth) — 实测
- `@earendil-works/pi-ai@0.80.3` README — Custom Providers / createProvider() / API Implementations 章节
- `node_modules/.pnpm/@earendil-works+pi-ai@0.80.3_ws@8.21.0_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/` — API 实证
- CONTEXT.md — `Provider` / `Provider.llm` / `Default Model Invariant` / `App Store` 词汇表
- [`.omo/plans/setting-provider-optimization.md`](../../.omo/plans/setting-provider-optimization.md) — 调研产物(本 ADR 详细 plan)
