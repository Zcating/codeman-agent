# src-tauri/ — 后端 (Rust + Tauri 2)

Rust 壳:Tauri 运行时、插件、IPC 命令、调度器、域逻辑。前端只通过命令名、事件名、以及 `types.rs` 里序列化好的形状跟它打交道,看不见内部实现。

## 目录布局

```
src-tauri/
├── Cargo.toml
├── tauri.conf.json        # 两个窗口:widget(无边框)+ settings
├── build.rs
├── capabilities/default.json
├── icons/                 # 安装包 + 托盘图标
└── src/
    ├── main.rs            # 极简:转发到 lib::run()
    ├── lib.rs             # 插件注册 + 启动 + handler 列表
    ├── commands.rs        # #[tauri::command] IPC 入口
    ├── types.rs           # 域类型(ProviderId、Snapshot、Secret…)
    ├── state.rs           # AppState——共享内存图
    ├── settings.rs        # Settings 结构 + sanitized
    ├── secrets.rs         # keyring 包装(Windows 凭据管理器)
    ├── scheduler.rs       # 单一异步轮询循环
    ├── hotkeys.rs         # 和弦解析 + 插件注册
    ├── tray.rs            # 托盘图标 + 菜单 + 窗口显隐
    └── providers/         # Provider trait + 各厂商适配器
```

## 硬性规则

- **每个新 IPC 命令必须有 TS 包装。** Rust 侧以 `lib.rs::invoke_handler` 列表为权威;`src/lib/tauri.ts` 是镜像。漂移 = 前端静默 bug。
- **`Secret<String>` 是唯一能装 API key 的类型。** `Debug` / `Display` 都被替换成 `***`。`secrets` 模块返回 `Option<String>`——**在 `state.rs::fetch_provider` 那一行立刻用 `Secret::new` 裹起来**,裸 `String` 不准越过那行。
- **设置写入走 `state.apply_settings`**(内部调 `Settings::sanitized()`)**再 `state.persist_settings()`。** 跳过 sanitized 就让用户能输入 0 秒间隔把调度器打满。
- **热键重绑即时生效。** `apply_settings` 检测到和弦集合变化时调 `crate::rebind_hotkeys`。**不要**要求用户重启才能用新和弦。
- **调度器是单一异步任务。** 在 `lib.rs::setup` 里 spawn 一次。**不要**再起别的轮询循环,所有轮询都通过 `wakeup: Notify` 通道。
- **`fetch_active` 是调度器唯一入口。** 永远不要加第二条轮询路径。非激活厂商保持冷态。

## 模式

- **`AppState` 实现 `Clone`**(所有字段都是 `Arc` / `parking_lot` 守卫)。把 clone 传进后台任务和 `tauri::State`。变更走局部写守卫,不要用 `Mutex<AppState>`。
- **调度器用 `tokio::select!` 把 fetch 跟两个定时器赛跑。** 任何分支都 `yield_now` 然后回到循环——被丢弃的 fetch future 会取消正在进行的 HTTP 请求。这是"切换时中止飞行中请求"性质成立的原因。
- **适配器响应一律包成 `SnapshotEnvelope`——即便出错也包。** 这样前端不用特判"数据缺失",能统一渲染过期/空状态。见 `state.rs::fetch_provider`。
- **`is_breached` 是 `(Snapshot, Settings) → bool` 的纯函数。** 测试在 `state.rs::tests` 里。阈值变更在下一次 fetch 生效,不需要实时订阅。
- **托盘是 Windows 上唯一的常驻入口。** 左键切显隐,右键弹菜单(设置 / 显示 / 隐藏 / 退出)。widget 被 taskbar 跳过,托盘是用户唯一永远可见的入口。
- **设置窗关闭走 `prevent_close` + hide**(`lib.rs::on_window_event`),widget 继续跑。**退出**只走托盘 Quit 处理器。

## 查阅指南

| 任务 | 文件 |
|---|---|
| 新增 Tauri 命令 | `commands.rs` + `lib.rs::invoke_handler!` |
| 新增域枚举/变体 | `types.rs`(镜像到 `src/lib/types.ts`) |
| 新增设置项 | `settings.rs::Settings` + `sanitized()` + `Default` |
| 改轮询行为 | `scheduler.rs`——不要拆循环 |
| 新增系统通知 | `state.rs::fire_threshold_notification` |
| 接入新插件 | `lib.rs::run` + `Cargo.toml` + `capabilities/default.json` |
| 新增厂商 | `providers/<name>.rs` + `providers/mod.rs::registry`(详见该子目录 AGENTS.md) |

## 能力清单 (`capabilities/default.json`)

两个窗口共用 `default` capability。关键授权:

- `core:window:allow-set-position` / `allow-set-size`——拖动/调整 widget
- `core:event:default`——监听 `snapshot-updated` 等
- `global-shortcut:allow-register` / `allow-unregister`——热键
- `notification:default` + `allow-notify`——系统托盘告警
- `autostart:allow-enable` / `allow-disable`——开机自启
- `log:default`——`tauri-plugin-log` 输出
- `window-state:default`——窗口位置/尺寸持久化
- `store:default`——设置 JSON
- `opener:default`——`tauri-plugin-opener`(从设置里跳外链?)

新增权限需要重建 `gen/schemas/` 里的能力 schema。`tauri-plugin-log` 默认 `info` 级,要 `debug` 走环境变量。

## 反模式(明确禁止)

- 用 `eprintln!` / `println!` 打诊断。统一用 `log::{info, warn, error}`。
- 在模块边界对 `keyring::Error` / `reqwest::Error` / `serde_json::Error` 调 `unwrap()`——用 `thiserror` 变体包起来再向上抛。
- 用 `std::sync::Mutex` 保护 settings/snapshot 映射。`parking_lot::RwLock` 是项目约定(`state.rs`)。
- 另起轮询器。调度器是唯一的一个。
- 把 `reqwest` 原始错误直接 return(它会格式化 URL,会泄漏端点形状)。用 `ProviderError::Upstream(format!("{status}: {body}"))`,只带 body 不带 URL。
- 在 `providers/minimax.rs::PLACEHOLDER_ENDPOINT` 之外硬编码占位 URL。契约是:一个默认 URL、可被覆盖、未升级前返回结构化错误。
- 在托盘 Quit 处理器之外调 `app.exit(0)`。`prevent_close` 窗口处理器依赖 App 在 widget 运行时保持存活。
