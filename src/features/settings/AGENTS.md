# src/features/settings — Settings Feature

## 目录布局

```
src/features/settings/
├── index.ts               # barrel: re-exports all public APIs
├── AGENTS.md              # 本文件：feature 规则 + 模式
│
├── components/
│   ├── provider-card.tsx  # LLM provider 编辑卡片（用 Card 7 子件）
│   └── provider-card.test.tsx
│
├── subsystems/            # Effect-TS 服务层（纯函数，不直接调 IPC）
│   ├── llm_providers.ts   # LLMProviderService（CRUD + API key 管理）
│   ├── llm_providers.test.ts
│   ├── system-prompt.ts    # SystemPromptService（系统提示词管理）
│   └── system-prompt.test.ts
│
└── routes/
    ├── settings.tsx       # /settings 完整页面路由组件
    └── settings.test.tsx
```

## 硬性规则

- **ProviderCard 用 Card 7 子件。** 容器用 `<Card>`，checkbox 行用 `<CardHeader>`，input 行用 `<CardContent>`，action row 用 `<CardFooter>`。不修改 `shared/ui/card.tsx` 自身。
- **Subsystems 是纯 Effect 函数。** `llm_providers.ts` / `system-prompt.ts` 不直接调 IPC，只操作 `SettingsService` 上下文。IPC 走 `invoke`（via `SettingsServiceLive`）或 bridge 函数。
- **依赖 SettingsService。** `LLMProviderService` 和 `SystemPromptService` 都依赖 `SettingsService` 上下文，通过 `yield* SettingsService` 访问。
- **UI 组件不导入 `effect`。** `ProviderCard.tsx` 只 import Solid.js + shared UI + subsystem types。
- **所有 import 路径相对于 `src/features/settings/`。** shared 资源走 `../../../shared/` 前缀。

## 模式

### ProviderCard — Card 7 子件

```
<Card class="mb-3">
  <CardHeader>
    <div class="flex items-center justify-between gap-2">
      <label>...checkbox + label...</label>
      <code>provider.id</code>
    </div>
  </CardHeader>
  <CardContent class="space-y-3">
    ... Model input row (conditional) ...
    ... Base URL input row (conditional) ...
    ... API Key row (Show toggles Set API key / [input + Save + Cancel]) ...
  </CardContent>
  <CardFooter class="flex justify-between items-center flex-wrap gap-2 mt-3">
    ... Test button + status span + Delete button ...
  </CardFooter>
</Card>
```

### Subsystems — Effect Service Pattern

```ts
// 每个 subsystem 是 Context.Tag + Layer.effect
export class XxxService extends Context.Tag("XxxService")<
  XxxService,
  { readonly method: () => Effect<A, AppError> }
>() {}

export const XxxServiceLive = Layer.effect(
  XxxService,
  Effect.gen(function* () {
    const svc = yield* SettingsService;
    return {
      method: () => Effect.gen(function* () { /* ... */ }),
    };
  }),
);
```

### 测试：subsystems

```ts
it.effect("description", () =>
  Effect.gen(function* () {
    const svc = yield* XxxService;
    // assert
  }).pipe(Effect.provide(XxxServiceLive), Effect.provide(MockSettingsServiceLive))
);
```

`MockSettingsServiceLive = Layer.succeed(SettingsService, { getSettings, updateSettings, ... })`

### 测试：UI 组件

```ts
it("renders all controls", () => {
  const { container } = render(() => <ProviderCard {...props} />);
  expect(container.querySelector('input[type="checkbox"]')).toBeTruthy();
  // Card renders with rounded-lg border
  expect(container.querySelector('[class*="rounded-lg"][class*="border"]')).toBeTruthy();
});
```

## 与外层关系

- **ProviderCard 被 settings/routes/settings.tsx 引用**（作为 `<ProviderCard />`）
- **LLMProviderService / SystemPromptService 被 ProviderCard 调用**（via bridge 函数或直接 pipe provide）
- **settings/routes/settings.tsx 使用 bridge functions**：`getSettingsBridge`, `updateSettingsBridge`, `clearAllHistoryBridge`
- **Settings 类型**来自 `shared/types`（`LLMProvider`, `Settings`）

## 图标替换（Wave 5）

| 位置 | 原文本 | 新图标 |
|---|---|---|
| header Back 链接 | `← Back` | `<ArrowLeft class="h-4 w-4 inline mr-1" />Back` |
| Add provider button | `+ Add provider` | `<Plus class="h-4 w-4 inline mr-1" />Add provider` |
| Confirm delete button | `Yes, delete all` | `<Trash2 class="h-4 w-4 inline mr-1" />Yes, delete all` |
| Clear history button | `Clear all history…` | `<Trash2 class="h-4 w-4 inline mr-1" />Clear all history…` |

图标来自 `lucide-solid`。button text 保持不变以维持测试断言（`toContain("Save")` 等）。
