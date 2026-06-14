# ADR 0001 — Tauri 2 + Solid.js

- Status: Accepted
- Date: 2026-06-09
- Scope: codeman-agent v1 客户端技术栈

## Context

codeman-agent v1 以单一小型 always-on-top 浮动 widget 形态分发，
附带 Windows 上的模态 settings 窗口。代码库需要：

1. 绘制小型（~280x100）无边框窗口，跨显示器拖动，并始终置顶。
2. 定时调用 provider REST 端点，解析 JSON，在内存中持有结果，
   在新数据落地时推送更新到 UI。
3. 将 API 密钥存入 Windows Credential Manager，其他设置存
   app data 下的纯 JSON 文件。
4. 当余额 / 用量低于阈值时弹出系统通知。
5. 以 MSI / NSIS 安装包形式分发，不强制每用户附带 Chromium
   runtime。

## Decision

壳使用 **Tauri 2 (Rust)**，UI 使用 **Solid.js + TypeScript**，
Vite 构建。

### Why Tauri

- 原生 Windows 窗口控制（无边框、always-on-top、隐藏任务栏），
  无需手写 Win32 代码。
- 一级插件覆盖我们已存在的横切需求：
  - `tauri-plugin-store` —— settings JSON
  - `tauri-plugin-global-shortcut` —— 热键
  - `tauri-plugin-notification` —— 系统通知
  - `tauri-plugin-autostart` —— 开机自启
  - `tauri-plugin-log` —— 日志轮转
- Rust 侧是密钥（`keyring` crate → Windows Credential Manager）
  与 HTTP 轮询（`reqwest` + `tokio`）的天然归属。

### Why Solid.js

- 280x100 widget 的 DOM 极小。Solid 的细粒度响应式正好匹配
  规模：无 VDOM、无 re-render churn，signal 直接映射到我们关心
  的四块状态（`snapshot`、`lastUpdated`、`isStale`、
  `isRefreshing`）。
- TypeScript 优先；与类型化 Rust IPC 契约对齐。
- 比 React / Vue 运行时小，对每次开机自启的 widget 至关重要。

### Why not...

- **Electron** —— 每用户附带 Chromium，对单一小型 widget 来说
  安装体积和启动时间都受损。
- **Wails / Go** —— v1 在 Windows 原生窗口装饰和全局快捷键上
  偏弱。
- **纯 Win32 + WinUI** —— v1 范围内样板代码过多；Tauri 已经
  提供我们需要的原生脚手架。

## Consequences

- 双语言工具链（Rust + TypeScript）。通过两侧类型化 IPC 命令
  缓解（Rust `serde::Serialize` / `Deserialize` 与
  `src/lib/tauri.ts` 中的 TypeScript interface 镜像）。
- Windows 优先。Linux / macOS 移植在 Tauri 层面可移植，但 v1
  不在范围内。
- 我们承诺 settings 使用 `tauri-plugin-store` JSON 语义；如果
  未来需要更丰富的存储，将另开 ADR 评估。

## References

- Tauri 2 文档：https://v2.tauri.app/
- Solid.js：https://www.solidjs.com/
- `keyring` crate：https://docs.rs/keyring/
