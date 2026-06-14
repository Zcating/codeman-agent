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
- **UI 组件不导入 `effect`。** `ProviderCard.tsx` 只 import Solid.js + shared UI + lib types。
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

**注意**（ADR-0010 Q6）：`lib/*.test.ts` 中 `import { mockState } from "<repo-root>/__mocks__/@tauri-apps/api/core"`——`mockState` 唯一源在仓库根 `__mocks__/`，**不是** `@/shared/shared-mock-state`（该文件已删除）。

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
- **Wave V1.5**（2026-06-15，ADR-0010）：`subsystems/` 合并到 `lib/`；`llm_providers.ts` → `llm-providers.ts`（snake_case → kebab-case）；mockState 唯一源切到仓库根 `__mocks__/`；types 镜像路径从 `shared/types/` 改为 `shared/lib/types.ts`
