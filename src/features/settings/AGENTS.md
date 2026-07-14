# src/features/settings — Settings Feature

> 本目录结构遵循 [ADR-0010](../../docs/adr/0010-frontend-5-1-folder-whitelist.md) 的 5 子目录白名单。V1.5（2026-06-15）将旧 `subsystems/` 合并到 `lib/`，并将 `llm_providers.ts` 重命名为 `llm-providers.ts`（snake_case → kebab-case，对齐项目约定）。

## 目录布局（ADR-0010 V1.5）

```
src/features/settings/
├── index.ts               # barrel: re-exports all public APIs（feature 根级唯一允许的文件之一）
├── AGENTS.md              # 本文件
│
├── components/
│   ├── provider-card.tsx  # LLM provider 编辑卡片（用 Card 7 子件）
│   └── provider-card.test.tsx
│
├── lib/                   # Effect-TS 服务层（从旧 subsystems/ 合并；纯函数，不直接调 IPC）
│   ├── llm-providers.ts   # LLMProviderService（CRUD + API key 管理）
│   ├── llm-providers.test.ts
│   ├── system-prompt.ts   # SystemPromptService（系统提示词管理）
│   └── system-prompt.test.ts
│
└── routes/
    ├── settings.tsx       # /settings 完整页面路由组件
    └── settings.test.tsx
```

> **ADR-0010 前后路径对照**：
>
> - `subsystems/llm_providers.ts` → `lib/llm-providers.ts`（**snake_case → kebab-case**，项目唯一例外修复）
> - `subsystems/system-prompt.ts` → `lib/system-prompt.ts`
> - 旧 `types/` 目录（空）已删除
> - `subsystems/` 目录已删除
>
> `stores/` 和 `hooks/` 目录 V1 暂无（settings 域当前无跨组件 Solid signal 状态、无 composable 需求）。

## 硬性规则

- **ProviderCard 用 Card 7 子件。** 容器用 `<Card>`，checkbox 行用 `<CardHeader>`，input 行用 `<CardContent>`，action row 用 `<CardFooter>`。不修改 `shared/components/ui/card.tsx` 自身（**路径从 `shared/ui/card.tsx` 改为 `shared/components/ui/card.tsx`**——ADR-0010）。
- **`lib/*.ts` 是纯 Effect 函数。** `llm-providers.ts` / `system-prompt.ts` 不直接调 IPC，只操作 `SettingsService` 上下文。IPC 走 `invoke`（via `SettingsServiceLive`）或 bridge 函数。
- **依赖 SettingsService。** `LLMProviderService` 和 `SystemPromptService` 都依赖 `SettingsService` 上下文，通过 `yield* SettingsService` 访问。
- **UI 组件不导入 `effect`。** `ProviderCard.tsx` 只 import Solid.js + shared UI + lib types。**例外**: 2026-07 form 改造后,ProviderCard 需要 `Schema` (从 effect) 写 field-level validation schema — 这是 allowed, 因为 Schema 类型/值是声明式而非 Effect runtime, 不违反 "UI 不导入 effect" 的初衷 (effect service runtime / Layer DI / Effect.gen 不进入 component 树)。
- **所有 import 路径相对于 `src/features/settings/`。** shared 资源走 `../../../shared/` 前缀。

## 模式

### ProviderCard — Card 7 子件 + Form 模式 (2026-07, Plan C)

