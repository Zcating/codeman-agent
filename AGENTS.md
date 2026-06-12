# codeman-agent — Agent 知识库

**生成时间:** 2026-06-13
**技术栈:** Tauri 2 (Rust) · Solid.js · TypeScript · Vite · pnpm 11 ·
Effect-TS · pi-mono · SQLite (FTS5) · vitest
**目标平台:** 仅 Windows (V1)。跨平台 Tauri 移植可行,但不在范围内。

## 项目定位

一个常驻系统托盘的桌面 AI agent(tray icon 像素风,无边框),点击
tray 唤起主窗口(800×600 / 600×400),通用 LLM 聊天 + 计费 tools
(DeepSeek 余额 / MiniMax 套餐配额)。V1 是**鼠标驱动**——零热键;
`tauri-plugin-global-shortcut` 留在依赖里给 V2 用。

> 项目词汇见 `CONTEXT.md`(权威词汇表),技术选型决策见
> `docs/adr/0001..0005`。本文件是**操作层**——目录地图、命令、
> 项目专属规则,不重复上述文档。

## 目录布局

```
.
├── src/                       # Solid.js 前端(详见 src/AGENTS.md)
│   └── agent/                 # pi-mono 集成层
│       ├── runtime.ts         # AgentRuntime 单例(包 pi-agent)
│       ├── tools/             # tool 定义(@tool 调 invoke)
│       │   └── billing.ts     # get_balance / get_plan_quota
│       ├── settings/          # LLM provider / system prompt 管理
│       ├── store/             # Solid store(SQlite-backed,经 IPC)
│       │   ├── conversations.ts
│       │   ├── messages.ts
│       │   └── search.ts
│       └── components/        # UI 组件(Solid)
│           ├── Sidebar.tsx
│           ├── ChatView.tsx
│           ├── MessageBubble.tsx
│           ├── ToolCallCard.tsx
│           ├── SettingsModal.tsx
│           └── ProviderCard.tsx
│   ├── test-setup.ts          # vitest 启动文件(@testing-library/jest-dom)
│   ├── lib/
│   │   ├── tauri.ts           # IPC 包装(Effect 化)
│   │   └── types.ts           # 镜像 src-tauri/src/types.rs
│   ├── App.tsx
│   └── index.tsx
├── src-tauri/                 # Rust 后端(详见 src-tauri/AGENTS.md)
│   └── src/
│       ├── providers/         # 计费 adapter(沿用)
│       ├── secrets.rs         # 计费 API key(沿用)
│       ├── secrets_llm.rs     # LLM API key 路径(走 Tauri store)
│       ├── settings.rs        # 25+ 字段 Settings
│       ├── scheduler.rs       # 计费轮询(沿用)
│       ├── db/                # SQLite
│       │   ├── mod.rs
│       │   ├── schema.sql
│       │   ├── migrations/    # 编号 migration 文件
│       │   ├── conversations.rs
│       │   └── messages.rs
│       ├── commands.rs        # 沿用 + ~14 个新命令
│       ├── events.rs          # 沿用 + agent 事件
│       └── lib.rs
├── docs/
│   └── adr/                   # 架构决策记录(0001..0005)
├── scripts/                   # Node 侧开发脚本(kill-port)
├── public/                    # 原样打包的静态资源
├── index.html                 # Vite 入口
├── vite.config.ts             # 内联 vitest 配置(test.environment=jsdom)
├── vitest.config.ts           # 不存在(vitest 配置全部内联到 vite.config.ts)
├── package.json
├── tsconfig.json
├── pnpm-workspace.yaml        # 仍为占位文件,不要往里加包
└── CONTEXT.md                 # 词汇表(权威)
```

## 常用命令

```bash
# 仅前端
pnpm dev          # vite dev,端口 1420
pnpm typecheck    # tsc --noEmit
pnpm build        # vite build → dist/
pnpm test         # vitest --run(单次)
pnpm test:watch   # vitest(开发时)

# 整包
pnpm tauri dev    # 构建前端 + 运行 Rust 壳
pnpm tauri build  # 产出 MSI/NSIS 安装包
```

