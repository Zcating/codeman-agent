# 0018 — 统一日志系统（前端 logger.ts + Rust log 强制 + CONTEXT.md Logging 段移除）

**Status**: accepted (V1.10+, 2026-06-24)
**Supersedes**: 部分 `CONTEXT.md § Logging`（整体移除该段；redaction 规则降级为 developer 自觉）
**Related**: (Effect-TS 逻辑层), (中文化策略), ADR-0011(default-log-level), (Per-Conversation Agent), (service-only-in-store / D4 硬规则), (Queue-based Runtime), `src/shared/lib/logger.ts`, `src/shared/lib/tauri.ts`, `src/features/chat/lib/runtime.ts`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/commands/filesystem.rs`

## Context

V1.6-V1.9+ 日志相关决策分散在 4 处且**无统一 ADR**：

| 位置                        | 内容                                                     | 不足                                                                |
| --------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| ADR-0011(default-log-level) | Rust `tauri-plugin-log` 默认 `Info` 级 + `RUST_LOG` 开关 | 仅定默认级别，未定义"哪些路径必打"                                  |
| §4                 | developer string（含 log / console / panic）→ 中文       | 是规则，不涉及具体日志库 / API 形状                                 |
| `src-tauri/AGENTS.md` §日志 | Rust 端 3 target + `log::{info, warn, error}` 三档       | 是 operational 规则，不是架构决策                                   |
| `CONTEXT.md` § Logging      | log path / 默认级别 / api_key redaction                  | log path 是实现细节（不应在 glossary），redaction 规则与本 ADR 冲突 |

**关键现状（背景调研 2026-06-24）**：

1. **后端 Rust 端**：`tauri-plugin-log` + `log` crate 已配，3 target（stdout + LogDir + Webview），但全 crate 只 1 个 `info!`（启动消息）+ 2 个 `warn!`（settings 持久化失败、autostart 失败）。**18 个 IPC handler 中 16 个零日志**；filesystem 5 命令（read/write/edit/search/delete_file）每个 5-10 个错误分支**全静默**返回 `AppError`。

2. **前端 TS 端**：**9 处 `console.*` 散点**（分布在 `index.tsx` / `chat-view.tsx` / `settings-saver.ts` / `settings.tsx` / `anthropic-transport.ts` 5 文件），**无结构化日志库**，`@tauri-apps/plugin-log` 已装但前端零调用。RuntimeEvent 5 变体（`token` / `tool_call` / `tool_result` / `done` / `error`）中**只有 `error` 在 chat-view 有 `console.error` 输出**，其余 4 变体盲区；`tauri.ts:invoke<T>()` 全 IPC 路径零日志。

3. **D4 硬规则** 规定组件层禁止 service 操作直接调用（`invoke` / `Effect.gen yield*` / `fetch`），但 `chat-view.tsx:13` 已直接 `import { Duration, Effect, Exit, Stream } from "effect"` 调 `Effect.runPromiseExit`，是 D4 灰色地带。

4. **redaction 规则**（`CONTEXT.md § Logging` 第 4 条"log 语句一律 redact api_key 字段"）是 引入明文 API key 存盘时同步建立的安全规则；但实施成本（`LogCtx` 结构化参数 + 自动 redact 算法）与 simple API 形状（`logger.*(...args)` 与 `console.*(...args)` 1:1）冲突——本 ADR **降级**该规则为 developer 自觉（理由详见 D6）。

5. **tauri-plugin-log 2.x 默认单文件 append**，无 rotation。本期**不实现** rotation（详见 D7），开 follow-up。

## Decision

### D1. 前端 logger.ts：`...args: unknown[]` 与 console.log 同形

新建 `src/shared/lib/logger.ts`，API 形状与 `console.*` 1:1（**含全部 rest args，不强制首参为 string**）：

```ts
export const logger = {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}
```

**实现**：内部 `console.debug` / `console.info` / `console.warn` / `console.error` 1:1 转发 + 加 `[LEVEL]` 前缀。**首参是 string**时 prefix 黏在前面（`[ERROR] msg obj`）；**首参非 string**（含零 args）时 prefix 单独成 console 参数（`[ERROR]` / `[ERROR] obj`），保持 `console` 原生行为不让 prefix 黏在对象前。

```ts
function emit(level: LogLevel, args: readonly unknown[]): void {
  const first = args[0];
  switch (level) {
    case "debug":
      if (typeof first === "string") {
        console.debug(`[DEBUG] ${first}`, ...args.slice(1));
      } else {
        console.debug("[DEBUG]", ...args);
      }
      return;
    // info / warn / error 同构
  }
}
```

**不实现**：

- ❌ `LogCtx` 结构化 ctx（与 simple API 形状冲突）
- ❌ api_key 自动 redaction（依赖 developer 自觉，详见 D6）
- ❌ 强制首参为 string（与 `console.*` 1:1；非 string 也能用）
- ❌ `logger.scope(...)` 包装（增加调用方认知负担）
- ❌ caller location 显示（`new Error().stack` 开销 + production 噪音）
- ❌ sink 抽象层（暂只有 console，未来要 IPC 写后端 log 再开接口）

**理由**：

- 与 `console.debug(...args)` / `console.error(...args)` 等**完全 1:1**——任意类型任意数量参数都行
- 不强制首参为 string：调用方写 `logger.error("msg", err)` 或 `logger.error(err)` 都合法
- Error 实例走 `console.error` 原生展开（无需 logger 特殊处理）
- 与现有 9 处 `console.*` 1:1 替换，迁移成本最低

### D2. 后端 Rust 端：`log::{info, warn, error}` 在 IPC handler 边界强制

后端**不引入**新依赖，保持 `log = "0.4"` + `tauri-plugin-log` 不变。在所有 IPC handler 边界强制加日志：

| 时机                | level               | 典型位置                                                                       |
| ------------------- | ------------------- | ------------------------------------------------------------------------------ |
| IPC handler 进入    | `debug!`            | `commands/mod.rs` + `commands/filesystem.rs` 每个 `#[tauri::command]` 函数首行 |
| IPC handler 成功    | `info!`             | handler 末尾，return Ok 之前                                                   |
| IPC handler 错误    | `warn!` 或 `error!` | `Err(AppError::...)` 构造前                                                    |
| 启动 / 关键生命周期 | `info!`             | `lib.rs::setup`, `db::connect`, `AppState::new`                                |

