# src/ — 前端 (Solid.js + TypeScript)

Vite 单页应用，渲染到单个 Tauri main 窗口。路由走 TanStack Router（`/` = chat，`/settings` = 设置）。不需要 hash 监听。

V1 是 Tauri 2 + Solid chat agent，**不是 V0 280x100 浮窗**。视觉层走 Tailwind v4 utility（ADR-0006），逻辑层走 Effect-TS（ADR-0003）。

## 目录布局

```
src/
├── index.tsx              # Solid 渲染入口（挂载 <RouterProvider>）
│                         # 首行：import "./index.css"
├── index.css              # Tailwind v4 入口（@import + @theme + @layer base）
├── test-setup.ts          # vitest setup（jsdom polyfills）
├── shared-mock-state.ts   # 跨测试共享的 mock 状态
├── vite-env.d.ts          # Vite 类型
├── router.tsx             # TanStack Router 路由定义（/ = chat，/settings = 设置）
│
├── routes/                # TanStack Router 路由组件
│   ├── index.tsx          #   Chat 布局路由（挂载 ChatView + Sidebar）
│   └── settings.tsx       #   Settings 路由
│
├── lib/                   # 唯一允许 import @tauri-apps/api 的层
│   ├── tauri.ts           #   invoke() 包装 + Service Tag + Live Layer
│   ├── types.ts           #   Rust 域类型 TS 镜像（Settings + Snapshot + Message）
│   └── units.ts           #   格式化助手（compactNumber / formatWithCommas）
│
├── agent/                 # Effect-TS 逻辑层 + UI 组件（详见 src/agent/AGENTS.md）
│   ├── runtime.ts         #   pi-mono agent loop 的 Effect Stream 包装
│   ├── store/             #   Effect → Solid signal 桥接层
│   ├── tools/             #   LLM 可调用工具定义（billing: get_balance, get_plan_quota）
│   ├── settings/          #   设置子层（system_prompt, llm_providers）
│   └── components/        #   Solid UI 组件（PascalCase）
│       ├── ChatView.tsx
│       ├── Sidebar.tsx
│       ├── MessageBubble.tsx
│       ├── ProviderCard.tsx
│       └── ToolCallCard.tsx
│
└── __mocks__/
    └── @tauri-apps/api/
        └── core.ts        # vitest mock: invoke() with mockState config
```

## 硬性规则

- **文件命名 kebab-case，导出组件 PascalCase。** `message-bubble.tsx` 导出 `MessageBubble`。单词文件保持小写（`index.tsx` 不写 `Index.tsx`）。
- **`lib/tauri.ts` 是唯一允许 `import { invoke } from "@tauri-apps/api"` 的地方。** 所有 IPC 走里面的 `invoke<T>()` 包装 + Service Tag。`invoke()` 写在别处 = 契约漂移。
- **UI 层不导入 `effect`。** `src/agent/components/*.tsx` 是 Solid 信号的纯消费者，订阅 `src/agent/store/*.ts` 暴露的 `Accessor<T>`。逻辑层（`runtime.ts` / `store/*.ts` / `tools/*.ts`）用 Effect-TS。详见 ADR-0003。
- **不要直接读 `tauri-plugin-store`。** 总是 `await getSettings()`（走 `SettingsService`），让 store mirror 到 Solid signal。组件订阅信号。
- **`createSignal` 不许出现在 store 外。** 跨组件状态走 `src/agent/store/*.ts`；组件内部局部信号可以。
- **API key 不反射回 DOM。** 密码字段永不显示已存值；`setApiKey` 提交后立刻清空输入框。
- **`as any` 禁止。** `tsconfig` 开了 `strict + noUnusedLocals + noUnusedParameters + noFallthroughCasesInSwitch`；逃逸这些 = 编译错误，**去修类型**。
- **测视用 vitest + jsdom。** `import.meta.vitest` 风格的 in-source test 暂不用，测试都走 `*.test.ts(x)` 旁挂。

## Styling（Tailwind v4）

**视觉层只有 Tailwind v4 utility class（ADR-0006）。**

- **BEM class 禁用。** 全部删除，不保留作语义钩子。组件测试断言从 `toHaveClass("chat-view__main")` 改成 `toHaveClass("flex-1")`，跟 Tailwind 公共 API 对齐。
- **Tailwind v4 utility 是唯一视觉层。** 组件 JSX 只写 utility class，不用 BEM、不写内联 `<style>` 块、不引入 CSS-in-JS。
- **不要写内联 `<style>{...}</style>` 块。** 入口 CSS 是 `src/index.css`，`@theme` 块声明 token（`primary-500`、`zinc-900` 等），组件引用 token 而不是 raw hex。
- **主题切换走 `src/agent/store/theme.ts`。** `<html class="dark">` 触发三态（light / dark / system）；`system` 模式用 Solid effect 监听 `prefers-color-scheme`。
- **自定义 dark variant：** `@custom-variant dark (&:is(.dark *))` 在 `index.css` 里配置。