`predev` / `pretauri` 跑 `scripts/kill-port.mjs 1420 1421`,端口冲突
是硬错误。`vite.config.ts` 的 `test` 块内联 vitest 配置,jsdom 环境,
启动文件 `src/test-setup.ts` 引入 `@testing-library/jest-dom`。

## IPC 契约(总览)

- 所有命令定义在 `src-tauri/src/commands.rs`,经 `src/lib/tauri.ts`
  包装为 Effect-TS 服务。**新增命令必须同时改这两处。**
- 向前端推送的事件:
  - 既有(沿用):`snapshot-updated` → `SnapshotEnvelope`,
    `refresh-failed` → `{ provider, error }`,
    `low-threshold-breached` → `{ provider, snapshot }`
  - 新增(agent):`agent-state-changed` → `{ state: "idle" |
    "thinking" | "error", error? }`、
    `message-appended` → `{ conversation_id, message }`、
    `tool-call-started` → `{ message_id, tool_call }`、
    `tool-call-finished` → `{ message_id, tool_call_id,
    result, error? }`
- 线上字段一律 **snake_case**(Rust serde 决定),TS 里也用
  snake_case。`src/lib/types.ts` 是 `src-tauri/src/types.rs` 的镜像,
  任何漂移都视作 bug。

## 硬性规则(项目专属)

### Secrets

- **两套 secrets,两套 namespace,不混。**
  - **Billing API key**:`codeman-agent/<provider>/api_key` 存
    Windows Credential Manager(走 `keyring` crate),Rust 私有,
    前端只接 `has_key: boolean`。
  - **LLM API key**:`llm_providers/<id>/api_key` 存 Tauri store,
    webview 可读,**不进 keyring**。威胁模型:LLM key 只能烧
    token,不能转账,降一级防护合理。
- **`Secret<String>` 对日志不可见。** Rust 侧 `Debug` / `Display`
  打印 `Secret(***)`。TS 侧 Effect service 内部亦不得 `console.log`
  明文 key,只允许 `console.log({ api_key_ref: '...' })`。**只有
  adapter 层可以调用 `.expose()` / 拿明文。**

### Effect-TS 边界(逻辑层用,UI 消费)

- **逻辑层**:`src/agent/runtime.ts`、`src/agent/tools/*.ts`、
  `src/agent/store/*.ts`、`src/lib/tauri.ts` **必须**用
  Effect-TS。`Effect<A, E, R>` 包同步操作,`Stream<A, E, R>`
  包流式(token 输出、tool 进度)。Effect service 通过 layers
  注入依赖。
- **桥接层**:`src/agent/store/*.ts` 是 Effect → Solid 的桥。
  用 `Effect.runPromise` / `Stream.runForEach` 订阅,把结果写
  进 Solid signal。**桥接层是 UI 与 Effect 的唯一接触面。**
- **UI 层**:`src/agent/components/`、`src/agent/settings/` 的
  渲染部分 **不得** `import 'effect'`,只读 Solid signal /
  store / `createMemo`。任何在组件里 `import { Effect, Stream
  ... }` 的 PR 必拒。
- **平台包**:只用 `@effect/platform-browser`。**禁止**引入
  `@effect/platform-node`——webview 跑不了 Node,引入即崩溃。

### 桥接层契约

- 桥接层输出的 Solid signal 必须是**纯数据**(plain values 或
  普通对象),不允许是 `Effect` / `Stream` 实例。错误以
  `Error` 或判别联合(写明 type)落地,不暴露 Effect 的 `_tag`。
- Effect service 的 typed error 在桥接层被翻译;UI 看到的
  `error` 字段是 `string`(用户可读)或 `{ kind: 'X', ... }`
  判别联合。

### Settings

- **V1 字段共 9 大类 / 25+ 字段**,完整 schema 见
  `CONTEXT.md` 的 "Settings (V1 shape)" 节。
- **写入前必须 sanitized**。`Settings::sanitized()` 钳值:`refresh_interval_secs`
  ≥ 5、`low_quota_threshold_pct` ∈ [0, 100]、
  `low_balance_threshold` ≥ 0、`auto_archive_after_days` ≥ 1、
  `max_history` ≥ 10。所有接受用户输入的写路径(`commands::update_settings`)
  必须先调它。
