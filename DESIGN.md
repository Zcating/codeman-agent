---
name: codeman-agent
description: Windows 桌面 AI Agent,内置 2 个计费工具 (DeepSeek 余额 / MiniMax 套餐)。中文开发者的快提词 + 看计费工作台。
colors:
  # Lab Sky primary ramp (sky-500 锚点 ≈ #0ea5e9, OKLCH hue 230)
  lab-sky-50: "oklch(0.97 0.014 230)"
  lab-sky-100: "oklch(0.94 0.03 230)"
  lab-sky-200: "oklch(0.89 0.055 230)"
  lab-sky-300: "oklch(0.82 0.095 230)"
  lab-sky-400: "oklch(0.74 0.15 230)"
  lab-sky-500: "oklch(0.685 0.169 230)" # anchor: ≈ #0ea5e9
  lab-sky-600: "oklch(0.61 0.18 230)"
  lab-sky-700: "oklch(0.53 0.17 230)"
  lab-sky-800: "oklch(0.45 0.15 230)"
  lab-sky-900: "oklch(0.37 0.13 230)"
  lab-sky-950: "oklch(0.27 0.1 230)"

  # Cool paper / charcoal neutral (hue 230 tinted 0.005 chroma → brand-tinted, not warm)
  cool-paper: "oklch(0.985 0.003 230)"
  cool-paper-surface: "oklch(1 0 0)"
  cool-fog: "oklch(0.92 0.005 230)"
  cool-charcoal: "oklch(0.18 0.008 230)"
  cool-charcoal-surface: "oklch(0.22 0.008 230)"
  cool-shadow: "oklch(0.28 0.008 230)"

  # Lab graphite text scale
  lab-graphite: "oklch(0.18 0.008 230)"
  lab-graphite-soft: "oklch(0.4 0.008 230)"
  lab-graphite-on-dark: "oklch(0.95 0.005 230)"
  lab-graphite-on-dark-soft: "oklch(0.7 0.005 230)"

  # Lab signal (semantic, hue-distinct from primary)
  lab-signal-success: "oklch(0.72 0.15 145)"
  lab-signal-warning: "oklch(0.78 0.16 80)"
  lab-signal-error: "oklch(0.62 0.22 25)"

typography:
  display:
    fontFamily: "Inter, Noto Sans SC, system-ui, -apple-system, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter, Noto Sans SC, system-ui, -apple-system, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Inter, Noto Sans SC, system-ui, -apple-system, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.01em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, Cascadia Code, monospace"
    fontSize: "0.75rem"
    lineHeight: 1.5

rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"

spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"

components:
  button-primary:
    backgroundColor: "{colors.lab-sky-500}"
    textColor: "{colors.cool-paper}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.lab-sky-600}"
  button-primary-active:
    backgroundColor: "{colors.lab-sky-700}"
  button-destructive:
    backgroundColor: "{colors.lab-signal-error}"
    textColor: "{colors.cool-paper}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  input-default:
    backgroundColor: "{colors.cool-paper-surface}"
    textColor: "{colors.lab-graphite}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  card-default:
    backgroundColor: "{colors.cool-paper-surface}"
    textColor: "{colors.lab-graphite}"
    rounded: "{rounded.lg}"
  sidebar-item-active:
    backgroundColor: "{colors.lab-sky-500}"
    textColor: "{colors.cool-paper}"
    rounded: "{rounded.md}"
  message-bubble-user:
    backgroundColor: "{colors.lab-sky-500}"
    textColor: "{colors.cool-paper}"
    rounded: "{rounded.lg}"
  tool-call-success:
    backgroundColor: "{colors.cool-paper-surface}"
    textColor: "{colors.lab-graphite}"
    rounded: "{rounded.md}"
---

# Design System: codeman-agent

## 1. Overview

**Creative North Star: "The Lab Notebook."**

这个系统是实验与计量的工作台——不是演示页,不是 hero 区,不是营销场。它的存在是为了让用户记下一条消息、看着流式 token 走完、看一眼余额数字,然后关掉。**冷调 / 干 / 计量** 是它的语气;不解释自己,不为 AI 道歉,不用 emoji 庆祝,不让任何像素挣不到位置。

