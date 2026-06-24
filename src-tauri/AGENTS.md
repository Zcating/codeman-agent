# src-tauri/ — 后端 (Rust + Tauri 2)

Rust 壳：Tauri 运行时、7 个插件、25 个 IPC 命令、单调度器轮询循环、SQLite 持久化、计费厂商适配。前端只通过命令名、事件名、以及 `types.rs` 里序列化好的形状跟它打交道，**看不见内部实现**。

## 目录布局

```
src-tauri/
├── Cargo.toml             # edition 2021, MSRV 1.77；tauri 2 + sqlx 0.8 + keyring 3
├── tauri.conf.json        # 单 main 窗口 (800×600, 原生装饰)
├── build.rs
├── capabilities/
│   └── default.json       # main 窗口 ACL
├── icons/                 # 19 个图标
├── gen/schemas/           # Tauri 生成的 capability schema（自动）
└── src/
    ├── main.rs            # 5 行：转发到 lib::run()
├── lib.rs             # crate 根：7 插件注册、25 命令 invoke_handler!、setup、on_window_event
├── commands.rs        # 25 个 #[tauri::command] IPC 入口（按任务分组）
    ├── types.rs           # 域类型：ProviderId, Snapshot, Secret, AppError, ProviderKind, ProviderDescriptor
    ├── state.rs           # AppState：Clone + Arc + parking_lot::RwLock 守卫
    ├── settings.rs        # Settings (19 字段) + sanitized() + Default
    ├── secrets.rs         # keyring 包装 (billing provider API key)
    ├── secrets_llm.rs     # LLM API key 存储（走 tauri-plugin-store）
    ├── scheduler.rs       # 单一异步轮询循环（tokio::select! + yield_now）
    ├── events.rs          # Tauri 事件发射助手
    ├── providers/         # Provider trait + 各厂商适配器（详见子目录 AGENTS.md）
    └── db/                # SQLite + FTS5 持久化（详见子目录 AGENTS.md）
```

## 25 个 IPC 命令（按任务分组）

| 分组              | 命令                                                                                                       | 用途                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------- |
| **V0 Provider**   | `list_providers` `get_active_provider` `set_active_provider` `force_refresh`                               | 旧版计费 provider 操作 |
| **V0 Settings**   | `get_settings` `update_settings` `set_api_key` `has_api_key` `test_provider`                               | 旧版设置 + 密钥        |
| **V0 Snapshot**   | `latest_snapshot`                                                                                          | V0 快照                |
| **T12 会话**      | `list_conversations` `get_conversation` `create_conversation` `archive_conversation` `delete_conversation` | 对话 CRUD              |
| **T12 消息**      | `list_messages` `append_message` `search_messages`                                                         | 消息 CRUD + FTS5 搜索  |
| **T13 计费**      | `get_provider_snapshot` `list_billing_providers` `has_billing_key` `set_billing_key`                       | billing 工具桥接       |
| **T22 设置+密钥** | `clear_all_history` `set_llm_key` `has_llm_key`                                                            | LLM key + 清空         |

权威列表在 `src-tauri/src/lib.rs::invoke_handler!`；TS 镜像在 `src/lib/tauri.ts`。**两边漂移 = 前端静默 bug**。

## 硬性规则

- **每个 IPC 命令必须有 TS 包装。** Rust 侧 `lib.rs::invoke_handler!` 是权威；`src/lib/tauri.ts` 的 `invoke<T>()` + Service Tag 是镜像。修改顺序：先 Rust，后 TS，**同步提交**。
- **`Secret<String>` 是唯一装 API key 的类型。** `Debug` / `Display` 都被替换成 `***`（`types.rs::Secret`）。`secrets` / `secrets_llm` 模块返回 `Option<String>`——**在 `state.rs::fetch_provider` 那一行立刻用 `Secret::new` 裹起来**，裸 `String` 不准越过那行。
- **设置写入走 `state.apply_settings`**（内部调 `Settings::sanitized()`）**再 `state.persist_settings()`**。**不要**绕过 `sanitized()`，否则用户能输入 0 秒间隔把调度器打满。
- **调度器是单一异步任务。** `lib.rs::setup` 里 `tauri::async_runtime::spawn` 一次。**不要**再起别的轮询循环，所有唤醒都通过 `wakeup: tokio::sync::Notify` 通道。
- **`fetch_active` 是调度器唯一入口。** 永远不要加第二条轮询路径。非激活厂商保持冷态。
- **AppState 实现 Clone。** 所有字段都是 `Arc` / `parking_lot` 守卫。clone 传后台任务和 `tauri::State`；变更走局部写守卫，**不要** `Mutex<AppState>`。
- **`Provider::fetch` 是 `secret.expose()` 唯一调用点。** 其他地方对 secret 用 `&secret` 即可，**不要** `.expose()` 出函数外。
- **`ProviderError::Upstream` 只带 body 不带 URL。** `format!("{status}: {body}")`——URL 泄漏是低风险指纹但无意义。