- **API key 不进 `settings.json`**。LLM key 走 Tauri store,billing
  key 走 keyring,settings 里只存 `api_key_ref` 路径。
- **Settings 通过 `tauri-plugin-store` 持久化**(沿用 V0)。
- **V1 不迁移 V0 `settings.json`**。首次启动视为新装,旧
  JSON 被忽略(V0 → V1 是产品重定义,不是升级)。

### Hotkeys

- **V1 零热键**。`tauri-plugin-global-shortcut` 留在
  `Cargo.toml` / `package.json` 里,代码不调用。**不要清理
  这个"未使用"的依赖**——V2 要用。
- **V1 Settings 里 `hotkeys` 字段保留**,标 `deprecated`,
  UI 上展示为只读,V1 不可改。
- V2 计划加 3 个全局热键(toggle_window / new_conversation /
  open_settings)+ 恢复应用内固定热键(Enter / Shift+Enter /
  Ctrl+F)。

### SQLite

- **schema 走 `src-tauri/src/db/schema.sql` + 编号 migration
  文件**,启动时跑未执行的 migration。**不要直接改
  `schema.sql`**——它是 V1 初始快照,后续修改一律走 migration。
- **ON DELETE CASCADE**:`messages.conversation_id` 删 conversation
  自动级联删 messages,不要在 TS 端手工清。
- **软删**:UI 触发"删除对话"只 set `archived_at`,**不**真
  删。后台每日任务扫 `archived_at < now - auto_archive_after_days`,
  真删。
- **历史容量**:`max_history` (默认 1000) 限制非归档对话
  数;超过时最老的非归档对话自动归档;归档数超过 1500
  硬删最老的归档。
- **`messages_fts` 是 FTS5 虚拟表**,`content='messages'` 镜像
  自 `messages.content`。**修改 `messages` 必须同步更新
  FTS**(用 trigger 或在 Rust 写事务里同时操作两张表)。
- **旧 V0 `settings.json` 不迁移到 SQLite**——V0 没有任何
  数据需要保留。

### 测试(vitest)

- **TS 用 vitest**,配置**内联**到 `vite.config.ts` 的 `test`
  块,**不**另开 `vitest.config.ts`。环境 `jsdom`,globals `true`,
  `setupFiles: ['./src/test-setup.ts']`。
- 测试文件位置:`<source>.test.ts` **同目录**,跟 Rust inline
  test 风格一致。例:`src/agent/tools/billing.ts` →
  `src/agent/tools/billing.test.ts`。
- **测试范围**(V1):
  - ✅ tool 定义(Zod schema + handler 逻辑)
  - ✅ Effect service(layer 注入 + 错误路径,`@effect/vitest`)
  - ✅ IPC bridge(`invoke()` → Effect typed error 翻译)
  - ✅ SQLite CRUD + search(Rust 端用 `#[cfg(test)]`,
    TS 端用 mock layer)
  - ✅ settings sanitized(钳值)
  - ✅ utils / pure fn
  - ✅ **Solid 组件**(`@solidjs/testing-library` + jsdom)——
    Sidebar / ChatView / MessageBubble / ToolCallCard /
    SettingsModal / ProviderCard
  - ❌ pi-mono 自身(不测第三方)
  - ❌ 端到端流式输出(留 V2)
- **不引 `@solidjs/router` 之外的额外测试库**;@testing-library
  套件保持精简(user-event + jest-dom + solidjs)。
- **Rust 测试**(沿用 V0):`#[cfg(test)] mod tests` 内联,
  `scheduler.rs` 用 `FakeProvider`,`*Adapter` 用 `wiremock`。

### IPC 错误传播

- Rust 命令返回 `Result<T, AppError>`,`AppError` 实现
  `serde::Serialize`,错误 `kind` 是字符串判别(`"NotFound"`
  / `"Unauthorized"` / `"Network"` / `"InvalidConfig"` 等)。
- TS 端 `lib/tauri.ts` 把 `Result` 翻成
  `Effect.tryPromise({ catch: e => new AppError(e) })`,
  让 typed error 一路传到 Effect service。

## 约定