11 阶 `Lab Sky` 锚定在 sky-500 (`oklch(0.685 0.169 230)`, ≈ `#0ea5e9`),中性面 `Cool Paper` (light) / `Cool Charcoal` (dark) 在 hue 230 方向染 0.003–0.008 chroma,让 cool 调性是品牌自己的,不是"AI 默认那种偏冷"。排版上 Inter + Noto Sans SC 同权,CJK 与 Latin 混排节奏跟 JetBrains Mono 工具调用卡片配对协调。

**Key Characteristics:**

- **Functional accent, not brand accent.** `Lab Sky` 是 *计量色*,不是 *品牌色*;只用于状态变化、关键操作、选中态、信息焦点。中性面做主。
- **Flat by default, border-driven depth.** 阴影几乎不存在,边界 1px 即可。`border + shadow` 不同现(戒律)。
- **CJK-first typography.** Noto Sans SC 跟 Inter 同等优先级,行高按 CJK 优化 (1.55 body / 1.3 label)。
- **Three-state theme integrity.** light / dark / system 三态中,Lab Sky 的相对地位保持不变;只换 cool-paper ↔ cool-charcoal。
- **Performance as design.** 1.5s 首 token / 200ms 流式更新 / 没有动效装饰超过 150ms;状态变化靠 transition-colors 即可,不用 transform 弹跳。
- **Emoji is data, not decoration.** 工具调用状态 (⏳ / ✓ / ✗) 是数据指示,保留;按钮文字、对话正文零 emoji。

## 2. Colors

11 阶 `Lab Sky` 是唯一带强饱和度的色阶,`Cool Paper` / `Cool Charcoal` 是带品牌色调的中性面。信号色 (`Lab Signal Success / Warning / Error`) 与 primary 在色相上拉开 (145 / 80 / 25) 避免语义混淆。

### Primary

- **Lab Sky 500** (`oklch(0.685 0.169 230)`, ≈ `#0ea5e9`): 主操作背景 (Send / Save / Confirm) + 选中态 + 流式指示。**中度使用**——单屏面积 ≤ 10% 即可。
- **Lab Sky 600** (`oklch(0.61 0.18 230)`): hover 态(色阶下降 1 阶,不调透明度)。
- **Lab Sky 700** (`oklch(0.53 0.17 230)`): active / pressed 态(色阶下降 2 阶)。
- **Lab Sky 50–200** (`oklch(0.97..0.82 ... 230)`): 极淡的聚焦/hover 底色,用于 ghost button hover / input focus ring 内层 / 选中态的 5% 透明。
- **Lab Sky 800–950** (`oklch(0.45..0.27 ... 230)`): dark 模式下的"主色深阶",用于 disabled / metadata 文本。

### Neutral

- **Cool Paper** (`oklch(0.985 0.003 230)`): light 模式 body 背景(几乎纯白,带 0.003 chroma 朝 sky 方向染)。
- **Cool Paper Surface** (`oklch(1 0 0)`): light 模式 card / sidebar / footer 等"略浮起"的面。
- **Cool Fog** (`oklch(0.92 0.005 230)`): light 模式 1px 边界 / 分隔线。
- **Cool Charcoal** (`oklch(0.18 0.008 230)`): dark 模式 body 背景(深炭黑,带 0.008 chroma 朝 sky 染)。
- **Cool Charcoal Surface** (`oklch(0.22 0.008 230)`): dark 模式 card / sidebar 略浮起面。
- **Cool Shadow** (`oklch(0.28 0.008 230)`): dark 模式 1px 边界 / 分隔线。

### Text

- **Lab Graphite** (`oklch(0.18 0.008 230)`): light 模式正文(4.5:1 对比度对 cool-paper)。
- **Lab Graphite Soft** (`oklch(0.4 0.008 230)`): light 模式次要文本 / 时间戳。
- **Lab Graphite on Dark** (`oklch(0.95 0.005 230)`): dark 模式正文。
- **Lab Graphite on Dark Soft** (`oklch(0.7 0.005 230)`): dark 模式次要文本。

