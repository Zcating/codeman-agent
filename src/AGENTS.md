# src/ — 前端 (Solid.js + TypeScript)

Vite 单页应用，渲染到单个 Electron BrowserWindow。路由走 TanStack Router（`/` = chat，`/settings` = 设置）。不需要 hash 监听。

视觉层走 Tailwind v4 utility（ADR-0006），逻辑层走 Effect-TS（ADR-0003）。

> **本文件覆盖整个 src/ 根级入口**。更细的 feature 规则见 `src/features/*/AGENTS.md`，shared 规则见 `src/shared/AGENTS.md`。本轮的 5+1 子目录白名单决策见 [ADR-0010](../docs/adr/0010-frontend-5-1-folder-whitelist.md)。

## src/ 根级文件

| 文件            | 角色                                                                               | 备注                                                                |
| --------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `index.tsx`     | Solid 渲染入口（挂载 `<RouterProvider>`）                                          | 首行 `import "./index.css"`                                         |
| `index.css`     | Tailwind v4 入口（`@import` + `@theme` + `@layer base`）                           | token 集中地                                                        |
| `router.tsx`    | TanStack Router code-based 配置                                                    | 不用 `@tanstack/router-plugin`（ADR-0007）                          |
| `vitest.setup.ts` | vitest setup（`import "./__mocks__/ipc-mock"` + `scrollIntoView` polyfill） | mockState 唯一源在 src/__mocks__/ipc-mock.ts |
| `vite-env.d.ts` | Vite 类型                                                                          | 不可删                                                              |

## src/ 子目录（5+1 白名单）

**`shared/`**：跨 feature 共享。允许子目录（白名单，按需创建）：

- `lib/` — 纯函数 + 跨域类型
- `stores/` — 跨域 Solid signal
- `hooks/` — 跨域 composable（`use-` 前缀，V1 预留位）
- `components/ui/` — 跨域设计系统原子
- `components/internal/` — 跨域业务组件——codeman-* prefix（[ADR-0023](../docs/adr/0023-codeman-prefix-and-ark-ui-select.md) D4-N）；当前已落地 `codeman-sidebar`（首例，[ADR-0022](../docs/adr/0022-internal-components-and-design-tokens.md)）+ `codeman-dialog`（命令式 alert/confirm/show，[ADR-0023 D8-W6](../docs/adr/0023-codeman-prefix-and-ark-ui-select.md)）

**`features/`**：业务域。允许子目录（白名单，按需创建）：

- `stores/` — Solid signal / store / Accessor 桥接层
- `components/` — UI 组件
- `routes/` — 路由组件
- `hooks/` — Solid composable（`use-` 前缀，V1 预留位）
- `lib/` — 纯函数 / Effect-TS service / Effect runtime / 类型 / schema

**Feature 根级只允许 2 个文件**：`index.ts`（barrel）+ `AGENTS.md`（规则）。其它文件（runtime、service、tool schema、bridge）必须落在 5 个子目录之一。

## 硬性规则

- **文件命名 kebab-case，导出组件 PascalCase。** `message-bubble.tsx` 导出 `MessageBubble`。单词文件保持小写（`index.tsx` 不写 `Index.tsx`）。**唯一例外已修复**：`llm_providers.ts` → `llm-providers.ts`（ADR-0010）。
- **`shared/lib/ipc.ts` 是唯一 Electron IPC 入口。** 所有 IPC 走 `window.codeman.invoke()`（由 preload 通过 contextBridge 暴露）。不应直接 `import { invoke } from "@tauri-apps/api"`（该依赖已移除）。
- **UI 层不导入 `effect`。** `src/features/*/components/*.tsx` 是 Solid 信号的纯消费者，订阅 `src/features/*/stores/*.ts` 暴露的 `Accessor<T>`。逻辑层（`lib/*.ts` / `stores/*.ts`）用 Effect-TS。
- **总是通过 appStore / chatStore 读跨域状态，不走原始 IPC。** 组件订阅 Solid signal，不直接调 `window.codeman.invoke`。
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
- **main 窗口 = 唯一 BrowserWindow。** Electron 窗口配置在 `electron/main/index.ts`，800×600 起步。不用 hash 路由，用 browser history（`createBrowserHistory`）。
- **Effect → Solid 桥接。** 逻辑层返回 `Effect.Effect<T, AppError>` / `Stream.Stream<T, E>`，桥接层在 stores 里 `Effect.runPromiseExit()` 后写入 `createSignal`，UI 读 `Accessor`。
- **服务对象通过 `Context.Tag` 注入。** `ConversationService` / `MessageService` / `BillingService` / `SettingsService` 在 `shared/lib/ipc.ts` 定义 Tag + Live Layer；测试用 `Layer.succeed` 提供 mock。
- **错误上抛是 `AppError` 判别联合。** UI 不 catch Effect-typed error；桥接层用 `Exit.isSuccess` 过滤，失败的 Effect 转成空数据 / 错误 toast。
- **测试分两层。** Effect 服务测用 `it.effect()` + mock `Layer`；Solid store 测用 `@solidjs/testing-library` 跑 jsdom。两者分开不混。
- **mockState 唯一源**在 `src/__mocks__/ipc-mock.ts`。`vitest.setup.ts` 静态 import 该文件以初始化 `window.codeman` mock。
- 优先使用 es-toolkit, ts-parttern, effect-ts 等工具，优先使用已存在的组件、工具函数等，目录在 `src/shared`

