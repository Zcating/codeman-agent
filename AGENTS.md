# codeman-agent — 项目知识库

> **AI Agent 协作入口**。读 `CONTEXT.md` 拿词汇表，读 ADR 拿决策，读子目录 `AGENTS.md` 拿硬性规则。

**生成时间:** 2026-06-14
**Commit:** (TBD)
**分支:** `master`

## 项目一句话

Windows 桌面 AI Agent，原生单窗口应用；主窗口是 LLM 对话 (`/`)，设置走 `/settings` 路由（TanStack Router），**V1 内置 2 个 billing 工具**（DeepSeek 余额、MiniMax 套餐余量）。

## 核心栈

| 层           | 选型                                             | 版本                                           |
| ------------ | ------------------------------------------------ | ---------------------------------------------- |
| 桌面壳       | Tauri 2 (Rust)                                   | `2.x`                                          |
| UI           | Solid.js + TypeScript                            | `solid-js ^1.9.3` / `tsc ~5.6.2`               |
| 构建         | Vite + vite-plugin-solid                         | `^6.0.3`                                       |
| 样式         | Tailwind v4 + cva + cn (clsx+twMerge)            | `^4.3.0` / `cva 0.7.1` / `lucide-solid 1.18.0` |
| 逻辑层 (TS)  | **Effect-TS** + `@effect/platform-browser`       | `effect ^3.0.0`                                |
| Agent 运行时 | **pi-mono** (`@mariozechner/pi-ai` + `pi-agent`) | `latest`                                       |
| 持久化       | SQLite + sqlx 0.8 + **FTS5** 全文搜索            | `sqlx 0.8`                                     |
| 密钥         | Windows Credential Manager via `keyring` crate   | `keyring 3`                                    |
| 路由         | **TanStack Router (code-based)**                 | `^1.170.15`                                    |
| 包管理       | pnpm                                             | `11.5.3`                                       |

**包管理器强制用 pnpm**（`pnpm-lock.yaml` 存在）。不要混用 npm / yarn。

## 目录布局 (Feature-Sliced V1.5 — 5+1 子目录白名单，2026-06-15)

完整决策见 [ADR-0010](./docs/adr/0010-frontend-5-1-folder-whitelist.md)。

```
codeman-agent/
├── src/
│   ├── index.tsx                  # Solid 入口（挂 <RouterProvider>，~6 行）
│   ├── index.css                  # Tailwind v4 入口（@import + @theme + @layer base）
│   ├── router.tsx                 # TanStack Router code-based 配置
│   ├── test-setup.ts              # vitest setup（mockState 唯一源 = __mocks__/）
│   ├── AGENTS.md                  # src/ 规则
│   │
│   ├── shared/                    # 跨 feature 共享（5+1 白名单）
│   │   ├── AGENTS.md
│   │   ├── lib/                   # 纯函数 + 跨域类型：cn.ts / tauri.ts / units.ts / types.ts
│   │   ├── stores/                # 跨域 Solid signal：theme.ts
│   │   ├── hooks/                 # 跨域 composable（V1 预留位，use- 前缀）
│   │   ├── components/ui/         # 跨域设计系统原子：Button / Input / Textarea / Checkbox / Card
│   │   │   └── AGENTS.md
│   │   └── components/internal/   # 跨域业务组件（V1 预留位：ErrorBoundary / Provider wrappers / Layout atoms）
│   │
│   └── features/                  # 5 子目录白名单（按需创建）
│       ├── chat/                  # 聊天域 — lib + stores + components + routes
│       │   ├── AGENTS.md
│       │   ├── index.ts           # public API barrel
│       │   ├── components/        # chat-view / sidebar / message-bubble / tool-call-card
│       │   ├── routes/            # / 路由
│       │   ├── stores/            # conversations + messages（Effect→Solid 桥接层）
│       │   └── lib/               # runtime.ts（从 chat 根级迁入）
│       ├── settings/              # 设置域 — lib + components + routes
│       │   ├── AGENTS.md
│       │   ├── index.ts
│       │   ├── components/        # provider-card
│       │   ├── routes/            # /settings 路由
│       │   └── lib/               # llm-providers + system-prompt（从 subsystems/ 迁入；snake_case 已修）
│       └── billing/               # 工具域 — 仅 lib（无 UI）
│           ├── AGENTS.md
│           ├── index.ts
│           └── lib/               # billing.ts（从 tools/ 迁入）
│
├── src-tauri/                     # Rust 后端（详见 src-tauri/AGENTS.md）
├── docs/adr/                      # 10 个 ADR（0001-0010，见下方索引）
├── __mocks__/                     # 仓库根的 vitest auto-mock（@tauri-apps/api/core.ts）= mockState 唯一源
├── docs/                          # 治理文档（translation-rules 等）
└── .agents/                       # 本地 agent skills
```

