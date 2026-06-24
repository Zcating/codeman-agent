# codeman-agent — 项目知识库

> **AI Agent 协作入口**。读 `CLAUDE.md` 拿工作方式，读 `CONTEXT.md` 拿词汇表，读 ADR 拿决策，读子目录 `AGENTS.md` 拿硬性规则。

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
| 包管理       | vite-plus                                             | `0.1.24`                                       |

**包管理器强制用 vp**（`pnpm-lock.yaml` 存在）。不要混用 npm / yarn。

## 目录布局 (Feature-Sliced V1.5 — 5+1 子目录白名单，2026-06-15)

完整决策见 [ADR-0010](./docs/adr/0010-frontend-5-1-folder-whitelist.md)。

``` txt
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
│       └── file-tools/           # 文件工具域 — lib（无 UI，V2 新增）
│           ├── AGENTS.md
│           ├── index.ts
│           └── lib/               # file-tools.ts + file-tools.test.ts
│
├── src-tauri/                     # Rust 后端（详见 src-tauri/AGENTS.md）
├── docs/adr/                      # 10 个 ADR（0001-0010，见下方索引）
├── (mocks 改在 src/__mocks__/ — 详见 src/AGENTS.md)
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
| **0011** | **V1 chat 域走 anthropic-messages-only 协议**                              | **本期新加**（via grill-with-docs 配测试 provider 触发）：推翻 ADR-0002 的多 provider 假设；`api_type` 字段字面量 = `"anthropic-messages"` 单值；V1 唯一内置 LLM provider = MiniMax（官方 anthropic 兼容端点 `https://api.minimaxi.com/anthropic` + model `MiniMax-M2.5-highspeed`）；`Settings::Default` 预置 |
| **0012** | **Unified Provider schema + Billing moved to TypeScript**                 | **本期新加**（via grill-with-docs 把项目分拆/合并讨论触发）：V1 双数组（`llm_providers[]` + `billing_providers[]`）合并为单 `providers[]`；`llm` 必选 + `billing` 可选；`ModelMeta[]` 用户可编辑；`models_endpoint` per-provider 可配置 + `fetchModels()` 动态拉取；DeepSeek 补 LLM config（`https://api.deepseek.com/anthropic` + `https://api.deepseek.com/models`）；`api_type` 仍锁单值（ADR-0011 不变）；**Billing 端 ~300 行 Rust 死代码全删**（V0 scheduler + adapter + 8 个 V0 IPC），billing 迁 TS webview，key 改存 Tauri store（同 LLM key 档）；CORS 验证通过（DeepSeek `/user/balance` 200 + MiniMax `/anthropic/v1/messages` 200）；CONTEXT.md 词汇表更新（LLM Provider / Billing Provider superseded by Provider.llm / Provider.billing） |
| **0013** | **V2 file IO tools + workspace sandbox**                                    | V2 新增 5 个文件工具（read/write/edit/search/delete），workspace 沙箱隔离，Rust 端强制 path validation，10MB 上限，UTF-8 编码，系统文件（.exe/.dll 等）阻塞；Settings UI 新增 WorkspaceCard；工具在 `src/features/file-tools/lib/file-tools.ts` |
| **0014** | **Per-Conversation Agent 实例（多流并行 + 切换保留状态）**                | `AgentRuntime` 从 `Ref<Agent | null>` 单例改为 `Context.Tag` service 单例（每进程 1 个 service）+ 内部 `Ref<Map<ConversationId, Agent>>` 托管 per-conversation 实例；每个 Conversation 1 个 Agent；service 公开 `run(conv, msg)` / `cancel(convId)` / `destroy(convId)`；多 conv 可并行 streaming，切换 conv 保留 in-flight 流；supersedes `chat/AGENTS.md` 的 "AgentRuntime 单例" 硬规则 |
| **0015** | **Settings 全局 app-store + API Key 模型简化（明文进 Settings JSON）**    | **本期新加**（via grill-with-docs 2026-06-20 触发）：引入 `src/shared/stores/app.store.ts` 全局 reactive 桥接层（`createStore` + debounced 500ms auto-flush + `forceFlush()` skip debounce + `refresh()`）；LLM API Key / Billing API Key 合并为单一 `Provider.api_key` 字段，**明文进 Settings JSON**（安全回归：V1 单机单用户威胁模型下接受；如未来需 OS 级密钥管理需重做本 ADR）；删除 Tauri store key 路径 `llm_providers/<id>/api_key` + `billing/<id>/api_key`、IPC `set_llm_key` / `set_billing_key` / `has_llm_key` / `get_llm_key` / `delete_provider_keys`、`src/features/settings/lib/llm-providers.ts`（`LLMProviderService` + 3 bridge 函数）、`LLMProvider` 类型别名；ProviderCard / WorkspaceCard onChange 走 `appStore.set(...)`（修 ADR-0003 的 UI 直接 invoke 违规）；footer Save 唯一入口调 `appStore.forceFlush()`；per-row API Key Save 按钮删除；Settings UI 单一 Save 心智模型；dot-separated 文件名 `app.store.ts` 是 ADR-0010 后第二例命名例外 |
| **0018** | **统一日志系统（前端 logger.ts + Rust log 强制 + CONTEXT.md Logging 段移除）** | **本期新加**（via grill-with-docs 2026-06-24 触发）：新建 `src/shared/lib/logger.ts`，API 形状 `logger.{debug,info,warn,error}(msg, ...args)` 与 `console.*` 1:1 转发 + `[LEVEL]` 前缀；不引入 consola/pino/logtape；后端保持 `log` + `tauri-plugin-log` 不变；Rust 18 个 IPC handler 全量加 `debug!`/`info!`/`warn!`（含 filesystem 5 命令的 5-10 个错误分支）；前端 RuntimeEvent 5 变体（token 降 debug，其余 info/error）+ `invoke<T>()` 失败 catch 加 `logger.error`；替换 9 处 `console.*` 散点为 `logger.*`；UI 层 `logger.*` 允许所有档（不是 service 操作，不违反 ADR-0016 D4）；**CONTEXT.md § Logging 段完整移除**（log path 是实现细节），redaction 规则从"强制"降级为 developer 自觉（simple API 与自动 redaction 冲突，理由详见 ADR-0018 D6）；log rotation 本期不实现，开 ADR-0019 follow-up |

