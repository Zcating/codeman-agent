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
| 包管理       | vite-plus                                        | `0.1.24`                                       |

## 目录布局

```txt
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