**白名单规则速查**：

- 每个 feature 允许的子目录：`stores` / `components` / `routes` / `hooks` / `lib`（按需创建）
- shared 允许的子目录：`stores` / `components/ui` / `components/internal` / `hooks` / `lib`
- feature 根级只允许 2 个文件：`index.ts`（barrel）+ `AGENTS.md`（规则）
- 文件命名 kebab-case（**项目内唯一例外 `llm_providers` → `llm-providers` 已在 ADR-0010 修复**）
- hooks 文件以 `use-` 前缀（`use-theme.ts` / `use-debounce.ts`）

## ADR 索引

| 编号     | 标题                                                                       | 决策要点                                                                                                                                                                                                                                                                                                                              |
| -------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0001     | Tauri 2 + Solid.js                                                         | 选定 Tauri 2 + Solid；Windows-only；MSI/NSIS 打包                                                                                                                                                                                                                                                                                     |
| 0002     | pi-mono agent 运行时                                                       | LLM 循环用 `@mariozechner/pi-agent`（V8 之前的旧包名 `@mariozechner/pi-mono` 已被替换）                                                                                                                                                                                                                                               |
| 0003     | Effect-TS 逻辑层                                                           | 逻辑层用 Effect-TS；**UI 层不导入 `effect`**；测试用 `@effect/vitest`                                                                                                                                                                                                                                                                 |
| 0004     | SQLite FTS5 持久化                                                         | 对话 / 消息存 SQLite；全文搜索走 FTS5 虚表                                                                                                                                                                                                                                                                                            |
| 0005     | ~~托盘形态 + 无热键~~ (Superseded by ADR-0007)                             | V1 取消全局热键；托盘是用户唯一常驻入口                                                                                                                                                                                                                                                                                               |
| 0006     | Tailwind v4 utility-only 样式层                                            | 所有视觉走 Tailwind v4 utility；BEM/`<style>` 块禁用；token 在 `@theme`                                                                                                                                                                                                                                                               |
| 0007     | 完整原生窗口应用 + TanStack Router                                         | 单 main 窗口；删托盘/独立 settings 窗口；in-app 路由用 TanStack Router（code-based）                                                                                                                                                                                                                                                  |
| 0008     | Feature-Sliced 前端分层 + shadcn 风格 UI 原子 (Superseded in part by 0010) | src/ 改成 features/{chat,settings,billing}/ + shared/{ui,lib,types,state,assets}/；引入 cva + clsx + tailwind-merge + lucide-solid 5 原子；排除 Radix/Kobalte                                                                                                                                                                         |
| **0009** | **开发者语言中文化策略（V1.6+）**                                          | **本期新加**：注释 + 治理文档 + 测试描述走中文；identifier / UI 字符串 / 库专名保持英文；5 路并行翻译 + `docs/translation-rules.md` 操作手册 + `CONTRIBUTING.md` glossary 增补门槛；`CONTEXT.md` 新增 § Localization                                                                                                                  |
| **0010** | **前端 5+1 子目录白名单 + 跨域类型/lib 收口 + mockState 单一源**           | **本期新加**：feature 5 子目录（stores/components/routes/hooks/lib）+ shared 5+1（stores/components/ui/components/internal/hooks/lib）；feature 根级只允许 index.ts + AGENTS.md；store→stores、state→stores、subsystems/tools→lib、types→lib/types.ts、ui→components/ui、mocks→**mocks** 唯一源；llm_providers→llm-providers 命名修复 |