## 查阅指南

| 任务                              | 文件                                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 新增 IPC channel                   | `electron/main/ipc.ts`（加 `ipcMain.handle`）+ `electron/preload/index.ts`（暴露到 `window.codeman`）；前端类型在 `src/shared/lib/types.ts` |
| 新增跨域类型                      | `shared/lib/types.ts`（Electron 侧类型在 `electron/types.ts`）                                                                     |
| 新增设置项                        | 改 `electron/main/settings-schema.ts`（schema 定义），然后同步 `src/shared/lib/types.ts` 的 TS 镜像
| 新增 sidebar 组件                 | 改 `shared/components/ui/sidebar.tsx`（primitive） + `shared/components/internal/codeman-sidebar.tsx`（业务组合），遵循 [ADR-0022](../docs/adr/0022-internal-components-and-design-tokens.md) + [ADR-0023](../docs/adr/0023-codeman-prefix-and-ark-ui-select.md)（codeman-* namespace） |
| 改 Home 布局 / Codex form         | 改 `src/features/chat/routes/index.tsx`（状态机）+ `src/features/chat/components/home.tsx`（Codex form）                            |
| 改 `Conversation.workspace_id`    | 改 `electron/main/db/conversations.ts` + `src/shared/lib/types.ts`（TS 镜像）+ SQLite migration 在 `electron/main/db/migrations/` |
| 改 `last_used_workspace_id`       | 改 `WorkspaceService`（`src/features/chat/lib/workspace-service.ts`）+ `src/features/chat/stores/chat.store.ts`（chatStore reactive 状态）。**不再**是 Settings 字段，**不再**走 `appStore`（ADR-0023 D8-W）。|
| 新增 Workspace CRUD               | `electron/main/db/workspaces.ts`（Electron SQLite）+ `electron/main/ipc.ts`（IPC handler）+ `src/features/chat/lib/workspace-service.ts`（Effect Context.Tag + Live Layer）+ `src/features/chat/stores/chat.store.ts`（reactive bridge）。遵循 [ADR-0023 D8-W](../../docs/adr/0023-codeman-prefix-and-ark-ui-select.md)。|
| 新增 Dialog 原子                  | `shared/components/ui/dialog.tsx`（@ark-ui/solid Dialog 包装，shadcn/ui 风格）+ `shared/components/internal/codeman-dialog.tsx`（命令式 alert / confirm / show）。遵循 [ADR-0023 D8-W6](../../docs/adr/0023-codeman-prefix-and-ark-ui-select.md)。|
| 新增跨域设计系统原子              | `shared/components/ui/<Name>.tsx`（PascalCase）+ 同名 `<Name>.test.tsx`；Select primitive 走 @ark-ui/solid 包装（[ADR-0023](../docs/adr/0023-codeman-prefix-and-ark-ui-select.md) D4-S）            |
| 新增跨域业务组件                  | `shared/components/internal/codeman-<Name>.tsx`（**ADR-0022** 首例 `codeman-sidebar`；[ADR-0023](../docs/adr/0023-codeman-prefix-and-ark-ui-select.md) D4-N codeman-* prefix 锁定；新组件须严格 prop-driven）      |
| 新增跨域 Select wrapper          | `shared/components/ui/codeman-select.tsx`（flat options）或 `codeman-group-select.tsx`（groups）；内部用 @ark-ui/solid Select（[ADR-0023](../docs/adr/0023-codeman-prefix-and-ark-ui-select.md) D4-S） |
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
- IPC mock 走 `src/__mocks__/ipc-mock.ts`（全局 `window.codeman` mock）。
