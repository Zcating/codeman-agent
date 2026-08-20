# Product

## Register

product

## Users

中文独立开发者与效率玩家。在 Windows 桌面长时间工作,把"快提词"当成肌肉记忆;预期延迟以毫秒计,反感任何"AI 工具"的居中紫色欢迎卡、emoji 弹雨、营销腔。常驻显示器右下角或第二屏,作为终端 / IDE / 浏览器之外的"第四个面板"出现。

## Product Purpose

codeman-agent 是 Windows 原生 AI Agent 桌面应用。V1 唯一交付:

- 单 Tauri 主窗口内提供 LLM 流式对话(Markdown 渲染,工具调用可视化)
- 会话持久化到 SQLite(FTS5 全文搜索)+ Windows Credential Manager 管 API key
- 三态主题(light / dark / system),默认跟系统

成功 = 用户的"打开 → 发消息 → 看 tool result → 关"路径在 ≤ 1.5s 内完成首次反馈,流式更新 ≤ 200ms。

## Brand Personality

高效、冷静、专业。声音像终端提示符:不寒暄,不解释自己,不堆 emoji,不为 AI 道歉。

- **高效**:每个像素 / 动效 / 文案都该挣到自己的位置
- **冷静**:violet 主色中度使用,不饱和溢出;不闪动 / 不 bounce / 不 gamification
- **专业**:跟系统主题走,信任用户,克制装饰(无渐变文 / 无 hero-metric / 无 eyebrow 标号)

## Anti-references

- **不要做成 ChatGPT 居中紫色欢迎卡 + hero 输入区**——2026 AI 工具的第一反射
- **不要做成 Notion / Webflow 那种"全黑侧栏 + emoji 弹 + 营销腔"**——本产品是工具,不是协作平台
- **不要做成 VSCode / Cursor 套壳的三面板 IDE 形态**——codeman-agent 是聊天 + 工具调用,不是 IDE
- **不要 cream / sand 暖白 body bg**——AI 项目的 2026 第二反射,显得泛泛
- **不要渐变文 / 玻璃拟物 / 草绘 SVG 插画**——都属于装饰空转
- **不要 side-stripe border / numbered eyebrows / kicker 小字 ALL-CAPS**——AI scaffold 三大 tell

## Design Principles

1. **Performance as design**: 延迟本身就是美学。首次 token ≤ 1.5s,流式更新 ≤ 200ms。
2. **Density without clutter**: Sidebar / 消息区 / 输入区 / footer 四区明确分区;窄而深,Raycast 节奏。
3. **Theme-integrity over theme-decor**: violet 主色以 token 形式贯穿,light/dark 一致,不大块铺面;状态色靠 border + bg 而不是饱和度。
4. **Trust the user**: 不解释功能、不堆 emoji 提示、不堆 success 弹窗;出错时只 console.error,UI 静默。
5. **CJK-first**: Noto Sans SC 与 Inter 同权,中英文混排节奏跟 JetBrains Mono 工具调用卡片配对协调;行高 / 字距按 CJK 优化。

## V4 Runtime

V4 运行时基于 `@earendil-works/pi-coding-agent` (≥ 0.84.x)。V4 无 workspace 沙箱 / permission 模型——工具以当前用户权限直接执行。V4 会话存储为 JSONL 文件于 `cwd/.pi/sessions/`，V3 SQLite conversations 不迁移。V4 Provider 配置由 pi ModelRuntime 管理（`auth.json`），V3 electron-store settings.json providers schema 已删除。

## Accessibility & Inclusion

- **WCAG 2.1 AA 起步**:body text 4.5:1,大文本 3:1,focus 状态 3:1
- **三态主题尊重 `prefers-color-scheme`**:夜间不烧眼(violet 不铺满大块面,中度使用)
- **完整键盘导航**:Tab/Shift+Tab focus 可见;Enter 发消息;Esc 取消流;Up/Down 选会话;Delete 删会话
- **focus ring 始终可见**:2px primary-500 outline + 2px offset,不被 border 替代
- **动效尊重 `prefers-reduced-motion: reduce`**:状态变化退化为 crossfade 或瞬切
- **emoji 仅在 tool-call 状态短暂使用**(⏳ 运行中 / ✓ 成功 / ✗ 失败),对话与按钮文字零 emoji
- **API key 永不反射回 DOM**;密码字段永远不回显已存值