**filesystem 5 命令**（`read_file` / `write_file` / `edit_file` / `search_files` / `delete_file`）的 5-10 个错误分支（workspace 未找到 / sandbox 越界 / 路径非法 / 文件不存在 / 大小超限 / blocked 扩展名 / 目录非文件 / trash 失败 等）**全部**加 `warn!`（含错误类型 + workspace_id + path）。

**不变量**：

- Rust 端 `Provider::fetch` 是 `secret.expose()` 唯一调用点（已 强化）；其他位置对 `Secret<String>` 用 `&secret`，**不** `.expose()` 出函数外 → log 语句对 `Secret` 自动不会打印原文
- 不修改 `ProviderError::Upstream` shape（不泄漏 URL）

### D3. UI 层 logger.\* 政策：允许所有档，不是 service 操作

**UI 层（`.tsx` 文件）允许** `logger.debug` / `logger.info` / `logger.warn` / `logger.error` 全档调用。

**理由**：

- `logger.*` 不属于"service 操作"——不调 `invoke()`、不调 `Effect.gen yield* Service`、不调 `fetch()`
- 它与 `console.log` 同类（output sink），按 精神"IPC + service 必须在 store" 不延伸
- UI 错误反馈路径（`chat-view.tsx:222` `console.error` 等）改 `logger.error` 即可，不算新违规
- 启动期 `index.tsx:26`（`#root` 缺失）和 `index.tsx:35`（refresh 失败）改用 `logger.error` / `logger.warn`，符合语义

**硬规则补充**：