## 模式

- **调度器用 `tokio::select!` 把 fetch 跟两个定时器赛跑。** 任一分支先 `yield_now` 再回到循环——被丢弃的 fetch future 会取消正在进行的 HTTP 请求。这是"切换时中止飞行中请求"性质成立的原因。
- **适配器响应一律包成 `SnapshotEnvelope`——即便出错也包。** 前端不用特判"数据缺失"，能统一渲染过期/空状态。见 `state.rs::fetch_provider`。
- **`is_breached(Snapshot, Settings) -> bool` 是纯函数。** 测试在 `state.rs::tests`。阈值变更在下一次 fetch 生效，不需要实时订阅。
- **main 窗口关闭走 `prevent_close` + minimize**（X 按钮）（`lib.rs::on_window_event`）。真正退出走菜单 File→Quit（`app.exit(0)`）。
- **Event 总线在 `events.rs`。** 当前用 `SnapshotUpdated` 推到前端；新增事件 = 在 `events.rs` 加 helper + 在 capabilities 加 `core:event:default`（已有）。

## 能力清单 (`capabilities/default.json`)

main 窗口用 `default` capability。关键授权：

- `core:window:allow-set-position` / `allow-set-size`——拖动/调整 main
- `core:event:default`——监听 `snapshot-updated` 等
- `notification:default` + `allow-notify`——系统通知
- `autostart:allow-enable` / `allow-disable`——开机自启
- `log:default`——`tauri-plugin-log` 输出
- `window-state:default`——窗口位置/尺寸持久化
- `store:default`——设置 JSON
- `opener:default`——`tauri-plugin-opener`（从设置跳外链？）

新增权限需要重建 `gen/schemas/` 里的能力 schema。`tauri-plugin-log` 默认 `info` 级，要 `debug` 走环境变量。

## 查阅指南

| 任务            | 文件                                                                           |
| --------------- | ------------------------------------------------------------------------------ |
| 新增 Tauri 命令 | `commands.rs` + `lib.rs::invoke_handler!`（**先两边同时改**）                  |
| 新增域枚举/变体 | `types.rs`（镜像到 `src/lib/types.ts`）                                        |
| 新增设置项      | `settings.rs::Settings` + `sanitized()` + `Default`（**先 Rust**，再 TS 镜像） |
| 改轮询行为      | `scheduler.rs`——**不要**拆循环                                                 |
| 新增系统通知    | `state.rs::fire_threshold_notification`                                        |
| 接入新插件      | `lib.rs::run` + `Cargo.toml` + `capabilities/default.json`                     |
| 新增厂商        | `providers/<name>.rs` + `providers/mod.rs::registry`（详见子目录 AGENTS.md）   |
| 新增 SQLite 表  | `db/migrations/<seq>_<name>.sql` + `db/<table>.rs`（详见子目录 AGENTS.md）     |
| 改窗口关闭行为  | `lib.rs::on_window_event`（main 窗口 minimize）                                |

## 反模式（明确禁止）

