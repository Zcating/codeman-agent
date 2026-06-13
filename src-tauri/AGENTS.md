# src-tauri/ — 后端 (Rust + Tauri 2)

Rust 壳：Tauri 运行时、8 个插件、27 个 IPC 命令、单调度器轮询循环、SQLite 持久化、计费厂商适配。前端只通过命令名、事件名、以及 `types.rs` 里序列化好的形状跟它打交道，**看不见内部实现**。

## 目录布局

```
src-tauri/
├── Cargo.toml             # edition 2021, MSRV 1.77；tauri 2 + sqlx 0.8 + keyring 3
├── tauri.conf.json        # 两窗口:widget (800×600, 无边框) + settings (540×640)
├── build.rs
├── capabilities/
│   └── default.json       # 两窗口共享 ACL
├── icons/                 # 19 个图标（3 托盘 + 16 应用）
├── gen/schemas/           # Tauri 生成的 capability schema（自动）
└── src/
    ├── main.rs            # 5 行：转发到 lib::run()
    ├── lib.rs             # crate 根：8 插件注册、27 命令 invoke_handler!、setup、on_window_event
    ├── commands.rs        # 27 个 #[tauri::command] IPC 入口（按任务分组）
    ├── types.rs           # 域类型：ProviderId, Snapshot, Secret, AppError, ProviderKind, ProviderDescriptor
    ├── state.rs           # AppState：Clone + Arc + parking_lot::RwLock 守卫
    ├── settings.rs        # Settings (25+ 字段) + sanitized() + Default + CloseBehavior
    ├── secrets.rs         # keyring 包装 (billing provider API key)
    ├── secrets_llm.rs     # LLM API key 存储（走 tauri-plugin-store）
    ├── scheduler.rs       # 单一异步轮询循环（tokio::select! + yield_now）
    ├── hotkeys.rs         # 和弦解析 + tauri-plugin-global-shortcut 注册
    ├── tray.rs            # 托盘图标 + 菜单 + 窗口显隐 + autostart 应用
    ├── events.rs          # Tauri 事件发射助手
    ├── providers/         # Provider trait + 各厂商适配器（详见子目录 AGENTS.md）
    └── db/                # SQLite + FTS5 持久化（详见子目录 AGENTS.md）
```

## 27 个 IPC 命令（按任务分组）

| 分组 | 命令 | 用途 |
|---|---|---|
| **V0 Provider** | `list_providers` `get_active_provider` `set_active_provider` `force_refresh` | 旧版计费 provider 操作 |
| **V0 Settings** | `get_settings` `update_settings` `set_api_key` `has_api_key` `test_provider` | 旧版设置 + 密钥 |
| **V0 Snapshot** | `latest_snapshot` `get_widget_position` `set_widget_position` | V0 快照 + widget 位置 |
| **V0 Window** | `show_settings_window` `hide_widget_window` `show_widget_window` | 窗口显隐 |
| **T12 会话** | `list_conversations` `get_conversation` `create_conversation` `archive_conversation` `delete_conversation` | 对话 CRUD |
| **T12 消息** | `list_messages` `append_message` `search_messages` | 消息 CRUD + FTS5 搜索 |
| **T13 计费** | `get_provider_snapshot` `list_billing_providers` `has_billing_key` `set_billing_key` | billing 工具桥接 |
| **T22 设置+密钥** | `clear_all_history` `set_llm_key` `has_llm_key` | LLM key + 清空 |

权威列表在 `src-tauri/src/lib.rs::invoke_handler!`；TS 镜像在 `src/lib/tauri.ts`。**两边漂移 = 前端静默 bug**。

## 硬性规则

- **每个 IPC 命令必须有 TS 包装。** Rust 侧 `lib.rs::invoke_handler!` 是权威；`src/lib/tauri.ts` 的 `invoke<T>()` + Service Tag 是镜像。修改顺序：先 Rust，后 TS，**同步提交**。
- **`Secret<String>` 是唯一装 API key 的类型。** `Debug` / `Display` 都被替换成 `***`（`types.rs::Secret`）。`secrets` / `secrets_llm` 模块返回 `Option<String>`——**在 `state.rs::fetch_provider` 那一行立刻用 `Secret::new` 裹起来**，裸 `String` 不准越过那行。
- **设置写入走 `state.apply_settings`**（内部调 `Settings::sanitized()`）**再 `state.persist_settings()`**。**不要**绕过 `sanitized()`，否则用户能输入 0 秒间隔把调度器打满。
- **热键重绑即时生效。** `apply_settings` 检测到和弦集合变化时调 `crate::rebind_hotkeys`（`lib.rs`）。**不要**要求用户重启。
- **调度器是单一异步任务。** `lib.rs::setup` 里 `tauri::async_runtime::spawn` 一次。**不要**再起别的轮询循环，所有唤醒都通过 `wakeup: tokio::sync::Notify` 通道。
- **`fetch_active` 是调度器唯一入口。** 永远不要加第二条轮询路径。非激活厂商保持冷态。
- **AppState 实现 Clone。** 所有字段都是 `Arc` / `parking_lot` 守卫。clone 传后台任务和 `tauri::State`；变更走局部写守卫，**不要** `Mutex<AppState>`。
- **`Provider::fetch` 是 `secret.expose()` 唯一调用点。** 其他地方对 secret 用 `&secret` 即可，**不要** `.expose()` 出函数外。
- **`ProviderError::Upstream` 只带 body 不带 URL。** `format!("{status}: {body}")`——URL 泄漏是低风险指纹但无意义。

## 模式