> **新决策**先写 ADR 再动代码。`docs/adr/` 用 `NNNN-kebab-title.md` 命名；格式见 `.agents/skills/grill-with-docs/ADR-FORMAT.md`。

## 关键概念

- **Agent (代理)** = 产品本身 = 独立 Windows 桌面应用。
- **Conversation (会话)** = 用户拥有的持久聊天线程（线性，无分支）。
- **Message (消息)** = 一轮 `user` / `assistant` / `tool` / `system`。
- **Tool (工具)** = LLM 可调用的类型化函数（V1: `get_balance`, `get_plan_quota`）。
- **Snapshot (快照)** = 计费状态的时点视图：`Balance { amount, currency, auto_recharge }` | `PlanQuota { remaining, total, expires_at?, daily_avg? }`。
- **Feature (功能)** = 业务域（chat / settings / billing）。每个 feature 自带 components + store + subsystems + routes。
- **Shared (共享)** = 跨 feature 共享（ui 原子 / IPC 入口 / 跨域类型 / 跨域状态 / 静态资源）。
- **Runtime (运行时)** = Effect-TS 包装 pi-mono agent loop（`src/features/chat/runtime.ts`）。
- **Bridge (桥接层)** = Effect → Solid signal 翻译器（`src/features/chat/store/*.ts`）。
- **cn** = `clsx + tailwind-merge` 组合工具（`src/shared/lib/cn.ts`）。
- **Secret** = Rust 的 `Secret<String>` newtype；Debug/Display 都打印 `***`。
- **Stale (过期)** = Snapshot 超过 `stale_after_seconds`。

完整词汇表 + Settings 19 字段 schema → **`CONTEXT.md`**。

## Domain shape

```
Agent
  ├── runtime          (Effect-TS layer wrapping pi-mono, src/features/chat/runtime.ts)
  ├── bridge           (Effect → Solid signal translator, src/features/chat/store/)
  └── tools[]          (LLM 可调函数，src/features/billing/tools/billing.ts)
        ├── get_balance(provider_id)        → Snapshot
        └── get_plan_quota(provider_id)     → Snapshot

Conversation          (src/shared/types/index.ts)
  ├── id, title, system_prompt?, created_at, updated_at, archived_at?
  └── messages[]       (linear)
        ├── id, role, content
        ├── tool_calls[] / tool_results[]
        ├── model, input_tokens, output_tokens
        └── created_at

LLM Provider             Billing Provider
  (Settings.llm_providers) (Settings.billing_providers)
  ├── id                  ├── id
  ├── label               ├── label
  ├── enabled             ├── enabled
  ├── default_model       ├── refresh_interval_secs
  ├── base_url?           └── api_key_ref (keyring)
  └── api_key_ref (Tauri store)
```

## 查阅指南

| 我要…                  | 看哪里                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 理解领域模型 / 词汇表  | `CONTEXT.md`                                                                                                         |
| 知道为什么用 X 不用 Y  | `docs/adr/000N-*.md`                                                                                                 |
| 新增 / 修改 Tauri 命令 | `src-tauri/src/commands.rs` + `src-tauri/src/lib.rs` invoke_handler + `src/shared/lib/tauri.ts` TS 镜像              |
| 新增 / 修改设置项      | `src-tauri/src/settings.rs::Settings` + `sanitized()` + `Default`；TS 镜像在 `src/shared/types/index.ts`             |
| 看 IPC 桥接            | `src/shared/lib/tauri.ts`（Service Tag + Live Layer） + `src/features/{chat,settings,billing}/store` 或 `subsystems` |
| 看 Agent 循环          | `src/features/chat/runtime.ts`（Effect Stream 包装 pi-agent）                                                        |
| 看前端组件             | `src/features/{chat,settings,billing}/components/*.tsx` + `src/shared/ui/*.tsx`（5 原子）                            |
| 看厂商适配器           | `src-tauri/src/providers/<id>.rs`（详见子目录 AGENTS.md）                                                            |
| 看持久化 / 搜索        | `src-tauri/src/db/`（详见子目录 AGENTS.md）                                                                          |
| 写测试                 | vitest + @effect/vitest + jsdom；component 用 @solidjs/testing-library                                               |
| 写 ui 原子             | 模仿 `src/shared/ui/button.tsx` + `src/shared/ui/AGENTS.md`                                                          |