ProviderCard 用 [`@tanstack/solid-form`](https://tanstack.com/form/latest) 替换 V1.8+ 的 "按键立即写 appStore" 反模式。修复了 Base URL / API Key 输入框打字时丢失焦点的 bug (根因: settings.tsx 的 `<For each={providers}>` + `array.map()` 整批替换导致 `<For>` 引用相等性 diff 误判 → 整张 ProviderCard 卸载重建 → DOM 元素被替换 → focus 丢失)。

```tsx
import { createForm } from "@tanstack/solid-form";
import { Schema } from "effect";
import { effectSchema } from "@/shared/lib/effect-schema-adapter";

const BaseUrlSchema = Schema.String.pipe(
  Schema.pattern(/^https?:\/\/.+/, {
    message: "Base URL must start with http:// or https://",
  } as never),
);

const form = createForm(() => ({
  defaultValues: {
    baseUrl: props.provider.llm.baseUrl,
    apiKey: props.provider.apiKey,
    model: props.provider.llm.defaultModel,
    enabled: props.provider.enabled,
  },
  validators: {
    onChange: effectSchema(Schema.Struct({
      baseUrl: BaseUrlSchema,
      apiKey: Schema.String,
      model: Schema.String.pipe(Schema.minLength(1)),
      enabled: Schema.Boolean,
    })),
  },
  onSubmit: async ({ value }) => {
    // ... 写 appStore + flushNow + props.onUpdate
  },
}));

return (
  <form.Field name="baseUrl" validators={{ onBlur: effectSchema(BaseUrlSchema) }}>
    {(field) => (
      <CodemanInput
        value={field().state.value}
        onValueChange={field().handleChange}
        onBlur={() => { field().handleBlur(); void form.handleSubmit(); }}
        error={firstErrorMessage(field().state.meta.errors)}
      />
    )}
  </form.Field>
);
```

**关键约束:**

- **typing 不写 store** — `onValueChange={field().handleChange}` 只更新 form 内部 signal, 不触发 `appStore.set`。`settings.tsx` 的 `<For>` 看到的 providers 数组引用稳定, DOM 不被替换。
- **commit 在 blur / change** — text input 走 `onBlur={field().handleBlur(); form.handleSubmit()}`, select/checkbox 走 `onChange={field().handleChange(e); form.handleSubmit()}`。
- **IME 安全保留** — `CodemanInput` 的 `composing` flag + `onCompositionStart/End/input` 三件套不受 form 包影响,中文拼音用户开箱即用。`field().handleChange` 接收的是 IME 完成后的一次性 flush。
- **`effectSchema` 适配** — Effect Schema 不实现 Standard Schema V1, 通过 `effectSchema(Schema.X)` 适配 (5/5 unit tests in `src/shared/lib/effect-schema-adapter.test.ts`)。返回 `{ value }` 或 `{ issues: [{ message, path? }] }`。
- **错误提取** — `field().state.meta.errors` 是 `unknown[]`,用 `firstErrorMessage()` 抽取 `{ message: string }` 对象里的 `message` 字段,不要 `.toString()` (会得到 `"[object Object]"`)。

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

### `lib/*.ts` — Effect Service Pattern

```ts
// 每个 lib 文件装一个 Effect service
export class XxxService extends Context.Tag("XxxService")<
  XxxService,
  { readonly method: () => Effect<A, AppError> }
>() {}

export const XxxServiceLive = Layer.effect(
  XxxService,
  Effect.gen(function* () {
    const svc = yield* SettingsService;
    return {
      method: () =>
        Effect.gen(function* () {
          /* ... */
        }),
    };
  }),
);
```

### 测试：`lib/*.test.ts`

```ts
it.effect("description", () =>
  Effect.gen(function* () {
    const svc = yield* XxxService;
    // assert
  }).pipe(Effect.provide(XxxServiceLive), Effect.provide(MockSettingsServiceLive)),
);
```

`MockSettingsServiceLive = Layer.succeed(SettingsService, { getSettings, updateSettings, ... })`

**注意**（T5 迁移）：`lib/*.test.ts` 中 `import { mockState } from "src/__mocks__/ipc-mock"`——`mockState` 唯一源在 `src/__mocks__/ipc-mock.ts`，**不是** `@/shared/shared-mock-state`。

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
- **Settings 类型**来自 `src/shared/lib/types.ts`（**路径从 `shared/types/` 改为 `shared/lib/types.ts`**——ADR-0010，类型镜像合并到 `lib/`）

## 图标替换（Wave 5）

| 位置                  | 原文本               | 新图标                                                     |
| --------------------- | -------------------- | ---------------------------------------------------------- |
| header Back 链接      | `← Back`             | `<ArrowLeft class="h-4 w-4 inline mr-1" />Back`            |
| Add provider button   | `+ Add provider`     | `<Plus class="h-4 w-4 inline mr-1" />Add provider`         |
| Confirm delete button | `Yes, delete all`    | `<Trash2 class="h-4 w-4 inline mr-1" />Yes, delete all`    |
| Clear history button  | `Clear all history…` | `<Trash2 class="h-4 w-4 inline mr-1" />Clear all history…` |

图标来自 `lucide-solid`。button text 保持不变以维持测试断言（`toContain("Save")` 等）。

## Wave 笔记

- **Wave 5**（2026-06-14）：lucide-solid 图标替换 4 处
- **Wave V1.5**（2026-06-15，ADR-0010）：`subsystems/` 合并到 `lib/`；`llm_providers.ts` → `llm-providers.ts`（snake_case → kebab-case）；mockState 唯一源切到`src/__mocks__/`；types 镜像路径从 `shared/types/` 改为 `shared/lib/types.ts`
- **Wave 2026-07 (Plan C)**：接 `@tanstack/solid-form` 替换 V1.8+ 的 "按键立即写 appStore" 反模式。ProviderCard 重写为 `createForm` + 4 `form.Field`,typing 不写 store (避免 `<For>` remount + DOM 替换 → focus 丢失), commit 在 onBlur / onChange。新增 `src/shared/lib/effect-schema-adapter.ts` (Effect Schema → Standard Schema V1, 5/5 tests)。修复 Base URL / API Key 输入框 typing 后丢失焦点的 bug。
