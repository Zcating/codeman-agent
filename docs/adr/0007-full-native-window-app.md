# ADR 0007 — 完整原生窗口应用 + TanStack Router 应用内路由

- Status: Accepted
- Date: 2026-06-13
- Scope: codeman-agent V1.5 形态
- Supersedes: ADR-0005（托盘 + 召唤窗口）
- Related: ADR 0001 (Tauri 2 + Solid.js 壳), ADR 0003 (Effect-TS 逻辑层), ADR 0006 (Tailwind v4 工具类样式)

## Context

codeman-agent V1 是一个托盘常驻应用，带无边框 widget 和独立的 settings 窗口。托盘是唯一始终可见的入口；关闭 widget 将其隐藏到托盘，唯一退出方式是托盘菜单。这种"召唤助手"的定义是为快速查找工具设计的，不适合用户期望在扩展聊天会话期间保持窗口打开的通用 LLM agent。

在 V1 后期 dogfooding 期间，几个问题变得明显。发现应用的可见线索为零——托盘图标在悬停之前是沉默的。无边框 widget 没有 OS 控件（没有最小化/最大化/关闭按钮可见），让 Windows 用户感到陌生。独立的 settings 窗口是一个重量级模式——一个单独的 OS 窗口仅用于设置造成了 IPC 复杂性，并打破了单一应用体验的沉浸感。全局热键保留给 V2，在 V1 中没有后备发现路径。

V1.5 的产品转型：以普通 Windows 桌面应用形式发货，出现在任务栏中，单个主窗口同时承载聊天和（通过应用内 TanStack Router 路由）设置视图。这用 V1 的"不可见直到被召唤"UX 换取了一个可被发现的任务栏存在和标准窗口语义。用户获得标准的关闭到任务栏行为；唯一退出方式是 File→Quit。

## Decision

V1.5 以**单个带 Tauri 菜单栏的原生主窗口**发货：

- 一个窗口，标签 `main`，默认 800×600，最小 600×400，启用 OS 装饰（标题栏 + ─ □ ✕ 按钮可见）。窗口是一个普通任务栏应用（`skipTaskbar: false`）。
- 主窗口承载一个 **TanStack Router** 路由树，包含两个路由：
  - `/` — 聊天视图（现有 `ChatView` 内容 + 底部"Settings"链接）
  - `/settings` — 设置视图（替换主内容；使用返回链接回到 `/`）
- 设置视图是主窗口内的路由，**不是**独立的 Tauri 窗口。之前的独立 `settings` Tauri 窗口被移除。
- **关闭主窗口（X 按钮）**触发 `WindowEvent::CloseRequested`，调用 `prevent_close()` + `minimize()`。窗口回到任务栏。应用进程保持存活。
- **退出应用**通过原生 Tauri 菜单：`File → Quit (Ctrl+Q)`。这是唯一调用 `app.exit(0)` 的地方。
- **无托盘图标。** 之前的托盘（带动态 idle/thinking/error 状态）被完全移除。窗口的任务栏存在替换了托盘的"始终可见"角色。
- **无全局热键。** 之前的 `tauri-plugin-global-shortcut` 依赖被移除。应用内热键（Enter 发送等）不在 V1.5 范围内。
- 窗口位置仍通过 `tauri-plugin-window-state` 记住（从 V1 继承）。
- `start_at_login` 自动启动保留（从 V1 继承）。
- 设置结构删除 3 个不再适用的 V1 字段：`start_minimized`、`close_behavior`、`hotkeys`。Rust `CloseBehavior` 枚举和 `HotkeySettings` struct 被删除。

### 路由（TanStack Router）

我们使用 **TanStack Router**（`@tanstack/solid-router`，code-based 路由）进行应用内导航：
- `@tanstack/solid-router` 1.170.15 是当前版本，与 Solid 1.9.3 兼容
- Code-based 路由（无 Vite 插件）—— 路由树在 `src/router.ts` 中用 `createRootRoute` + 2 个 `createRoute` 子节点构建
- `createBrowserHistory()` 是历史实现；Tauri 2 单窗口 + Vite SPA fallback 处理其余部分
- `RouterProvider` 挂载在 `src/index.tsx`（替换之前的直接 `ChatView` 挂载）
- 路由组件位于 `src/routes/`：`__root.tsx`、`index.tsx`、`settings.tsx`
- 底部"Settings"链接使用 TanStack Router 的 `<A href="/settings">` 组件进行 active-state 样式化

## Considered options

