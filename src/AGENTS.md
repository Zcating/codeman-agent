# src/ — 前端 (Solid.js + TypeScript)

Vite 单页应用，渲染到单个 Tauri main 窗口。路由走 TanStack Router（`/` = chat，`/settings` = 设置）。不需要 hash 监听。

V1 是 Tauri 2 + Solid chat agent，**不是 V0 280x100 浮窗**。视觉层走 Tailwind v4 utility（ADR-0006），逻辑层走 Effect-TS（ADR-0003）。

> **本文件覆盖整个 src/ 根级入口**。更细的 feature 规则见 `src/features/*/AGENTS.md`，shared 规则见 `src/shared/AGENTS.md`。本轮的 5+1 子目录白名单决策见 [ADR-0010](../docs/adr/0010-frontend-5-1-folder-whitelist.md)。

## src/ 根级文件

| 文件            | 角色                                                                               | 备注                                                                |
| --------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `index.tsx`     | Solid 渲染入口（挂载 `<RouterProvider>`）                                          | 首行 `import "./index.css"`                                         |
| `index.css`     | Tailwind v4 入口（`@import` + `@theme` + `@layer base`）                           | token 集中地                                                        |
| `router.tsx`    | TanStack Router code-based 配置                                                    | 不用 `@tanstack/router-plugin`（ADR-0007）                          |
| `test-setup.ts` | vitest setup（`vi.mock("@tauri-apps/api/core", ...)` + `scrollIntoView` polyfill） | mockState 唯一源在src/**mocks**/@tauri-apps/api/core.ts（ADR-0010） |
| `vite-env.d.ts` | Vite 类型                                                                          | 不可删                                                              |

## src/ 子目录（5+1 白名单）

**`shared/`**：跨 feature 共享。允许子目录（白名单，按需创建）：

- `lib/` — 纯函数 + 跨域类型
- `stores/` — 跨域 Solid signal
- `hooks/` — 跨域 composable（`use-` 前缀，V1 预留位）
- `components/ui/` — 跨域设计系统原子
- `components/internal/` — 跨域业务组件（V1 预留位）

**`features/`**：业务域。允许子目录（白名单，按需创建）：

- `stores/` — Solid signal / store / Accessor 桥接层
- `components/` — UI 组件
- `routes/` — 路由组件
- `hooks/` — Solid composable（`use-` 前缀，V1 预留位）
- `lib/` — 纯函数 / Effect-TS service / Effect runtime / 类型 / schema

**Feature 根级只允许 2 个文件**：`index.ts`（barrel）+ `AGENTS.md`（规则）。其它文件（runtime、service、tool schema、bridge）必须落在 5 个子目录之一。

## 硬性规则

- **文件命名 kebab-case，导出组件 PascalCase。** `message-bubble.tsx` 导出 `MessageBubble`。单词文件保持小写（`index.tsx` 不写 `Index.tsx`）。**唯一例外已修复**：`llm_providers.ts` → `llm-providers.ts`（ADR-0010）。
- **`shared/lib/tauri.ts` 是唯一允许 `import { invoke } from "@tauri-apps/api"` 的地方。** 所有 IPC 走里面的 `invoke<T>()` 包装 + Service Tag。`invoke()` 写在别处 = 契约漂移。
- **UI 层不导入 `effect`。** `src/features/*/components/*.tsx` 是 Solid 信号的纯消费者，订阅 `src/features/*/stores/*.ts` 暴露的 `Accessor<T>`。逻辑层（`lib/*.ts` / `stores/*.ts`）用 Effect-TS。
- **不要直接读 `tauri-plugin-store`。** 总是 `await getSettings()`（走 `SettingsService`），让 store mirror 到 Solid signal。组件订阅信号。
- **`createSignal` 不许出现在 store 外。** 跨组件状态走 `src/features/<feature>/stores/*.ts`；组件内部局部信号可以。
- **`as any` 禁止。** `tsconfig` 开了 `strict + noUnusedLocals + noUnusedParameters + noFallthroughCasesInSwitch`；逃逸这些 = 编译错误，**去修类型**。
- **测试用 vitest + jsdom。** `import.meta.vitest` 风格的 in-source test 暂不用，测试都走 `*.test.ts(x)` 旁挂。test 文件位于被测文件同目录。
- **优先使用：** es-toolkit, ts-parttern, effect-ts 等工具，优先使用已存在的组件、工具函数等，目录在 `src/shared`

## Styling（Tailwind v4）

**视觉层只有 Tailwind v4 utility class（ADR-0006）。**