## 反模式（项目级，禁止）

- 从 `src-tauri` 之外读 Tauri store 或 keyring
- 在 `src/features/{chat,settings,billing}/components/` 之外写 UI 组件
- UI 组件 `import { Effect, ... }` — 只能在 `store/` / `runtime.ts` / `subsystems/`
- 写 BEM class / 内联 `<style>{...}</style>` 块 — ADR-0006
- `import { invoke } from "@tauri-apps/api"` 在 `src/shared/lib/tauri.ts` 之外
- `createSignal` 跨组件状态 — 必须走 store
- `as any` 绕过 `noUnusedLocals` — 修类型
- React 的 `useState` / `useEffect` — 用 Solid `createSignal` / `createEffect`
- 第二个轮询循环 — `runtime.ts` 是唯一 agent 循环入口
- 直接 return `reqwest::Error`（Rust 端） — 用 `ProviderError::Upstream(format!("{status}: {body}"))`
- 在 main 窗口之外的 webview 调 `invoke(...)` — 单 webview 约束（ADR-0007）
- 引入 Radix UI / Kobalte — V1 排除（ADR-0008），等真出现 Dialog 需求再开新 ADR

## 命令

```bash
pnpm install
pnpm tauri:dev         # 自动调 scripts/kill-port.mjs 1420 1421
pnpm build             # 前端产物到 dist/
pnpm tauri build       # 出 MSI + NSIS 安装包
pnpm test              # 前端 vitest (jsdom)
cd src-tauri && cargo test  # 后端（带 wiremock 集成测试）
pnpm typecheck         # tsc --noEmit
pnpm typecheck:e2e     # tsc --noEmit -p tsconfig.e2e.json
pnpm e2e               # Playwright + 真 Tauri 端到端 (本地)
```

## E2E 测试