- **调度器用 `tokio::select!` 把 fetch 跟两个定时器赛跑。** 任一分支先 `yield_now` 再回到循环——被丢弃的 fetch future 会取消正在进行的 HTTP 请求。这是"切换时中止飞行中请求"性质成立的原因。
- **适配器响应一律包成 `SnapshotEnvelope`——即便出错也包。** 前端不用特判"数据缺失"，能统一渲染过期/空状态。见 `state.rs::fetch_provider`。
- **`is_breached(Snapshot, Settings) -> bool` 是纯函数。** 测试在 `state.rs::tests`。阈值变更在下一次 fetch 生效，不需要实时订阅。
- **托盘是 Windows 上唯一的常驻入口。** 左键切显隐，右键弹菜单（设置 / 显示 / 隐藏 / 退出）。widget 被 `skipTaskbar: true` 跳过任务栏，托盘是用户唯一永远可见的入口。
- **设置窗关闭走 `prevent_close` + hide**（`lib.rs::on_window_event`），widget 继续跑。**退出**只走托盘 Quit 处理器。
- **widget 关闭行为由 `Settings::close_behavior` 决定。** `HideToTray` → `prevent_close + hide`；`Quit` → 允许关闭（App 退出）。
- **Event 总线在 `events.rs`。** 当前用 `SnapshotUpdated` 推到前端；新增事件 = 在 `events.rs` 加 helper + 在 capabilities 加 `core:event:default`（已有）。

## 能力清单 (`capabilities/default.json`)

两窗口共用 `default` capability。关键授权：

- `core:window:allow-set-position` / `allow-set-size`——拖动/调整 widget
- `core:event:default`——监听 `snapshot-updated` 等
- `global-shortcut:allow-register` / `allow-unregister`——热键
- `notification:default` + `allow-notify`——系统托盘告警
- `autostart:allow-enable` / `allow-disable`——开机自启
- `log:default`——`tauri-plugin-log` 输出
- `window-state:default`——窗口位置/尺寸持久化
- `store:default`——设置 JSON
- `opener:default`——`tauri-plugin-opener`（从设置跳外链？）

新增权限需要重建 `gen/schemas/` 里的能力 schema。`tauri-plugin-log` 默认 `info` 级，要 `debug` 走环境变量。

## 查阅指南

| 任务 | 文件 |
|---|---|
| 新增 Tauri 命令 | `commands.rs` + `lib.rs::invoke_handler!`（**先两边同时改**） |
| 新增域枚举/变体 | `types.rs`（镜像到 `src/lib/types.ts`） |
| 新增设置项 | `settings.rs::Settings` + `sanitized()` + `Default`（**先 Rust**，再 TS 镜像） |
| 改轮询行为 | `scheduler.rs`——**不要**拆循环 |
| 新增系统通知 | `state.rs::fire_threshold_notification` |
| 接入新插件 | `lib.rs::run` + `Cargo.toml` + `capabilities/default.json` |
| 新增厂商 | `providers/<name>.rs` + `providers/mod.rs::registry`（详见子目录 AGENTS.md） |
| 新增 SQLite 表 | `db/migrations/<seq>_<name>.sql` + `db/<table>.rs`（详见子目录 AGENTS.md） |
| 改窗口关闭行为 | `lib.rs::on_window_event` + `settings.rs::CloseBehavior` |
| 改托盘菜单 | `tray.rs::build_tray` + `tray.rs::on_tray_event` |

## 反模式（明确禁止）

- 用 `eprintln!` / `println!` 打诊断。统一 `log::{info, warn, error}`。
- 在模块边界对 `keyring::Error` / `reqwest::Error` / `serde_json::Error` 调 `unwrap()`——用 `thiserror` 变体包起来再向上抛。
- `std::sync::Mutex` 保护 settings/snapshot 映射。`parking_lot::RwLock` 是项目约定（`state.rs`）。
- 另起轮询器。调度器是唯一的一个。
- 把 `reqwest` 原始错误直接 return（它会格式化 URL，泄漏端点形状）。用 `ProviderError::Upstream(format!("{status}: {body}"))`。
- 在 `providers/minimax.rs::PLACEHOLDER_ENDPOINT` 之外硬编码占位 URL。契约：默认 URL + 可覆盖 + 未升级前返回 `ProviderError::EndpointNotConfigured`。
- 在托盘 Quit 处理器之外调 `app.exit(0)`。`prevent_close` 窗口处理器依赖 App 在 widget 运行时保持存活。
- 在 SQLite migration 写 `DROP TABLE`——加列用 `ALTER TABLE`，重建表用 `migrations/<seq>_rebuild_<name>.sql` 走 sqlx migrate。
- 在 `commands.rs` 写业务逻辑——commands 只做参数提取 + 调用 `state.rs` 方法 + 错误映射。
- 把 `Secret<String>` 序列化成 JSON 推到前端——`Secret` 永不出 IPC 边界。

## 日志

`%LocalAppData%\codeman-agent\logs\codeman-agent.log`（`tauri-plugin-log`，3 个 target：stdout + LogDir + Webview）。默认 `info` 级，要 `debug` 走 `RUST_LOG=debug pnpm tauri:dev`。

## 测试

```bash
cd src-tauri
cargo test                  # 全跑
cargo test providers::      # 单跑 provider（用 wiremock）
```

- Provider 集成测试用 `wiremock`（dev-dep）。见 `providers/<id>.rs::tests` 的三正例 + 反例 + 占位检查模式。
- 状态/调度器测试用 `#[cfg(test)]` 写 in-module。`is_breached`、`sanitized()` 等纯函数单测在 `state.rs::tests` / `settings.rs::tests`。
- DB 测试用 `sqlite::memory:` + `db::init(&pool)`。迁移幂等性有 `running_migrations_twice_is_idempotent` 守门（`db/mod.rs::tests`）。