- **BEM class 禁用。** 全部删除，不保留作语义钩子。组件测试断言从 `toHaveClass("chat-view__main")` 改成 `toHaveClass("flex-1")`，跟 Tailwind 公共 API 对齐。
- **Tailwind v4 utility 是唯一视觉层。** 组件 JSX 只写 utility class，不用 BEM、不写内联 `<style>` 块、不引入 CSS-in-JS。
- **不要写内联 `<style>{...}</style>` 块。** 入口 CSS 是 `src/index.css`，`@theme` 块声明 token（`primary-500`、`zinc-900` 等），组件引用 token 而不是 raw hex。
- **主题切换走 `src/shared/stores/theme.ts`。** `<html class="dark">` 触发三态（light / dark / system）；`system` 模式用 Solid effect 监听 `prefers-color-scheme`。
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

- **TanStack Router 处理路由。** 路由文件在 `src/features/<feature>/routes/`, `index.tsx` mount `<RouterProvider>`, `__root.tsx` 提供根布局, 跳设置用 `<A href="/settings">`。`ChatView` 不再监听 hash。
- **main 窗口 = 唯一 webview。** Tauri 配置单 `main` 窗口 (800×600, 起步), 不用 hash 路由, 用 browser history (`createBrowserHistory`)。
- **Effect → Solid 桥接。** 逻辑层返回 `Effect.Effect<T, AppError>` / `Stream.Stream<T, E>`，桥接层在 stores 里 `Effect.runPromiseExit()` 后写入 `createSignal`，UI 读 `Accessor`。
- **服务对象通过 `Context.Tag` 注入。** `ConversationService` / `MessageService` / `BillingService` / `SettingsService` 在 `shared/lib/tauri.ts` 定义 Tag + Live Layer；测试用 `Layer.succeed` 提供 mock。
- **错误上抛是 `AppError` 判别联合。** UI 不 catch Effect-typed error；桥接层用 `Exit.isSuccess` 过滤，失败的 Effect 转成空数据 / 错误 toast。
- **测试分两层。** Effect 服务测用 `it.effect()` + mock `Layer`；Solid store 测用 `@solidjs/testing-library` 跑 jsdom。两者分开不混。
- **mockState 唯一源**在src/**mocks**/@tauri-apps/api/core.ts（vitest 约定路径）。`src/shared/shared-mock-state.ts` 已删除（ADR-0010 Q6 修复双源 bug）。
- 优先使用 es-toolkit, ts-parttern, effect-ts 等工具，优先使用已存在的组件、工具函数等，目录在 `src/shared`

## 查阅指南

| 任务                              | 文件                                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 新增 Tauri 命令包装               | `shared/lib/tauri.ts`（加 invoke 包装 + Service method + Live Layer）；类型在 `shared/lib/types.ts`                                |
| 新增跨域类型                      | `shared/lib/types.ts`（镜像 Rust `src-tauri/src/types.rs`）                                                                        |
| 新增设置项                        | `src-tauri/src/settings.rs::Settings` + `sanitized()` + `Default`（**先改后端**），然后同步 `shared/lib/types.ts`                  |
| 新增跨域设计系统原子              | `shared/components/ui/<Name>.tsx`（PascalCase）+ 同名 `<Name>.test.tsx`                                                            |
| 新增跨域业务组件                  | `shared/components/internal/<Name>.tsx`（V1 预留）                                                                                 |
| 新增跨域 Solid signal             | `shared/stores/<name>.ts`（Accessor 暴露）                                                                                         |
| 新增跨域 composable               | `shared/hooks/use-<name>.ts`（V1 预留）                                                                                            |
| 新增 feature 子组件               | `features/<feature>/components/<name>.tsx`（kebab-case + PascalCase 导出）                                                         |
| 新增 Effect 桥接                  | `features/<feature>/stores/<domain>.ts`（Accessor 暴露 + Effect.gen 包 IPC）                                                       |
| 新增 feature-level Effect service | `features/<feature>/lib/<name>.ts`（Context.Tag + Layer.effect）                                                                   |
| 新增 LLM 工具                     | `features/billing/lib/<name>.ts`（Type.Object schema + execute handler）+ 同步 `features/chat/lib/runtime.ts` 的 billingTools 数组 |
| 反应式异常                        | 先查 `features/<feature>/stores/*.ts` 监听器注册，再查组件                                                                         |
| 改样式                            | 改 `@theme` token（`src/index.css`）；组件只写 utility class                                                                       |
| 改主题行为                        | 改 `src/shared/stores/theme.ts`（Solid effect 监听 `prefers-color-scheme`）                                                        |


## 测试

```bash
vp run test                  # vitest --run（jsdom）
vp run test:watch            # 监听模式
```

- Effect 服务测试：`*_test.ts` 用 `it.effect()` + `Layer.succeed(Service, mock)`。
- Solid 组件测试：`<Name>.test.tsx` 用 `@solidjs/testing-library` 的 `render` + `screen`。
- IPC mock 走src/**mocks**/@tauri-apps/api/core.ts，`mockState` 在此唯一源（ADR-0010）。
