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


## 目录布局

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

## Domain shape

``` txt
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