### Signal (semantic)

- **Lab Signal Success** (`oklch(0.72 0.15 145)`): tool-call 成功 / 计费充足。
- **Lab Signal Warning** (`oklch(0.78 0.16 80)`): 计费临近阈值。
- **Lab Signal Error** (`oklch(0.62 0.22 25)`): tool-call 失败 / API key 缺失 / 余额耗尽。

### Named Rules

**The Lab Sky 10% Rule.** `Lab Sky` 在任意屏幕上占总面积 ≤ 10%。它的稀缺性是它能传达"这是当前焦点"的前提。满色 violet 浇满 sidebar + 主面板 + footer 是反例。

**The Cool 0.008 Rule.** 中性面 chroma 永远 ≤ 0.008,方向永远朝 sky hue 230(不是暖白、不是纯灰)。这一条把 cool 调性从"AI 默认偏冷"变成"这是 codeman-agent 自己的中性"。

**The Signal Hue Distance Rule.** 任何信号色 (success / warning / error) 必须与 primary 在 OKLCH 色相上间隔 ≥ 90°。当前:sky 230 ↔ success 145 (差 85°),sky 230 ↔ error 25 (差 155°),sky 230 ↔ warning 80 (差 150°)。**violet 295 调色板改成 sky 230 后,这个间隔自动满足**;将来改色请重新校准。

## 3. Typography

**Display / Body Font:** Inter + Noto Sans SC(同 stack,CJK 与 Latin 同等优先级)
**Mono Font:** JetBrains Mono(工具调用 args / result / ID)

**Character:** 跟系统 UI 同源(Inter 是 GitHub / Linear / Raycast / Figma 共识字体)。CJK 走 Noto Sans SC 处理 1.6 万字的现代中文。Mono 走 JetBrains Mono,在窄工具卡片里 args / result 长串可读。

### Hierarchy

- **Display** (`font-weight: 600`, `1.5rem`, `line-height: 1.2`, `letter-spacing: -0.02em`): 当前空,留作 V2 仪表板 hero。当前 chat 域内无 display 级使用。
- **Body** (`font-weight: 400`, `0.875rem`, `line-height: 1.55`): 消息正文、placeholder、标签正文。CJK 行高 1.55 是 Scott Hemsley 推荐的 Noto Sans SC 最佳节奏。
- **Label** (`font-weight: 500`, `0.75rem`, `line-height: 1.3`, `letter-spacing: 0.01em`): sidebar 会话标题、按钮文字、tab 标签。**禁止 letter-spacing 大于 0.05em + 全大写**——是 2023 营销 kicker 的 AI scaffold,直接禁。
- **Mono** (`JetBrains Mono`, `0.75rem`, `line-height: 1.5`): tool-call args / result / ID 渲染。`whitespace-pre-wrap` + `overflow-x-auto`。

### Named Rules

**The CJK-First Line-Height Rule.** Body 行高 1.55(默认 Latin 推荐 1.5 的 CJK 调整)。任何 token 写死 line-height 之前先想:这条 token 上 90% 字符是 CJK 还是 Latin?CJK → 1.55;Latin → 1.5;混合 → 1.55(以 CJK 视觉密度为准)。

**The No-Kicker Rule.** 禁止 `text-[10px] uppercase tracking-[0.2em]` 这类 2023 营销 kicker。如需 "标签感",走 `Label` token(weight 500 + tracking 0.01em + sentence case)即可,不要加 uppercase。

## 4. Elevation

本系统**默认无阴影**;深度靠 1px 边界 + 不同 bg lightness 营造。Card 是唯一默认带 `shadow-sm` 的元素,但 V1 决策中 chat 域走的是 border-driven depth 而非 shadow-driven。

### Shadow Vocabulary

- **None by default.** Body / input / sidebar / footer / message bubble / tool call card 全部无阴影。
- **`shadow-sm` (Card only).** Card 原子组件用 `shadow-sm` 作为"信息容器"的极轻浮起暗示,在 light 模式下有意义;dark 模式下用 `cool-shadow` 边界替代。
- **No `shadow-md` / `shadow-lg` / `shadow-xl`.** 这些都不会出现在 V1。