```
# 正确
<div class="flex h-screen bg-zinc-50 dark:bg-zinc-900">

# 错误
<div class="chat-view__main">                    ← BEM 禁用
<div style={{ color: '#8b5cf6' }}>              ← 内联 style 禁用
<style>.chat-view__main { ... }</style>         ← <style> 块禁用
```

## 模式

- **TanStack Router 处理路由。** 路由文件在 `src/routes/`, `index.tsx` mount `<RouterProvider>`, `__root.tsx` 提供根布局, 跳设置用 `<A href="/settings">`。`ChatView` 不再监听 hash。
- **main 窗口 = 唯一 webview。** Tauri 配置单 `main` 窗口 (800×600, 起步), 不用 hash 路由, 用 browser history (`createBrowserHistory`)。
- **Effect → Solid 桥接。** 逻辑层返回 `Effect.Effect<T, AppError>` / `Stream.Stream<T, E>`，桥接层在 store 里 `Effect.runPromiseExit()` 后写入 `createSignal`，UI 读 `Accessor`。
- **服务对象通过 `Context.Tag` 注入。** `ConversationService` / `MessageService` / `BillingService` / `SettingsService` 在 `lib/tauri.ts` 定义 Tag + Live Layer；测试用 `Layer.succeed` 提供 mock。
- **错误上抛是 `AppError` 判别联合。** UI 不 catch Effect-typed error；桥接层用 `Exit.isSuccess` 过滤，失败的 Effect 转成空数据 / 错误 toast。
- **测试分两层。** Effect 服务测用 `it.effect()` + mock `Layer`；Solid store 测用 `@solidjs/testing-library` 跑 jsdom。两者分开不混。

## 查阅指南

| 任务 | 文件 |
|---|---|
| 新增 Tauri 命令包装 | `lib/tauri.ts`（加 invoke 包装 + Service method + Live Layer）；类型在 `lib/types.ts` |
| 新增域类型 | `lib/types.ts`（镜像 Rust `src-tauri/src/types.rs`） |
| 新增设置项 | `src-tauri/src/settings.rs::Settings` + `sanitized()` + `Default`（**先改后端**），然后同步 `lib/types.ts` |
| 新增 Solid 组件 | `agent/components/<Name>.tsx`（PascalCase）+ 同名 `<Name>.test.tsx` |
| 新增 Effect 桥接 | `agent/store/<domain>.ts`（Accessor 暴露 + Effect.gen 包 IPC） |
| 新增 LLM 工具 | `agent/tools/<name>.ts`（Type.Object schema + execute handler） + 同步 `runtime.ts` 的 `billingTools` 数组 |
| 反应式异常 | 先查 `agent/store/*.ts` 监听器注册，再查组件 |
| 改样式 | 改 `@theme` token（`src/index.css`）；组件只写 utility class |
| 改主题行为 | 改 `src/agent/store/theme.ts`（Solid effect 监听 `prefers-color-scheme`） |

## 反模式（明确禁止）

- 在 `lib/tauri.ts` 之外 `import { invoke }` 或调 `invoke(...)`。
- `import { Effect, Stream, ... }` 出现在 `src/agent/components/` 或 `src/agent/settings/<ui>.tsx`。
- 用 `as any` 绕过 `noUnusedLocals` / `strictNullChecks`——去修类型。
- 组件代码里 `import 'node:*'`——那属于 `scripts/` 或 dev tooling。
- 写 BEM class（`.chat-view__main`、`.bubble__content` 等）—— ADR-0006。
- 写内联 `<style>{...}</style>` 块—— ADR-0006。
- 加 React 的 `useState` / `useEffect`——这是 Solid，等价物是 `createSignal` / `createEffect` / `createMemo` / store。
- `window.tauri` / `window.__TAURI__` 全局访问——总走 `lib/tauri.ts` 包装。

## 测试

```bash
pnpm test                  # vitest --run（jsdom）
pnpm test:watch            # 监听模式
```

- Effect 服务测试：`*_test.ts` 用 `it.effect()` + `Layer.succeed(Service, mock)`。
- Solid 组件测试：`<Name>.test.tsx` 用 `@solidjs/testing-library` 的 `render` + `screen`。
- IPC mock 走 `__mocks__/@tauri-apps/api/core.ts` + `src/shared-mock-state.ts`。
