# ADR 0005 — 托盘 + 召唤窗口，V1 无热键

- Status: Superseded by ADR-0007 (2026-06-13)
- Date: 2026-06-13
- Scope: codeman-agent V1 形态
- Supersedes: 隐式 V0 形态（280×100 始终置顶浮动 widget）—— V1 完全放弃该形态。
- Related: ADR 0001 (Tauri 2 + Solid.js 壳)

## Context

codeman-agent V0 是一个 280×100 始终置顶的浮动 widget，显示单个计费快照。产品转型（通用 LLM agent，见 CONTEXT.md）使该形态过时：多轮聊天 + 工具调用 + 流式输出需要真正的屏幕空间；永久置顶于所有窗口之上的小 widget 对同时使用其他应用的用户是敌意的。

我们需要 V1 形态满足：
- 不全屏占用屏幕。
- 任意位置单次操作即可召唤。
- 多显示器和 DPI 缩放兼容性好。
- 读起来是一个连贯的产品，不是系统托盘版的 ChatGPT 桌面。

## Decision

V1 以**系统托盘应用 + 召唤窗口**发货（"F1"形态）：
- 像素风托盘图标（"G2"美学）始终位于 Windows 通知区域。
- 点击托盘图标切换单个主窗口（默认 800×600，最小 600×400，位置记住）。
- 关闭窗口隐藏到托盘；应用保持运行。托盘是"真正的"家。
- 托盘图标是**动态的**（"T2"）：显示 idle / thinking / error 状态，agent 工作时有脉冲动画。
- V1 **零热键**（设计讨论中的选项 B）。所有操作通过鼠标：托盘点击切换、按钮点击发送、按钮点击打开设置。`tauri-plugin-global-shortcut` 保留在 V2 依赖中；`hotkeys` 设置字段保留但 V1 用户不可编辑。
- 设置是主窗口上的标签页模态：LLM / App / Window / Billing / Advanced。

## Considered options

- **F1（已选）— 托盘 + 召唤窗口。** 释放 UI 免于 280×100 设计负担。熟悉模式（Slack、Discord、Spotify）。多显示器友好。
- **F2 — Spotlight / 命令栏。** 拒绝。无法承载多轮对话、工具调用可视化或代码块。对"通用"agent 来说是错误的工具。
- **F3 — 侧边栏 / 抽屉。** 拒绝。跨显示器行为差、占用固定屏幕边缘、动画复杂度高。
- **F4 — 围绕 pi-web 的 Tauri webview 包装器。** 拒绝。功能上与 F1 相同，但失去了为应用内 UI 定制以适配产品的机会。

托盘图标：
- **T1（拒绝）— 静态图标。** 错过了在不影响额外屏幕的情况下呈现 agent 状态的机会。
- **T2（已选）— 动态图标反映 agent 状态。** 用户一目了然地知道 agent 是在工作、空闲还是处于错误状态。
- **T3（拒绝）— 静态图标 + 数字徽章。** IM 风格未读计数器对 agent 来说是错误的隐喻。

图标风格：
- **G1（拒绝）— 几何 / Solid 对齐。** 简洁但普通。
- **G2（已选）— 像素风。** 在满是平面现代图标的托盘中脱颖而出；符合"小而精、系统管理员相邻"的目标用户。16×16 / 32×32 / 256×256 ICO 帧。
- **G3（拒绝）— 文字 logo。** 品牌名变更强制重绘；在小尺寸下辨识度低。

V1 热键：
- **A（拒绝）— 保留固定应用内热键（Enter 发送、Shift+Enter 换行、Ctrl+F 搜索）。标准但与下面的"V1 鼠标驱动"决策冲突。
- **B（已选）— 零热键。** V1 完全鼠标驱动。每个操作都有按钮。`tauri-plugin-global-shortcut` 保留在 V2 依赖中；V2 计划添加三个全局热键（切换窗口、新建会话、打开设置）并恢复应用内固定热键。

## Consequences

- 产品定义从"始终可见仪表盘"切换到"召唤助手"。用户需要重新训练习惯循环。设置 UI 在一次性入门说明中呈现这一点（V1 不带正式入门发货；托盘图标的 tooltip 带有提示）。
- `src-tauri/Cargo.toml` 保留 `tauri-plugin-global-shortcut` 但 V1 代码不调用它。清理未使用插件的 PR 将被拒绝。
- 设置 schema 的 `hotkeys` 字段存在（默认值：`Ctrl+Alt+A`、`Ctrl+N`、`Ctrl+,`），但 V1 UI 显示为只读弃用部分。
- 主窗口的 WebView 是 Solid 渲染的唯一位置。无始终置顶窗口；无透明区域；无点击穿透。用户像标准应用窗口一样移动窗口。
- 用户仍可能丢失窗口：右键托盘图标 → Show 将其切换回来。（没有"最小化到系统托盘"任务栏条目——托盘图标*就是*任务栏条目。）

## References

- Tauri tray icon API:
  https://v2.tauri.app/learn/window-customization/#tray-icon
- `tauri-plugin-global-shortcut`:
  https://v2.tauri.app/plugin/global-shortcut/