- ❌ UI 层 `logger.*` **不得**包含完整 `Provider.api_key` 值（developer 自觉，详见 D6）
- ❌ UI 层 `logger.*` **不得**调 `Effect.gen yield* Service` / `invoke()` / `fetch()`（D4 规则不变）

### D4. 前端 RuntimeEvent 5 变体 + invoke<T>() + 关键 catch 日志

在 `src/features/chat/lib/runtime.ts::handleAgentEvent` 给每个 RuntimeEvent 变体打日志：

| 变体          | level   | 调用点                                                                                                               |
| ------------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| `token`       | `debug` | `Queue.unsafeOffer(queue, { type: "token", ... })` 之前                                                              |
| `tool_call`   | `info`  | `Queue.unsafeOffer(queue, { type: "tool_call", ... })` 之前                                                          |
| `tool_result` | `info`  | `Queue.unsafeOffer(queue, { type: "tool_result", ... })` 之前，含 `toolCallId` / `name` / `error?`                   |
| `done`        | `info`  | `Queue.unsafeOffer(queue, { type: "done", ... })` 之前，含 `message.id` / `usage.inputTokens` / `usage.outputTokens` |
| `error`       | `error` | `Queue.unsafeOffer(queue, { type: "error", ... })` 之前，含 `error.message`                                          |

**`tauri.ts::invoke<T>()`** 在 `.catch` 分支加 `logger.error("IPC 失败", command, err)`，command 名是第一个 ctx 字段便于 grep。

**关键 catch**（已有 9 处 `console.*` 散点，全部改 logger + 适度增强）：

- `src/index.tsx:26, 35` — 启动 bootstrap
- `src/features/chat/components/chat-view.tsx:171-176, 222, 236` — 流式阶段错误
- `src/features/settings/lib/settings-saver.ts:28` — debounce flush 失败
- `src/features/settings/routes/settings.tsx:80` — clearAllHistory 失败
- `src/features/chat/lib/anthropic-transport.ts:397-398, 643` — mock 队列空 + MAX_TURNS（mock 警告改 `logger.warn`，生产路径不动）

### D5. 替换 9 处 console.\* 散点

| 文件:行                                                | 旧                                                | 新                                               |
| ------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------ |
| `src/index.tsx:26`                                     | `console.error("启动时 #root 元素缺失", e)`       | `logger.error("启动时 #root 元素缺失", e)`       |
| `src/index.tsx:35`                                     | `console.warn("启动时 refresh settings 失败", e)` | `logger.warn("启动时 refresh settings 失败", e)` |
| `src/features/chat/components/chat-view.tsx:171-176`   | `console.error("appendUserMessage 失败", e)`      | `logger.error("appendUserMessage 失败", e)`      |
| `src/features/chat/components/chat-view.tsx:222`       | `console.error("流式阶段错误", error)`            | `logger.error("流式阶段错误", error)`            |
| `src/features/chat/components/chat-view.tsx:236`       | `console.error("Stream.runForEach 失败", cause)`  | `logger.error("Stream.runForEach 失败", cause)`  |
| `src/features/settings/lib/settings-saver.ts:28`       | `console.error("debounced flush 失败", e)`        | `logger.error("debounced flush 失败", e)`        |
| `src/features/settings/routes/settings.tsx:80`         | `console.error("clearAllHistory 失败", e)`        | `logger.error("clearAllHistory 失败", e)`        |
| `src/features/chat/lib/anthropic-transport.ts:397-398` | `console.warn("mock 队列为空")`                   | `logger.warn("mock 队列为空")`                   |
| `src/features/chat/lib/anthropic-transport.ts:643`     | `console.warn("达到 MAX_TURNS 终止")`             | `logger.warn("达到 MAX_TURNS 终止")`             |

**反模式禁止**（新增 `src/AGENTS.md` 反模式条目）：

- ❌ UI 层新增 `console.log` / `console.error` / `console.warn` / `console.debug` —— 全部走 `logger`
- ❌ 后端新增 `eprintln!` / `println!` —— 全部走 `log::{info, warn, error}`