- Rust 文件以 `//!` 模块文档注释开头,一句话点明职责。
- TypeScript 文件同样以 `//!` 开头。Effect service 文件头
  必须写明:暴露的 `Effect<A, E, R>` 签名 / `Stream<A, E, R>`
  签名,以及它依赖的 layer。
- 新增命令:**同时**改 `src-tauri/src/commands.rs` 和
  `src/lib/tauri.ts`。
- 新增 LLM 工具:**同时**改 `src/agent/tools/*.ts`(Zod schema
  + handler)和 `src-tauri/src/commands.rs`(IPC 命令) +
  `src-tauri/src/providers/*`(adapter 已有就复用)。
- 前端**不直接 import Rust 类型**——只引用 `src/lib/types.ts`
  里的 TS 形状。TS 文件就是线缆契约。
- 桥接层文件(`src/agent/store/*.ts`)的**唯一**职责是
  Effect → Solid 翻译,不持有业务逻辑。业务逻辑在 Effect
  service 里。

## 反模式(明确禁止)

- 用 `format!("{secret:?}")` 之类把 `secrets::*` 的值写进日志。
- 用 `String` 表示金额/数量值。货币用 `rust_decimal::Decimal`,
  配额计数用 `u64`,百分比这种**派生值**才用 `f64`。
- 用 `setState` 满天飞。共享状态必须走 `src/agent/store/*.ts`
  的 Solid store,组件用 `createMemo` / signal getter 读。
- 前端代码直接调 `adapter.fetch`。必须经过 Tauri 命令
  (`test_provider` / `force_refresh` / 新的 conversation
  / message 命令)。
- 给 `Snapshot` 加字段而不同时更新 Rust 枚举**和** TS
  联合变体。`kind` 上的判别联合是前端唯一依赖的结构化类型。
- 跳过 `Provider` trait(`src-tauri/src/providers/mod.rs`)
  直接写新厂商。
- **在 Solid 组件 / UI 文件里 `import 'effect'`**。任何 PR
  触发这条必拒(见"Effect-TS 边界"硬性规则)。
- **在 Effect service 里直接读写 Solid signal**。signal 只
  在桥接层更新。
- **把 `Result<T, E>` 的 `E` 设计成 `string`**。Rust 端必须
  是 typed `AppError`,TS 端必须翻译成 typed error,UI 层
  看到的是判别联合或 Error 子类。
- **在 TS 端直接 `new sql.Database(...)` / 直接打开 SQLite**。
  所有 DB 操作走 Rust IPC。
- **修改 `src-tauri/src/db/schema.sql` 而不写 migration**。
- **跳过 `db/mod.rs` 跑 migration 的启动 hook** 而手工建表。
- **"清理" `tauri-plugin-global-shortcut` 这个"未使用"依赖**。
  V2 要用。

## 已知坑

- **MiniMax 端点待定。** Adapter 带占位 URL,返回
  `ProviderError::EndpointNotConfigured` 直到 `CONTEXT.md` 文
  档化了经核验的 URL 并翻转为默认。
- `pnpm-workspace.yaml` 当前是占位文件,**不是**真正的
  workspace。**不要往里加包。**
- `tauri.conf.json` 里 `CSP` 设为 `null`——开发期便利,不
  是基线。新建窗口不要照抄。
- `Cargo.toml` 把 `rust_decimal` / `chrono` / `reqwest` /
  `sqlx` 锁在带特定 features 的版本。升版时审视 features。
- **V0 的 `settings.json` 不迁移到 V1**——V0 → V1 是产品
  重定义,不是升级。V1 首次启动视为新装。
- **pi-mono 在 webview 里跑**,无 Node API。pi-mono 内部任
  何 `import 'fs'` / `import 'node:path'` 走不通,需要
  Tauri IPC 替身。检查 pi-mono 用法时确认无 Node-only
  依赖。
- **Effect Stream 在 vitest 里需要 `@effect/vitest` 提供的
  `TestClock` / mock layers**,不要用 `vi.useFakeTimers()`
  试图套 Effect——两者不兼容。
- **`@testing-library/jest-dom` 的 matcher 在 Solid 测试
  里仍然可用**(`toBeInTheDocument` 等),但要确认 setup
  文件在 `vite.config.ts` 的 `setupFiles` 里被引用。