> **新决策**先写 ADR 再动代码。`docs/adr/` 用 `NNNN-kebab-title.md` 命名；格式见 `.agents/skills/grill-with-docs/ADR-FORMAT.md`。

> ⚠️ AGENTS.md ADR 索引落后：ADR-0016 / 0017 已 accepted 但未列入本索引。补齐是其他 PR 范围，本任务只追加 0018。

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
- 前端新增 `console.log` / `console.warn` / `console.error` / `console.debug` — 全部走 `@/shared/lib/logger`（ADR-0018 D5）
- 后端新增 `eprintln!` / `println!` 打诊断 — 全部走 `log::{info, warn, error}`（ADR-0011 + ADR-0018 D2）

## 命令

```bash
vp run install
vp run test              # 前端 vitest (jsdom)
vp run build             # 前端产物到 dist/
vp run dev
vp run tauri:dev         # 自动调 scripts/kill-port.mjs 1420 1421
vp run tauri:test        # 后端（带 wiremock 集成测试）
vp run tauri:build       # 出 MSI + NSIS 安装包
vp run typecheck         # tsc --noEmit
vp run typecheck:e2e     # tsc --noEmit -p tsconfig.e2e.json
vp run e2e               # Playwright + 真 Tauri 端到端 (本地)
```

## E2E 测试

V1 起引入 E2E 层，跑在 **真 webview + 真 Rust 后端** 上，不 mock IPC。WebView2 通过 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` 暴露 CDP，Playwright 用 `connectOverCDP` 连接，跳过 tauri-driver 的 W3C 协议翻译。

### 目录布局

``` txt
codeman-agent/
├── playwright.config.ts           # baseURL=1420, workers=1, retain-on-failure trace
├── tsconfig.e2e.json              # extends tsconfig.json + types:["node"]
├── e2e/
│   ├── global-setup.ts            # spawn vp run tauri:dev + wait 1420/9222
│   ├── global-teardown.ts         # kill child + sweep ports + taskkill tauri.exe
│   ├── helpers.ts                 # getTauriPage() / invoke() / clearAllHistory()
│   ├── 01-app-launch.spec.ts      # canary: 启动 + chat 布局 + 无 console error
│   ├── 02-settings-api-key.spec.ts # UI 配 key + IPC 验证 has_llm_key
│   ├── 03-billing-tool.spec.ts    # 发消息 + chat loop 活着 (不验证 LLM 内容)
│   ├── 04-theme-toggle.spec.ts    # update_settings.theme → <html.dark>
│   └── .gitignore                 # playwright-report/ test-results/
```

### 跑测试

```bash
vp run e2e               # 全跑 (~30-60s 测试阶段；首次含 5+ min 编译，在 setup 阶段)
vp run e2e:headed        # 有头模式看 UI
vp run e2e:debug         # Playwright Inspector
vp run e2e:report        # 看上一次 HTML 报告
```

### 当前覆盖的关键路径 (4 spec)

| #   | 场景                   | 断言                                                                    |
| --- | ---------------------- | ----------------------------------------------------------------------- |
| 01  | 启动 + chat 布局       | `<aside>` / `<textarea>` / Settings link 全可见，0 console error        |
| 02  | 配 LLM API key         | UI Save → IPC `has_llm_key` 返回 true → 重载 input 不反射已存值         |
| 03  | 聊天调 billing 工具    | user bubble 写入 + assistant 开始 streaming OR Cancel 出现 (LLM 可失败) |
| 04  | 主题 light/dark/system | `update_settings.theme` → `<html class>` 在 5s poll 内切换              |


### 何时新增 E2E spec

- 引入新的 IPC 命令 → 加一个"调用 + 断言" 的 spec（跟 02 一样）
- 改路由 → 加一个"导航 + URL 匹配" 的 spec（跟 01 一样）
- 改主题/外观语义 → 加到 04 或新开 "ui-state" describe
- 加新 Tauri 插件 → 单独 spec，不要塞进现有 4 个


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