### D6. CONTEXT.md § Logging 段完整移除 + Secret 术语注解 + redaction 降级

**移除** `CONTEXT.md § Logging` 整段（log path / 默认级别 / redaction 规则）。log path 是实现细节不应在 glossary；redaction 规则降级为 developer 自觉。

**在 `Secret` 术语下加一句注解**（`CONTEXT.md` § 密钥 段）：

> **Secret** — Rust 端 `Secret<String>` newtype，`Debug` / `Display` 打印 `Secret(***)` / `***`。V1.7+ 后 Settings JSON 明文存 key，`Secret` 主要用于 pi-agent 运行时构造 header 时临时包裹。**调用方**：`logger.*` / `log::*!` 不得打印完整 secret 值（任一语言）；`Secret` 类型自动重载 `Debug` / `Display`，裸字符串变量需手动 redact 为 `***`。V1.10+ 起本规则从"强制 redact"降级为 developer 自觉——理由是 simple logger API 与自动 redaction 实现冲突，详见。

**redaction 降级理由**（写在 ADR Consequences 章节）：

- simple logger API（`...args: unknown[]`）无法在不破坏形状前提下自动检测 `api_key` 字段
- 自动 redaction 需要 `LogCtx` 结构化对象 + redact 算法，与 simple 形状冲突
- V1 单机单用户威胁模型下（API key 仅本机可见），redaction 是"防止开发者错误日志泄漏自己 key"的二级防御，不是"防止外部攻击"的一级防御
- 替代措施：Rust 端 `Secret<String>` 的 `Debug` / `Display` 重载仍自动 redact（结构性保证）；TS 端 developer 自觉（API key 不出现在正常日志路径）

### D7. log rotation：本期不实现，开 follow-up

`tauri-plugin-log` 2.x 默认 LogDir 单文件 append，无 rotation。本期**不实现** rotation 机制。

**理由**：

- 本期 scope 已大（logger.ts + 18 IPC handler + RuntimeEvent + 替换 9 处 console）
- V1 单机单用户使用频率下，log 文件增长慢（每日 ~1MB 量级）
- rotation 需要 chrono crate（按日轮转）或手动 file size check（按大小轮转），增加 ~50 行 Rust 代码 + 额外测试

**ADR-0019 候选**：

- 选 A：按大小轮转（10MB × 5 backup），用 `std::fs` 手动 check
- 选 B：按日轮转（每天一个文件，保留 7 天），需 `chrono` crate
- 选 C：升级 `tauri-plugin-log` 到 2.x rotation feature，配 fern backend

## Considered Options

### D1 (logger API 形状) 4 选

| 选  | 描述                                                              | 选 / 不选                                         |
| --- | ----------------------------------------------------------------- | ------------------------------------------------- |
| A   | `logger.debug(msg: string, ctx?: LogCtx)` + 自动 redact api_key   | 不选 — 与 `console.*` 不同形，迁移成本高          |
| B   | `logger.debug(msg: string, ...args: unknown[])` 强制首参为 string | 不选 — 仍限制首参类型，与 `console.*` 不完全 1:1  |
| C   | `logger.debug(...args: unknown[])` 全 rest args 不强制首参        | **选** — 与 `console.*(...args)` 完全 1:1；最灵活 |
| D   | `logger.scope("chat-runtime").debug(msg)` scope-based             | 不选 — V1 不需要 scope，调用方认知负担            |
| E   | 只保留 `console.*` 不引入 logger                                  | 不选 — 散点无法收敛，无级别                       |

### D2 (Rust 日志覆盖范围) 3 选

| 选  | 描述                                 | 选 / 不选                                       |
| --- | ------------------------------------ | ----------------------------------------------- |
| A   | 只覆盖 filesystem 5 命令（错误路径） | 不选 — 不完整，commands/mod.rs 13 个 IPC 仍盲区 |
| B   | 全量 18 IPC handler + 关键生命周期   | **选** — 一次性达到"全 IPC 可观测"              |
| C   | 全量 + tracing crate 替换 log        | 不选 — 异步循环已迁 TS，tracing span 用武之地小 |

