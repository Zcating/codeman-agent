# ADR 0006 — Tailwind v4 utility-only 样式层

- Status: Accepted
- Date: 2026-06-13
- Scope: codeman-agent V1 前端样式层

## Context

codeman-agent 的前端处于 V0 widget → V1 chat agent 的过渡中,样式现状混乱:

1. **6 个组件命名了 BEM class** (`chat-view__main`、`bubble__content` 等),但
   只有 2 个组件 (`ChatView.tsx` / `Sidebar.tsx`) 在 JSX 的 `<style>{...}</style>`
   块里写了 ~180 行内联 CSS;另外 4 个组件 (`MessageBubble` / `SettingsModal` /
   `ProviderCard` / `ToolCallCard`) **完全裸 DOM**。
2. 现有的内联 CSS 形成了一致的"赛博朋克"风格 (深紫底 `#0f0f23` + Courier New
   等宽字体 + 2px 粗边框 + 亮蓝紫主色 `#4a4ae0`),但**没有 token 化** —— 颜色
   hex 在 N 处重复,改一次要全局搜替换。
3. V1 还没有设计语言 commit(顶层 `AGENTS.md` / `src/AGENTS.md` 互相矛盾,
   `src/AGENTS.md` 仍描述 V0 widget 形态;视觉决策散落在代码里)。
4. 主题支持 (`Settings.theme: "light" | "dark" | "system"`) 还没接到 UI。

需要在 V1 内一次性收口:**选一个 CSS 方案 + 建一套设计 token + 把 6 组件视觉
统一 + 接通主题切换**,而不是边做边长。

## Decision

**用 Tailwind v4 utility-only 写所有视觉**,token 通过 `@theme` 块在
`src/index.css` 里声明,组件 JSX 只写 utility class,不用 BEM、不写内联
`<style>` 块、不引入 CSS-in-JS。

### Token 设计

- **主色**:11 阶 OKLCH 自定义,锚点 `#8b5cf6` (Tailwind `violet-500`);
  组件写 `bg-primary-500` / `text-primary-600` 而不是 `bg-violet-500`。
- **中性色**:Tailwind 默认 `zinc` (冷灰,跟 violet 主色 hue 协调)。
- **语义色**:Tailwind 默认 `green-500` / `amber-500` / `red-500` (经典,
  WCAG 稳,生态同源)。
- **字体**:`Inter` (西方) + `Noto Sans SC` 简体子集 (中文),通过
  `@fontsource/inter` + `@fontsource/noto-sans-sc` 打包 (~300KB 一次性)。
- **圆角 / 间距 / 边框**:Tailwind 默认 spacing/radius scale,圆角用
  `rounded-md` / `rounded-lg` 替换现有 2px 硬方角。
- **视觉风**:从现有"赛博朋克" (深紫 + Courier + 粗 2px 边框) 全面重设计为
  Tailwind 默认风 (Inter + zinc + 圆角),主色用 violet。**这是有意识的视觉
  重做,不是 Tailwind 包装**(ChatView / Sidebar 的 ~180 行内联 CSS 整段
  删除,不是翻译)。

### 工具链

- `@tailwindcss/vite` 插件 (Vite-first,无 PostCSS / autoprefixer 中间层)
- 入口 CSS:`src/index.css`,通过 `import "./index.css"` 在 `src/index.tsx`
  顶部引入
- `@theme` 块 + `@layer base` + `@import "tailwindcss"` 都在入口 CSS 里

### 主题

- `Settings.theme` 三态 (`light` / `dark` / `system`) 通过 `<html>` 上加
  删 `.dark` class 切换
- `system` 模式在 `src/agent/store/theme.ts` (新文件) 用 Solid effect 监听
  `prefers-color-scheme` 媒体查询
- Tailwind v4 配置:`@custom-variant dark (&:is(.dark *))`

### BEM class

- **全部删除**,不保留作语义钩子。理由: BEM class 之所以存在,是因为对应
  一份外部 CSS 选择器表;没了 CSS 表, BEM 命名是"没有消费者的协议",纯历史
  包袱。
- 组件测试断言从 `toHaveClass("chat-view__main")` 改成 `toHaveClass("flex-1")`,
  跟 Tailwind 公共 API 对齐。

### 范围

一次到位:6 组件 + 6 测试 + 1 处内联 (`Sidebar.tsx:101` 的 `list-style: none`) +
入口 CSS 全部。

## Why not...

- **Tailwind v3** — PostCSS + autoprefixer 中间层老旧; Vite 集成不如 v4
  的 `@tailwindcss/vite` 插件干净; V1 零存量,无 v3 习惯要继承。
- **vanilla CSS + BEM** — BEM 命名 + 命名空间 + CSS 变量是手动管理 token
  的方式; Tailwind 的 `@theme` 等价物但 Vite 集成更紧,无运行时开销。
- **CSS Modules** — Vite 集成弱于 Tailwind v4; 类名局部作用域是 React 时代
  心智, Solid 组件树小、无强需求; 跟"utility-only"在心智上对立。
- **CSS-in-JS (styled-components / emotion)** — 运行时开销跟 Solid
  反应式叠加复杂度高; Tailwind v4 是构建时生成,零运行时。
- **保留现有内联 CSS + 改用 CSS 变量** — 不解决"4 组件裸 DOM"和"无 token"
  的根本问题; 仍是手动管理。

## Consequences

- **视觉层统一**: 6 组件用同一套 token,改色 / 改字 / 改圆角只动 `@theme`。
- **主题切换成本从 N 个 CSS 变量降到一行**: `<html class="dark">` 一处
  决定所有 utility 的 `dark:` 行为。
- **构建优化**: Vite 扫描 JSX 后按需生成 utility,无未用 CSS 进 bundle。
- **改回 CSS Modules / vanilla CSS 要重写 6 组件 + 6 测试 + 1 入口 CSS**,
  工作量 1-2 周 —— 这是"难逆"的代价。
- **字体打包 ~300KB**,首屏 FCP 略慢于系统栈,但换来跨平台视觉一致。
- **视觉重设计** (赛博朋克 → violet / Inter 风) 是有意识的产品决策,不是
  Tailwind 改造的副作用。 ChatView / Sidebar 的 ~180 行内联 CSS 整段删除,
  不复用。
- **推迟到本轮完成时** 重写 / 删除 `src/AGENTS.md` (V0 widget 残留文档,
  已被 V1 实际代码结构架空;本次改造期间不处理)。

## References

- Tailwind v4 docs: https://tailwindcss.com/docs
- `@tailwindcss/vite` plugin: https://tailwindcss.com/docs/installation/using-vite
- (Tauri 2 + Solid.js 栈决策)
- (Effect-TS 逻辑层,跟 utility-only 视觉层的边界)
- `CONTEXT.md` → "Styling" 段 (Utility Class / Theme / Style Token 词条)