- 用 `eprintln!` / `println!` 打诊断。统一 `log::{info, warn, error}`。
- 在模块边界对 `keyring::Error` / `reqwest::Error` / `serde_json::Error` 调 `unwrap()`——用 `thiserror` 变体包起来再向上抛。
- `std::sync::Mutex` 保护 settings/snapshot 映射。`parking_lot::RwLock` 是项目约定（`state.rs`）。
- 另起轮询器。调度器是唯一的一个。
- 把 `reqwest` 原始错误直接 return（它会格式化 URL，泄漏端点形状）。用 `ProviderError::Upstream(format!("{status}: {body}"))`。
- 在 `providers/minimax.rs::PLACEHOLDER_ENDPOINT` 之外硬编码占位 URL。契约：默认 URL + 可覆盖 + 未升级前返回 `ProviderError::EndpointNotConfigured`。
- 在 SQLite migration 写 `DROP TABLE`——加列用 `ALTER TABLE`，重建表用 `migrations/<seq>_rebuild_<name>.sql` 走 sqlx migrate。
- 在 `commands.rs` 写业务逻辑——commands 只做参数提取 + 调用 `state.rs` 方法 + 错误映射。
- 把 `Secret<String>` 序列化成 JSON 推到前端——`Secret` 永不出 IPC 边界。

## 日志

**基础设施（ADR-0011）**：`tauri-plugin-log` 2.x + `log = "0.4"`，3 个 target（stdout + `%LocalAppData%\codeman-agent\logs\codeman-agent.log` + Webview），默认 `Info` 级（`lib.rs::run` 的 builder 显式调 `.level(log::LevelFilter::Info)`）。外部 crate（keyring / reqwest / sqlx）的 DEBUG 噪音默认被过滤。

**DEBUG 走环境变量**：

```powershell
$env:RUST_LOG = "keyring=debug,codeman_agent_lib=debug"
pnpm tauri:dev
```

不带 `=` 的 `=debug` 等价于全局。常见 pattern：`keyring=debug`（只开 keyring 内部 DEBUG）、`codeman_agent_lib=debug`（只开本 crate DEBUG）。

**IPC handler 日志强制约定（ADR-0018 D2）**：每个 `#[tauri::command]` 函数必须包含 3 类日志：

| 时机 | level | 位置 |
|------|-------|------|
| handler 进入 | `debug!` | 函数首行（param extraction 之后） |
| handler 成功 | `info!` | return Ok 之前 |
| handler 错误 | `warn!` 或 `error!` | `Err(AppError::...)` 构造前一行 |

- `AppError::NotFound` / `InvalidConfig` / `Unauthorized` / `SandboxViolation` → `warn!`
- `AppError::Upstream`（IPC 错误、DB 错误）→ `error!`

filesystem 5 命令（`read_file` / `write_file` / `edit_file` / `search_files` / `delete_file`）失败时**必须**带 `workspace_id` + `path` 字段；`SandboxViolation` 单独标注越界便于诊断 agent 路径错误。

**禁止（ADR-0018 D2 强化）**：

- ❌ 用 `eprintln!` / `println!` 打诊断（始终走 `log::{info, warn, error}`）
- ❌ 打印完整 `Provider` struct（避开 `api_key` 明文）；使用 `&provider` 会自动 Debug，但不写 Provider 到日志
- ❌ `.expose()` 取 `Secret<String>` 原文再 log（`Secret` 自动 Debug = `Secret(***)`，无需手动处理）
- ❌ `ProviderError::Upstream` 携带 URL（已 ADR-0003 规则）

**log message 语言**：按 ADR-0009 §4，`log::*!` 字符串一律中文。

**log rotation**：本期不实现。`tauri-plugin-log` 2.x 默认 LogDir 单文件 append，无轮转。V1 单机单用户使用频率下增长慢（每日 ~1MB）。开 ADR-0019 follow-up（按大小 / 按日 / tracing 升级 三选一）。

## 测试

```bash
cd src-tauri
cargo test                  # 全跑
cargo test providers::      # 单跑 provider（用 wiremock）
```

- Provider 集成测试用 `wiremock`（dev-dep）。见 `providers/<id>.rs::tests` 的三正例 + 反例 + 占位检查模式。
- 状态/调度器测试用 `#[cfg(test)]` 写 in-module。`is_breached`、`sanitized()` 等纯函数单测在 `state.rs::tests` / `settings.rs::tests`。
- DB 测试用 `sqlite::memory:` + `db::init(&pool)`。迁移幂等性有 `running_migrations_twice_is_idempotent` 守门（`db/mod.rs::tests`）。
