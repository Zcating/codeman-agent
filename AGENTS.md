# codeman-agent — 项目知识库

> **AI Agent 协作入口**。读 `CONTEXT.md` 拿词汇表，读 ADR 拿决策，读子目录 `AGENTS.md` 拿硬性规则。

**生成时间:** 2026-06-13
**Commit:** `8fe8db7`
**分支:** `master`

## 项目一句话

Windows 桌面 AI Agent，原生单窗口应用；主窗口是 LLM 对话 (`/`)，设置走 `/settings` 路由（TanStack Router），**V1 内置 2 个 billing 工具**（DeepSeek 余额、MiniMax 套餐余量）。

## 核心栈

| 层 | 选型 | 版本 |
|---|---|---|
| 桌面壳 | Tauri 2 (Rust) | `2.x` |
| UI | Solid.js + TypeScript | `solid-js ^1.9.3` / `tsc ~5.6.2` |
| 构建 | Vite + vite-plugin-solid | `^6.0.3` |
| 逻辑层 (TS) | **Effect-TS** + `@effect/platform-browser` | `effect ^3.0.0` |
| Agent 运行时 | **pi-mono** (`@mariozechner/pi-ai` + `pi-agent`) | `latest` |
| 持久化 | SQLite + sqlx 0.8 + **FTS5** 全文搜索 | `sqlx 0.8` |
| 密钥 | Windows Credential Manager via `keyring` crate | `keyring 3` (windows-native) |
| 包管理 | pnpm | `11.5.3` |

**包管理器强制用 pnpm**（`pnpm-lock.yaml` 存在）。不要混用 npm / yarn。

## 目录布局

```
codeman-agent/
├── CONTEXT.md                 # 词汇表（必读）+ 域模型 + 设置 schema
├── README.md                  # Tauri+Solid 模板说明（不维护）
├── docs/adr/                  # 5 个 ADR（架构决策的权威来源）
│
├── src/                       # 前端（Solid.js + TS）
│   ├── index.tsx              # Solid 渲染入口（挂载 <ChatView>）
│   ├── lib/                   # 唯一允许 import @tauri-apps/api 的层
│   └── agent/                 # Effect-TS 逻辑层 + UI 组件（详见 src/agent/AGENTS.md）
│
├── src-tauri/                 # 后端（Rust + Tauri 2，详见 src-tauri/AGENTS.md）
│   ├── Cargo.toml             # edition 2021, MSRV 1.77
│   ├── tauri.conf.json        # 单 main 窗口 (原生装饰)
│   ├── capabilities/default.json  # 共享 ACL
│   └── src/
│       ├── lib.rs             # crate 根：插件注册、IPC handler 表、setup
│       ├── commands.rs        # 25 个 #[tauri::command]
│       ├── state.rs           # AppState（parking_lot::RwLock + Arc）
│       ├── scheduler.rs       # 唯一异步轮询循环
│       ├── providers/         # 计费厂商适配器（详见子目录 AGENTS.md）
│       └── db/                # SQLite + FTS5（详见子目录 AGENTS.md）
│
├── scripts/                   # 1 个 dev helper: kill-port.mjs
├── __mocks__/@tauri-apps/api/ # vitest 的 Tauri IPC mock
├── public/                    # 静态资源
├── dist/                      # Vite 构建产物（gitignore）
├── docs/adr/                  # 5 个架构决策
├── .agents/                   # 本地 agent skills（grill-with-docs）
├── .opencode/                 # opencode 配置
└── .omo/                      # 工作区：plans, evidence, notepads
```

## ADR 索引（架构决策权威）