### Named Rules

**The Border-Over-Shadow Rule.** 任意元素,有 `border` 时不写 `box-shadow`;有 `box-shadow` 时不写 `border`。**1px solid 1px shadow 同现 = ghost-card 反模式**。Card 例外是"container 默认",非"装饰加项"。

**The State-Shadow-Only Rule.** Hover / focus / active 状态可以临时引入轻 shadow (≤ 4px blur, ≤ 0.1 alpha),但仅作为状态反馈,默认态不能存在。

## 5. Components

### Buttons

- **Shape:** 圆角 `rounded-md` (8px),**禁 32px+ pill**。**禁 1px border + 4px+ shadow 同现**。
- **Primary:** `bg-lab-sky-500 text-cool-paper`,hover `bg-lab-sky-600`,active `bg-lab-sky-700`。**色阶下降 1 阶,不用透明度**。padding `0 16px`,height `40px`,`font-medium 0.875rem`。
- **Destructive:** `bg-lab-signal-error text-cool-paper`,hover 色阶下降,active 下降 2 阶。仅用于"删除会话 / 取消运行"。
- **Ghost / Outline:** `bg-transparent text-lab-graphite` + hover `bg-lab-sky-50 text-lab-sky-700`。**不写 border**——ghost 的语义是"极低权重",加了 border 变 outline。
- **Focus:** `focus-visible:ring-2 focus-visible:ring-lab-sky-500 focus-visible:ring-offset-2`。**ring 永远可见**——不被 border 替代。
- **Disabled:** `disabled:opacity-50 disabled:cursor-not-allowed`。

### Inputs

- **Style:** `h-10 px-3 py-2`,1px 边界 `cool-fog` / `cool-shadow`(dark),bg `cool-paper-surface` / `cool-charcoal-surface`,圆角 `md`。
- **Focus:** `focus-visible:ring-2 focus-visible:ring-lab-sky-500 focus-visible:ring-offset-2`,**焦点态 ring 比边界更重要**——不要用"border 变 primary"代替 ring。
- **Placeholder:** `text-lab-graphite-soft` / `text-lab-graphite-on-dark-soft`,**禁用 Tailwind 默认 muted-gray**。
- **Disabled:** `disabled:opacity-50 disabled:cursor-not-allowed`。

### Cards

- **Corner Style:** `rounded-lg` (12px),**禁 24px+**。
- **Background:** `cool-paper-surface` / `cool-charcoal-surface`(dark)。
- **Border:** 1px `cool-fog` / `cool-shadow`。
- **Shadow:** light 模式 `shadow-sm`;dark 模式无 shadow 靠边界。
- **Internal Padding:** CardHeader `p-6`,CardContent `p-6 pt-0`,CardFooter `p-6 pt-0`。
- **Border + Shadow 同存例外:** Card 是 V1 唯一允许 `border` + `shadow-sm` 同存的元素,作为"container 默认"。

### Sidebar Item (chat 域 signature)

- **Default:** transparent bg + `text-lab-graphite`,hover `bg-cool-fog` (light) / `bg-cool-charcoal-surface` (dark)。
- **Active:** `bg-lab-sky-500 text-cool-paper`,hover 保持 `bg-lab-sky-500`(已经是焦点不需要 hover 反馈)。
- **Border:** 无。
- **Padding:** `p-2`,圆角 `md`,**左右撑满不超出**。
- **Title:** Label token (`0.75rem`, `weight 500`, `truncate`)。
- **Metadata:** `0.7rem` `text-lab-graphite-soft` 显示日期。

### Message Bubble (chat 域 signature)

- **User:** `bg-lab-sky-500 text-cool-paper`,圆角 `lg` (12px),`max-w-prose`,`p-3`,`leading-relaxed`。
- **Assistant:** `bg-cool-paper-surface text-lab-graphite`,1px 边界,圆角 `lg`,`max-w-prose`,`p-3`。
- **System:** `bg-lab-signal-warning / 20`,`text-lab-graphite`,斜体。
- **No avatar / no name row.** 角色通过左/右对齐 + bg 区分。V1 决定不加 avatar——agent 是工具,不是角色。