### D6 (CONTEXT.md Logging 段) 3 选

| 选  | 描述                                                          | 选 / 不选                                            |
| --- | ------------------------------------------------------------- | ---------------------------------------------------- |
| A   | 保留 Logging 段不动，只改 logger 实现                         | 不选 — 与 simple API 冲突，redaction 规则无法落地    |
| B   | 移除 Logging 段，redaction 降级为 developer 自觉              | **选** — 配合 simple API，CONTEXT.md 回归纯 glossary |
| C   | 移除 Logging 段，redaction 保留为强约束（与 simple API 矛盾） | 不选 — 自相矛盾，不可实施                            |

### D7 (log rotation) 3 选

| 选  | 描述                                      | 选 / 不选                                   |
| --- | ----------------------------------------- | ------------------------------------------- |
| A   | 本期实现按大小轮转（10MB × 5）            | 不选 — 增加 ~50 行 + 测试，scope 蔓延       |
| B   | 本期实现按日轮转（每天一文件，保留 7 天） | 不选 — 需新增 chrono crate                  |
| C   | 本期不实现，开 follow-up         | **选** — scope 收住，rotation 独立 ADR 评估 |

## Consequences

### 正面

- **前端结构化收敛**：9 处 `console.*` 散点 → 统一 `logger.*`；新增 5 RuntimeEvent + invoke<T> + settings-saver + transport 关键 catch 共 ~20 处日志调用；dev / production 一致
- **后端 IPC 全可观测**：18 个 IPC handler 入口 + 成功 + 错误全部日志化；filesystem 5 命令 5-10 个错误分支全 `warn!`；上线后排查"为什么这个 IPC 静默失败"有迹可循
- **D4 灰色地带清晰**：UI 层 `logger.*` 允许（不是 service 操作），但 service 操作（invoke / Effect.gen yield\* / fetch）仍必须走 store
- **chat 流式阶段全可观测**：RuntimeEvent 5 变体都打，token 流降为 debug 避免刷屏；tool_call / tool_result / done / error 走 info / error 级别
- **CONTEXT.md 回归纯 glossary**：移除 § Logging 段（log path 是实现细节），Secret 术语下加 redaction 注解保持安全语义
- **规则统一在 ADR-0018**：4 层分散决策（ADR-0009 + ADR-0011(default-log-level) + src-tauri/AGENTS.md + CONTEXT.md）收敛到一个 ADR，未来追溯成本降低

### 负面

- **redaction 规则降级**：developer 自觉替代强制 redact；理论上 developer 可能错误日志明文 key。Mitigation：Rust 端 `Secret<String>` 结构性 redact 仍生效（最常见路径：pi-agent 构造 header 时），TS 端 developer 习惯靠 code review 抓
- **chat 流 token 日志开销**：token 变体高频（10-50/s），即使 debug 档仍有 console output 开销。Mitigation：debug 档在 production webview 默认被 devtools 过滤，性能影响可忽略
- **RuntimeEvent 5 变体全打增加噪音**：tool_call / tool_result / done 在普通对话也会出现。Mitigation：info 档不显示 caller location，单条长度 ~80 字符
- **tauri-plugin-log 单文件不轮转**：log 文件会持续增长。Mitigation：开 follow-up；本期 V1 单机单用户使用频率下增长慢（每日 ~1MB）
- **新增 logger.ts 文件**：与 `cn.ts` / `tauri.ts` / `format-app-error.ts` 同级；不引入新 npm 依赖（用 console.\* 转发）
- **mock 警告也走 logger**：`anthropic-transport.ts:397-398` mock 队列空警告改 `logger.warn`，vitest 测试环境下也会输出；需测试 setup 不对 logger 做 strict assertion

### 不变