- **G1（拒绝）— 保持 V1 形态（托盘 + 召唤窗口），仅为应用内设置路由添加 TanStack Router。** 最小改动，但不解决核心"无可见线索 / 无边框窗口"问题。用户明确拒绝了此方案。
- **G2（已选）— 完整原生单窗口应用 + TanStack Router 进行应用内设置。** 主窗口是普通任务栏应用；设置是其内部的路由。关闭用 `prevent_close` + `minimize`；退出用 File 菜单。无托盘。
- **G3（拒绝）— 完整原生单窗口应用，settings 保持独立 Tauri 窗口。** 先尝试，然后合并到 G2。两个窗口增加 IPC 复杂性（跨窗口状态），且使"替换主内容为设置"的 UX 在没有第三个窗口的情况下不可能实现。路由是更清晰的抽象。
- **G4（拒绝）— 完整原生应用，主窗口带标签栏（Chat | Settings 标签）。** 标签可行，但随着新视图的到来（per-conversation 路由等），每个关注点一个完整路由扩展性更好。

路由选项：
- **R1（拒绝）— 保持基于哈希的路由（`location.hash`）。** V1 已在使用（通过 `ChatView`）。TanStack Router 添加类型化路由、`<A>` active-state 和嵌套布局——这些都是基于哈希的路由无法提供的。
- **R2（已选）— TanStack Router（code-based）。** 类型安全、active link 样式化、无需 Vite 插件。Bundle 大小小（~15KB gzip）。
- **R3（拒绝）— `@solidjs/router`（SolidStart 背书的路由）。** 更简单、更小，但缺少类型化路由、基于文件的路由 ergonomics 和更广泛的 TanStack 生态（start/table 等，V2 可能需要）。
- **R4（拒绝）— 通过 `@tanstack/router-plugin`（Vite）的基于文件的路由。** 对大型应用更符合习惯，但增加了要维护的 Vite 插件和要学习的 `routes/` 目录布局。在 V1.5 规模（2 个路由）下 code-based 足够。

## Consequences

- 主窗口打开时始终在 Windows 任务栏中可见。这用 V1 的"不可见直到被召唤"UX 换取了一个可被发现的应用图标和标准的关闭到任务栏行为。
- 关闭窗口不再隐藏到托盘；它最小化到任务栏。用户重新训练从"点击 X 解散"到"点击 X 停放"。File→Quit 菜单是明确的退出路径。
- 独立的 `settings` Tauri 窗口被移除。它依赖的 5 个 IPC 命令（`get_widget_position`、`set_widget_position`、`hide_widget_window`、`show_widget_window`、`show_settings_window`）也被移除。其余 25 个 IPC 命令不受影响。
- `Settings` struct 失去 3 个 V1 字段（`start_minimized`、`close_behavior`、`hotkeys`）。Rust `CloseBehavior` 枚举和 `HotkeySettings` struct 被删除。现有的 on-disk settings.json 文件将通过 `#[serde(default)]` 反deserialize 到剩余字段；移除的字段在加载时被简单忽略。
- `tray.rs` 和 `hotkeys.rs` 模块被删除。`apply_autostart` 移入 `lib.rs`。三个托盘 `.ico` 资源被移除。
- `tauri-plugin-global-shortcut` 和 `tray-icon` Tauri 特性从 `Cargo.toml` 中移除。其余 7 个插件（store、log、notification、autostart、window-state、opener 和 tauri 本身）保留。
- `tauri-plugin-window-state` 插件（记住窗口位置/大小）保留——与用户移动的单个主窗口相关。
- 所有现在已死的 5 个插件能力条目（`core:window:allow-hide`、`global-shortcut:allow-register`、`global-shortcut:allow-unregister`、`global-shortcut:allow-is-registered`）从 `capabilities/default.json` 中移除。`windows` 列表从 `["widget", "settings"]` 缩减到 `["main"]`。
- 前端变更（后续）：`src/index.tsx` 挂载 `<RouterProvider>`；`src/router.ts` 定义路由树；`src/routes/__root.tsx` 是裸布局；`src/routes/index.tsx` 在带有 Sidebar 和底部"Settings"链接的 `ChatLayout` 中包装 `ChatView`；`src/routes/settings.tsx` 是全页设置（从删除的 `settings-modal.tsx` 提取）；删除的 `settings-modal.tsx` 被替换。
- `ChatView` 组件简化：不再嵌入 `<Sidebar />`（现在在路由布局中）且不再处理 `location.hash` 路由。
- 未来维护者迁移说明：如果用户从 V1 更新到 V1.5，他们的 settings.json 无害地保留 3 个已移除字段（serde 默认忽略未知字段）。V1.5 设置面板不再暴露它们。
- 用户不再可能"丢失"应用：窗口打开时任务栏图标始终存在，File→Quit 菜单是唯一退出点。这对 V1 仅托盘的可发现性是一个有意义的改进。

## References

- TanStack Router for Solid: https://tanstack.com/router/latest/docs/framework/solid/overview
- TanStack Solid Router npm: https://www.npmjs.com/package/@tanstack/solid-router
- Tauri 2 menus: https://v2.tauri.app/learn/window-menu/
- Tauri 2 window APIs: https://v2.tauri.app/learn/window-customization/
- Tauri 2 minimize: see `tauri::Window::minimize` (WindowExt trait)
- ADR-0005（被本 ADR 取代的形态）：`docs/adr/0005-tray-form-factor-no-hotkeys.md`