### Tool Call Card (chat 域 signature)

- **Shape:** `rounded-md` (8px),`p-3`,1px 边界,**禁 shadow**。
- **Running:** 1px `cool-fog` / `cool-shadow` 边界,bg `cool-paper-surface` / `cool-charcoal-surface`,头部 `⏳` 跟工具名。
- **Success:** 1px `lab-signal-success` 边界,bg 透明(允许 0.05 alpha tint),头部 `✓`。
- **Error:** 1px `lab-signal-error` 边界,bg 透明(允许 0.05 alpha tint),头部 `✗`,details 默认展开。
- **Inner Sections:** Arguments / Result 用 `<details>` 折叠,默认收起(error 除外),summary 文字 `text-lab-sky-600`(dark: `text-lab-sky-400`)。

## 6. Do's and Don'ts

### Do:

- **Do** 让 `Lab Sky` 严格保持 ≤ 10% 屏幕面积。选中 1 个会话 + 1 个主按钮 = 2 处出现,够。
- **Do** hover / active 用色阶下降(`-500 → -600 → -700`),不用 `bg-primary/80` 这类透明度。
- **Do** 用 `border` 而不是 `shadow` 区分状态 / 容器。
- **Do** placeholder 用 `text-lab-graphite-soft`,4.5:1 对比度足够。
- **Do** focus 永远 2px ring + 2px offset,**不被 border 替代**。
- **Do** 任何动效配 `prefers-reduced-motion: reduce` 降级。
- **Do** 中文消息默认 `leading-relaxed` (1.55+),英文消息 `leading-snug` (1.4)。
- **Do** 用 5 原子 (`Button` / `Input` / `Textarea` / `Checkbox` / `Card`) 而非 raw utility class 重复造轮子。
- **Do** 图标全用 `lucide-solid`,**新代码零 emoji**(`tool-call-card` 内的 ⏳✓✗ 是数据指示保留)。

### Don't:

- **Don't** 把产品做成 ChatGPT 居中紫色欢迎卡 + hero 输入区(2026 AI 工具定式第一反射)。
- **Don't** 做成 Notion / Webflow 那种全黑侧栏 + emoji 弹 + 营销腔(本产品是工具,不是协作平台)。
- **Don't** 做成 VSCode / Cursor 套壳的三面板 IDE 形态(我们是聊天 + 工具调用,不是 IDE)。
- **Don't** body bg 用 cream / sand 暖白(AI 项目 2026 第二反射)。
- **Don't** 写渐变文字 / 玻璃拟物 / 草绘 SVG 插画 / `repeating-linear-gradient` 条纹背景。
- **Don't** 写 `border-left: 4px solid` 这种 side-stripe accent card;写全 border / bg tint / leading number 替代。
- **Don't** 用 `text-[10px] uppercase tracking-[0.2em]` 营销 kicker;走 `Label` token(sentence case, weight 500, 0.01em tracking)。
- **Don't** 放 `01 · About / 02 · Process` 这种 numbered eyebrow 标号;数字只在真有序列语义时出现。
- **Don't** 写 `border + box-shadow` 同一元素的 ghost-card 组合(除 Card 容器外)。
- **Don't** 圆角超 `12px` 的卡片 / 容器;按钮可以 pill 但**不**超过 `rounded-full` 的全 pill,卡片严格 12px 上限。
- **Don't** 在消息正文中用 emoji(对话 = 文字,tool-call = 数据指示 = 唯一例外)。
- **Don't** 把 `bg-lab-sky-500` 浇满 sidebar + 主面板 + footer(违反 10% Rule)。
- **Don't** 用浏览器原生 `confirm()` 弹窗(用 inline 确认 UI 或 native `<dialog>`)。
- **Don't** 把"agent 正在思考"做成 `disabled` textarea + "Cancel" 按钮;要有 `正在思考…` 状态文字 + 文字 shimmer / dot animation(走 reduced-motion 降级)。
- **Don't** CJK 行高用 1.5(Latin 默认);用 1.55。
- **Don't** placeholder 写英文 "Type a message…",目标是中文用户;写"发条消息…"或相似。