V1 起引入 E2E 层，跑在 **真 webview + 真 Rust 后端** 上，不 mock IPC。WebView2 通过 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` 暴露 CDP，Playwright 用 `connectOverCDP` 连接，跳过 tauri-driver 的 W3C 协议翻译。

### 目录布局

```
codeman-agent/
├── playwright.config.ts           # baseURL=1420, workers=1, retain-on-failure trace
├── tsconfig.e2e.json              # extends tsconfig.json + types:["node"]
├── e2e/
│   ├── global-setup.ts            # spawn pnpm tauri:dev + wait 1420/9222
│   ├── global-teardown.ts         # kill child + sweep ports + taskkill tauri.exe
│   ├── helpers.ts                 # getTauriPage() / invoke() / clearAllHistory()
│   ├── 01-app-launch.spec.ts      # canary: 启动 + chat 布局 + 无 console error
│   ├── 02-settings-api-key.spec.ts # UI 配 key + IPC 验证 has_llm_key
│   ├── 03-billing-tool.spec.ts    # 发消息 + chat loop 活着 (不验证 LLM 内容)
│   ├── 04-theme-toggle.spec.ts    # update_settings.theme → <html.dark>
│   └── .gitignore                 # playwright-report/ test-results/
```

### 跑通前置 (一次性)

```bash
cargo install tauri-driver --locked   # 二进制，与 src-tauri 共用 Rust 工具链
npx playwright install msedge          # Edge WebDriver (Tauri WebView2 内核)
# WebView2 Runtime: Win11 自带，Win10 需 https://developer.microsoft.com/microsoft-edge/webview2/
pnpm add -D @playwright/test @types/node  # 项目 devDeps
```

> **Rust 预热已自动集成**: `e2e/global-setup.ts` 启动 `tauri:dev` 之前会先 `cd src-tauri && cargo build`（默认带 `RUSTFLAGS=-A dead_code` 静默 pre-existing warnings），把 5+ min 的首次编译从测试阶段挪到 setup 阶段。缓存命中 <1s，完全无感。

### 跑测试

```bash
pnpm e2e               # 全跑 (~30-60s 测试阶段；首次含 5+ min 编译，在 setup 阶段)
pnpm e2e:headed        # 有头模式看 UI
pnpm e2e:debug         # Playwright Inspector
pnpm e2e:report        # 看上一次 HTML 报告
```

### 当前覆盖的关键路径 (4 spec)

| #   | 场景                   | 断言                                                                    |
| --- | ---------------------- | ----------------------------------------------------------------------- |
| 01  | 启动 + chat 布局       | `<aside>` / `<textarea>` / Settings link 全可见，0 console error        |
| 02  | 配 LLM API key         | UI Save → IPC `has_llm_key` 返回 true → 重载 input 不反射已存值         |
| 03  | 聊天调 billing 工具    | user bubble 写入 + assistant 开始 streaming OR Cancel 出现 (LLM 可失败) |
| 04  | 主题 light/dark/system | `update_settings.theme` → `<html class>` 在 5s poll 内切换              |

### 反模式 (E2E 特有)

- **不要在 E2E spec 里 mock IPC** — 这一层的价值是真后端，真数据库，真 keyring。Vitest + `__mocks__` 是单元测试的领域。
- **不要并行跑** — Tauri 是单实例，多 worker 会撞同一个 window/Rust state。`workers: 1` 是硬约束。
- **不要用真实 LLM key 跑 E2E** — 慢、不确定、贵。spec 03 只验 chat loop 活着，不验响应内容。
- **不要断言 console.warn** — `console.error` 才算 canary 失败；warning 太嘈杂。
- **不要在 E2E 写 BEM class** — ADR-0006；断言走 utility class（跟 vitest 一致）。
- **不要在 E2E 测 Tailwind 样式细节** — 验 `classList.contains("dark")` 这种语义状态，不验 computed style。
- **不要在 E2E 用 vitest 的 `vi.mock`** — Playwright 走自己的 fixture 体系（`getTauriPage` / `invoke`）。
- **不要直接 `taskkill /IM tauri.exe` 在 spec 里** — 那是 `global-teardown` 的职责，失败时一票否决。

### 何时新增 E2E spec

- 引入新的 IPC 命令 → 加一个"调用 + 断言" 的 spec（跟 02 一样）
- 改路由 → 加一个"导航 + URL 匹配" 的 spec（跟 01 一样）
- 改主题/外观语义 → 加到 04 或新开 "ui-state" describe
- 加新 Tauri 插件 → 单独 spec，不要塞进现有 4 个

### CI 留待后续

用户已确认 V1 E2E **不进 CI**。后续接入时要装：WebView2 Runtime + `tauri-driver` + `@playwright/test` + Edge WebDriver；跑在 Windows runner；`tauri build` 产物比 `tauri dev` 稳定但慢 2x，看情况选。

## 子目录知识库表

| 路径                                  | 状态                   | 重点                                        |
| ------------------------------------- | ---------------------- | ------------------------------------------- |
| `./src/AGENTS.md`                     | 重写 → 移到 **本文件** | 顶层入口（本文件）                          |
| `./src/shared/AGENTS.md`              | **新建**（本期）       | shared/ 规则 + 跨 feature 共享规范          |
| `./src/shared/ui/AGENTS.md`           | **新建**（本期）       | 5 ui 原子契约 + 变体表 + 轻量测试约定       |
| `./src/features/chat/AGENTS.md`       | **新建**（本期）       | chat 域规则                                 |
| `./src/features/settings/AGENTS.md`   | **新建**（本期）       | settings 域规则                             |
| `./src/features/billing/AGENTS.md`    | **新建**（本期）       | billing 域规则                              |
| `./src-tauri/AGENTS.md`               | 重写                   | Rust 硬规则、AppState、调度器、能力清单     |
| `./src-tauri/src/db/AGENTS.md`        | 新建                   | SQLite schema、迁移、FTS5 搜索实现          |
| `./src-tauri/src/providers/AGENTS.md` | 更新                   | Provider trait 契约、新增厂商流程、测试模式 |