- (Effect-TS 逻辑层) "UI 不导入 effect" 约束 —— 仅 logger.ts 是 simple 输出 API（无 effect 导入），不破坏该约束
- (中文化) developer string 中文规则 —— `log::*!` / `logger.*` 字符串继续中文（ADR-0009 §4 表不变）
- ADR-0011(default-log-level) 默认 Info 级 + `RUST_LOG` 开关 —— 不变
- 硬规则 —— service 操作仍在 store；logger.\* 不算 service 操作
- Queue-based Runtime —— runtime.ts 仍返回 `Stream<R=never>`；本 ADR 仅在 `handleAgentEvent` 内部加 logger 调用，不改 Stream shape
- tauri-plugin-log 3 target 配置 —— 不变（stdout + LogDir + Webview）
- pi-mono agent runtime / anthropic-messages-only / SQLite FTS5 / Tauri 单 webview / 单 provider 单账号等 non-goals —— 不变

## Timing

- **V1.10+ sprint**：本期落 ADR + logger.ts + 18 IPC handler 日志 + RuntimeEvent 日志 + 9 处 console 替换 + 文档同步
- 顺序：
  1. ADR + CONTEXT.md 更新（先 ADR 再动代码）
  2. 新建 `src/shared/lib/logger.ts` + `logger.test.ts`
  3. 后端批量：18 IPC handler 加日志（commands/mod.rs + commands/filesystem.rs 一次 PR）
  4. 前端批量：RuntimeEvent 5 变体 + invoke<T> + 9 处 console 替换（chat + settings + transport 三处一次 PR）
  5. 文档同步：`src-tauri/AGENTS.md` §日志 强化 + `src/AGENTS.md` 反模式加 console.\* 禁止 + `src/shared/AGENTS.md` 加 logger 位置
  6. 验证：`vp run typecheck` + `vp run test` + `vp run e2e`
- 不开新 IPC 命令（TS logger 仅 console，不走 plugin-log 前端通道）
- 不进 E2E spec（logger 是 output sink，行为验证靠 `logger.test.ts` 单测 + `vp run test`）
- follow-up：log rotation 策略（按大小 / 按日 / tracing 升级 三选一）

## References

- (Effect-TS 逻辑层) — bridge pattern 保留；UI 不直接接 effect 约束不变
- (中文化) — developer string 中文规则（log / console / panic / Err）继续生效
- ADR-0011(default-log-level) — `lib.rs::run` 默认 Info 级 + `RUST_LOG` 开关不变；本 ADR 在其基础上补充"哪些路径必打"
- (Per-Conversation Agent) — per-conv Agent Map / lazy create / history feed 不变；RuntimeEvent 5 变体 shape 不变
- (service-only-in-store) — D4 硬规则不变；logger.\* 不算 service 操作（详见本 ADR D3）
- (Queue-based Runtime) — runtime.ts Stream shape 不变；本 ADR 在 `handleAgentEvent` 内部加 logger
- `src-tauri/src/lib.rs::run` — tauri-plugin-log 3 target 配置不变
- `src-tauri/src/commands/mod.rs` — 13 个 IPC handler（加日志）
- `src-tauri/src/commands/filesystem.rs` — 5 个文件工具 IPC handler（加日志）
- `src/shared/lib/tauri.ts::invoke<T>()` — IPC 入口（加 catch logger.error）
- `src/features/chat/lib/runtime.ts::handleAgentEvent` — RuntimeEvent 5 变体入口（加 logger）
- 顶层 `AGENTS.md` "ADR 索引"段（同步新增 0018 行）
- 候选（follow-up）：log rotation 策略

## CONTEXT.md 更新项

- **移除** § Logging 整段（log path / 默认级别 / redaction 规则全部移除）
- **保留并强化** § 密钥 → Secret 术语下加注解：developer 自觉不打印完整 secret 值（详见 D6 降级理由）
- **不变**：词汇表其余条目（Provider / Snapshot / Runtime / Agent Map / Bridge / App Store 等）
- **不变**：Domain shape 段
- **不变**：Settings / Authentication / MiniMax Endpoints 段
- **新增隐式引用**：`src/shared/lib/logger.ts` 是 logger 唯一入口（词汇表外，AGENTS.md 操作层）