| 编号 | 标题 | 决策要点 |
|---|---|---|
| 0001 | Tauri 2 + Solid.js | 选定 Tauri 2 + Solid；Windows-only；MSI/NSIS 打包 |
| 0002 | pi-mono agent 运行时 | LLM 循环用 `@mariozechner/pi-agent`（V8 之前的旧包名 `@mariozechner/pi-mono` 已被替换） |
| 0003 | Effect-TS 逻辑层 | 逻辑层用 Effect-TS；**UI 层不导入 `effect`**；测试用 `@effect/vitest` |
| 0004 | SQLite FTS5 持久化 | 对话 / 消息存 SQLite；全文搜索走 FTS5 虚表 |
| 0005 | ~~托盘形态 + 无热键~~ (Superseded by ADR-0007) | V1 取消全局热键；托盘是用户唯一常驻入口 |
| 0006 | Tailwind v4 utility-only 样式层 | V1 视觉层用 Tailwind v4 utility；BEM class 禁用；token 在 `@theme`；主题三态走 `<html class="dark">` |
| 0007 | 完整原生窗口应用 + TanStack Router | 单 main 窗口；删托盘/独立 settings 窗口；minimize-on-close；File→Quit 退出；in-app 路由用 TanStack Router |

> **新决策**先写 ADR 再动代码。`docs/adr/` 用 `NNNN-kebab-title.md` 命名；格式见 `.agents/skills/grill-with-docs/ADR-FORMAT.md`。

## 关键概念（与 CONTEXT.md 同步）

- **Agent** = 产品本身 = 独立 Windows 桌面应用。**避免**：widget / app / client。
- **Conversation** = 用户拥有的持久聊天线程（线性，无分支）。
- **Message** = 一轮 `user` / `assistant` / `tool` / `system`。
- **Tool** = LLM 可调用的类型化函数（V1: `get_balance`, `get_plan_quota`）。
- **Snapshot** = 计费状态的时点视图：`Balance { amount, currency, auto_recharge }` | `PlanQuota { remaining, total, expires_at?, daily_avg? }`。
- **LLM Provider** ≠ **Billing Provider**。前者是 LLM 服务（OpenAI / Anthropic / 自建 OpenAI 兼容），后者是计费源（DeepSeek / MiniMax）。**不要混用**。
- **Runtime** = Effect-TS 包装 pi-mono agent loop（`src/agent/runtime.ts`）。
- **Bridge** = Effect → Solid signal 翻译器（`src/agent/store/*.ts`）。
- **Secret** = Rust 的 `Secret<String>` newtype；Debug/Display 都打印 `***`，**`expose()` 只在 `Provider::fetch` 内部调用**。
- **Stale** = Snapshot 超过 `stale_after_seconds`；旧"stale badge"语义在 tool result 缓存中保留。

完整词汇表 + Settings 22 字段 schema → **`CONTEXT.md`**。

## 查阅指南

| 我要… | 看哪里 |
|---|---|
| 理解领域模型 | `CONTEXT.md`（先读这个） |
| 知道为什么用 X 不用 Y | `docs/adr/000N-*.md` |
| 新增 / 修改 Tauri 命令 | `src-tauri/src/commands.rs` + `src-tauri/src/lib.rs` invoke_handler 表 + `src/lib/tauri.ts` TS 镜像 |
| 新增 / 修改设置项 | `src-tauri/src/settings.rs` 的 `Settings` + `sanitized()` + `Default`；TS 镜像在 `src/lib/types.ts` |
| 看 IPC 桥接 | `src/lib/tauri.ts`（Service Tag + Live Layer） + `src/agent/store/*.ts`（桥接层） |
| 看 Agent 循环 | `src/agent/runtime.ts`（Effect Stream 包装 pi-agent） |
| 看前端组件 | `src/agent/components/*.tsx`（5 个 + 各自的 `.test.tsx`） |
| 看厂商适配器 | `src-tauri/src/providers/<id>.rs`（详见子目录 AGENTS.md） |
| 看持久化 / 搜索 | `src-tauri/src/db/`（详见子目录 AGENTS.md） |
| 写测试 | Frontend: `src/**/*.test.{ts,tsx}`，用 vitest + @effect/vitest + jsdom；Backend: `src-tauri/src/**/*.rs` 内的 `#[cfg(test)]`，wiremock 走 HTTP |

## 反模式（项目级，禁止）

- **从 `src-tauri` 之外读 Tauri store 或 keyring**。Rust 是 IPC 权威；TS 永远走 `src/lib/tauri.ts` 的 `invoke`。
- **在 `src/agent/components/` 里 `import { Effect }` 或 `import { invoke }`**。UI 是 Solid 信号的纯消费者，逻辑层封装在 `src/agent/store/`。
- **在 `src/lib/tauri.ts` 之外调 `invoke(...)`**。契约会漂。
- **直接读 `tauri-plugin-store`**。始终 `await getSettings()`，让 store mirror 到 Solid signal。
- **用 `as any` 绕过 `noUnusedLocals` / `strictNullChecks`**。去修类型。
- **React 的 `useState`**。Solid 等价物是 `createSignal` 和 store。`noUnusedLocals` 抓不到，但读者会。
- **Rust 端 `eprintln!` / `println!`**。统一 `log::{info, warn, error}`（写到 `%LocalAppData%\codeman-agent\logs\`）。
- **Rust 端 `std::sync::Mutex`**。用 `parking_lot::RwLock`（`state.rs` 项目约定）。
- **绕过 `Settings::sanitized()` 写设置**。会让 0 秒轮询间隔打满调度器。
- **第二个轮询循环**。`scheduler.rs` 是唯一的；`wakeup: Notify` 通道集中唤醒。
- **直接 return `reqwest::Error`**。它会格式化 URL 泄漏端点形状。用 `ProviderError::Upstream(format!("{status}: {body}"))`，只带 body。
- **在 `providers/minimax.rs::PLACEHOLDER_ENDPOINT` 之外硬编码占位 URL**。契约：默认 URL + 可覆盖 + 未升级前返回结构化错误。
- **在 main 窗口之外的 webview 调 `invoke(...)`。TS 永远走 `src/lib/tauri.ts` 的包装。**
- **在 MiniMax 占位 URL 升级前**接受 `MiniMax 余额` / `MiniMax 用量` 在生产对话里被调用——runtime 端工具定义允许，但 `Provider::fetch` 会返回 `ProviderError::EndpointNotConfigured`，**对话里出现这个错误属于预期，不是 bug**。

## 命令

```bash
# 安装
pnpm install

# 启动 dev（Vite HMR + Tauri 自动重启）
pnpm tauri:dev         # 自动调 scripts/kill-port.mjs 1420 1421

# 构建
pnpm build             # 前端产物到 dist/
pnpm tauri build       # 出 MSI + NSIS 安装包

# 测试
pnpm test              # 前端 vitest（jsdom）
cd src-tauri && cargo test  # 后端（带 wiremock 集成测试）

# 类型检查
pnpm typecheck         # tsc --noEmit
```

## 子目录知识库

| 路径 | 状态 | 重点 |
|---|---|---|
| `./src/AGENTS.md` | **重写** | 前端硬规则、UI/桥接边界、文件命名 |
| `./src/agent/AGENTS.md` | **新建** | Effect-TS 逻辑层、Runtime、Tools、Settings 子层 |
| `./src-tauri/AGENTS.md` | **重写** | Rust 硬规则、AppState、调度器、能力清单 |
| `./src-tauri/src/db/AGENTS.md` | **新建** | SQLite schema、迁移、FTS5 搜索实现 |
| `./src-tauri/src/providers/AGENTS.md` | **更新** | Provider trait 契约、新增厂商流程、测试模式 |

## 注意事项（踩过的坑）

- `src/index.tsx` 6 行，**没有** `app.tsx`。早期版本有过 hash 路由的 `app.tsx`，已废弃；当前 `ChatView` 自己处理 `#/settings`。
- 现有 `src/AGENTS.md` 描述的是**旧 widget 时代结构**（`src/components/widget.tsx`、`src/stores/snapshot.ts`、`lib/format.ts`），全部不存在或已迁到 `src/agent/`。**不要照搬**。
- `Cargo.lock` 由 pnpm 之外的 `cargo` 生成；改完 Rust 依赖后**手动**跑 `cargo build` 同步。
- ADR-0005 (托盘形态) 已被 ADR-0007 替代；ADR-0001 提到的 '280×100 浮窗' 是 V0 形态，V1 早已不是那个尺寸，V1.5 进一步变成单 main 窗口。
- pi-mono 已弃用，包名迁移到 `@mariozechner/pi-ai` + `@mariozechner/pi-agent`（`src/agent/runtime.ts` 注释里有版本错位说明）。
- 运行时日志：`%LocalAppData%\codeman-agent\logs\codeman-agent.log`（`tauri-plugin-log`），要 `debug` 级走 `RUST_LOG=debug`。
