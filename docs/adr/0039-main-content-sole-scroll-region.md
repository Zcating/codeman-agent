# 0039 — 布局契约：主内容区 = 唯一滚动容器

**Status**: accepted · **Date**: 2026-08-02
**Scope**: `src/renderer/src/shared/components/ui/scrollarea.tsx` (已有 shadcn 移植，增 `data-scroll-region` 透传) + `src/renderer/src/shared/components/ui/scrollarea.test.tsx` (新增，契约测试) + `src/renderer/src/shared/lib/scroll-region.ts` (新增，断言模块) + `src/renderer/src/shared/lib/scroll-region.test.ts` (新增) + `src/renderer/src/shared/components/internal/codeman-sidebar.tsx` (内容 wrapper → ScrollArea + `data-testid="main-content-scroll"`) + `src/renderer/src/features/chat/components/chat-view.tsx` (消息区 → ScrollArea) + `e2e/03-layout-scroll.spec.ts` (新增，e2e 守卫) + CONTEXT.md (词条)

**Related**: ADR-0033 (shadcn sidebar 重写 — SidebarInset / ResizablePanel 两栏壳), 提交 `2bf2d7d` (V2.9 fix)、`5df8bbf` (V2.10 辅助)、`e39e434` (V2.10 fix)

## Context

主栏（`ResizablePanel#main`）的垂直滚动链里，**恰好一个** overflow 容器承载路由内容的滚动。这个不变量在 2026-07-25~08-02 之间被打破过**两次**，每次都 shipped 到用户：

- **V2.9 (2bf2d7d 前)**：`SidebarInset` 自带 `overflow-y-auto` + ChatView 消息区也有 `overflow-y-auto` → chat 页**双滚动条**，且顶部工具栏随内容滚走。修复：移除 `SidebarInset` 的 `overflow-y-auto`（2bf2d7d），假设"zag ResizablePanel 已提供 overflow:hidden，ChatView 消息区自带滚动"——**但这个假设只覆盖了 chat-view**。
- **V2.10 (2bf2d7d 后)**：非 chat 路由（plugins/skills、settings/*、home 超出视口时）原本靠 `SidebarInset` 滚动。移除后内容 wrapper（`div.flex-1.min-h-0`）是 `overflow:visible`，超高内容溢出到主面板的 `overflow:hidden`（zag splitter 默认）里——**被裁剪且无任何滚动容器**，滚轮无效。修复：内容 wrapper 补 `overflow-y-auto`（e39e434）。

两次回归说明：滚动契约是**一次性知识**，只存在于开发者脑内与 commit message 里；没有任何可寻址的身份、没有单测、没有 e2e 断言。本 ADR 把它固化为可执行契约。

## Decision

### D1 — 契约内容：「主栏内恰好一个活动滚动区」

```
主栏（ResizablePanel#main，overflow:hidden 裁剪层）
  └─ SidebarInset（flex-col min-h-0）
      ├─ 工具栏（h-10 shrink-0）— 永远钉住，不滚动
      └─ ScrollArea（唯一滚动容器）─ 路由内容
          ├─ 非 chat 路由：内容 wrapper div 是活动滚动区（原生 overflow:auto，无自定义滚动条）
          └─ chat 路由：conversation-route h-full overflow-hidden 恰好贴合
             → wrapper 无溢出，ChatView 消息区 ScrollArea 的 Viewport 成为活动滚动区
```

**不变量**：主栏内「活动滚动区」（`scrollHeight > clientHeight` 的 `[data-scroll-region]` 元素）**恰好一个**。
- **2 个** → V2.9 双滚动条回归
- **0 个** → V2.10 无滚动通道回归

**例外**：内层独立滚动（dropdown / pre 横向滚动 / textarea 内部滚动）不参与此不变量——它是主栏垂直链的布局约定，不是全局禁令。

### D2 — 载体：shadcn `ScrollArea`（ui/scrollarea.tsx，复用 `.repos/shadcn/scroll-area.tsx` 移植）

滚动契约的全部知识收敛到 shadcn `ScrollArea` 原语（项目内已有 `.repos/shadcn/scroll-area.tsx` 的 Solid 移植版 `ui/scrollarea.tsx`，基于 `@ark-ui/solid/scroll-area`）。**契约标记落点**：`data-scroll-region` 与 `data-testid` 透传到 **Viewport**（真正的滚动元素）——zag 在 Viewport 上注入 `style: { overflow: "auto" }`，Root 只是定位壳（`relative overflow-hidden`），`scrollHeight`/`clientHeight` 语义属于 Viewport。**尺寸链**：`flex-1 min-h-0` 在 Root（flex item 定位），Viewport `size-full` 填满 Root。

**两个消费方**（真实消费方 justify 这条 seam）：
- `codeman-sidebar.tsx` 内容 wrapper → `<div class="flex-1 min-h-0 overflow-auto" data-scroll-region="true" data-testid="main-content-scroll">`（**layout 容器，div，不是 ScrollArea**——wrapper 的唯一职责是承载路由 + 原生滚动通道，不该渲染自定义滚动条，否则会与内层 ScrollArea 的 ScrollBar 在右侧重叠。zag 的 ScrollBar 始终挂载，无溢出时也常驻显示。）
- `chat-view.tsx` 消息区 → `<ScrollArea class="flex-1 min-h-0" data-scroll-region="true">`（内容 `p-4 space-y-3` 下沉到内层 div；真正的内容区域，溢出时显示自定义滚动条 — `!end-1` 让 ScrollBar 离右侧 4px，覆盖 zag 注入的 `insetInlineEnd:0`）

**拒绝**：让消费方手写 `flex-1 min-h-0 overflow-y-auto`（两份副本漂移风险 = 两个回归的温床）；自建 `ScrollRegion` div 原语（与已存在的 shadcn `ScrollArea` 重复，滚动策略两处定义）。

### D3 — 契约身份：`data-testid="main-content-scroll"`

内容 wrapper 有可寻址身份，单测 / e2e 直接定位，不再依赖 `parentElement` 脆弱查询。`data-scroll-region` 是类型标记（可能多个），`data-testid="main-content-scroll"` 是主内容 wrapper 的专属身份（恰好一个）。**wrapper 是普通 div**——契约标记直接落在 div 上（不再走 ScrollArea Viewport）。ScrollArea 的契约标记透传机制（Viewport 接收）保留给真正的内容 ScrollArea（如 chat 消息区）。

### D4 — 断言模块（shared/lib/scroll-region.ts）

跨 vitest 与 e2e 的共享断言逻辑：
- `findScrollRegions` / `activeScrollRegions` / `activeScrollRegionCount` — 结构断言（数量）
- `findActiveScrollRegion(rootSel?)` — 自包含实现（字面量选择器内联），可被 `page.evaluate` 序列化到浏览器上下文，返回活动滚动区的 `{ selector, testid, scrollTop, scrollHeight, clientHeight }`

单测场景（scroll-region.test.ts）：正常（1 活动）、chat 布局（wrapper 贴合 + 消息区活动 = 1）、V2.9（2 活动）、V2.10（0 活动）、rootSel 限定。

### D5 — e2e 守卫（03-layout-scroll.spec.ts）

真 Electron（viewport 800×600）两个场景：

| 场景 | seeding | 断言 |
|------|---------|------|
| A: 超高设置页 | 6 个 provider → `/settings/llm` 内容超高 | `regionCount===1` · `activeCount===1` · 活动区是 `main-content-scroll` · wheel 后 scrollTop 增加 · 工具栏 top===0（前后） |
| B: chat-view | mock provider + workspace + 120 行长消息 | `regionCount===2` · `activeCount===1` · 活动区**不是** wrapper · wrapper 无溢出（无双滚动条）· wheel 向上改变 scrollTop · 工具栏 top===0 |

wheel 模拟：对活动滚动区 `dispatchEvent(new WheelEvent("wheel", { deltaY, bubbles, cancelable }))`——Chromium 对未 prevent 的合成 wheel 事件执行默认滚动。

## Status

accepted

## Considered Options

- **A — 只命名不抽原语（C1-only）**：内容 wrapper 加 testid + 单测断言，ChatView 保持手写类名。**拒**：类名两份副本仍存在，滚动策略仍两处定义；V2.9/V2.10 的知识点没有被收敛。
- **B — 全局"所有滚动都走 ScrollRegion"（C3 泛化）**：把 sidebar 自身滚动 / dropdown 等全部迁到 ScrollRegion。**拒**：sidebar 用 `SidebarContent overflow-auto` 是 shadcn 契约，dropdown 是独立弹层——过度设计，违反"恰好一个"的垂直链范围限定。
- **C — e2e 只跑超高页（C2 半套）**：跳过 chat 场景。**拒**：chat 是两次回归的主战场（V2.9 双滚动条），不守卫 chat 场景等于回归复发的绿灯。
- **D — 断言逻辑只在 e2e 写死（不抽 shared/lib）**。**拒**：单测（jsdom）与 e2e 各写一份 DOM 遍历逻辑，不变量描述分叉；抽到 shared/lib 让两端口径一致且可被单测直接验证。

## Consequences

### 正面

- **契约有名字、有身份、有守卫**：`data-scroll-region` + `main-content-scroll` + 单测 + e2e，V2.9/V2.10 变成合并前的自动拦截
- **滚动策略一处定义**：消息区等真正内容 ScrollArea 的滚动通道收敛到 Viewport（`overflow:auto` 由 zag 注入），消费方不再手写 `overflow-y-auto`；wrapper 作为 layout 容器走原生 div `overflow-auto`，与 ScrollArea 职责清晰分离
- **双滚动条回归被结构防御**：wrapper 不渲染自定义 ScrollBar（div 而非 ScrollArea），即使内容不溢出也不会有常驻 track 与内层 ScrollArea 的 ScrollBar 重叠
- **locality**：滚动相关 bug 的排查入口收敛到 `scroll-region.ts` 断言模块
- **术语进 glossary**：CONTEXT.md「Scroll Region」词条，plan/code/commit 同词

### 负面 / 风险

- **ScrollArea 成为新公共原语**：后续新路由若需要"滚动 body + 钉住 footer"布局，必须消费它而非手写类名——需要 code review 把关；wrapper 这种 layout 容器只能走 div，**不要**再用 ScrollArea（防双滚动条）
- **e2e wheel 模拟依赖 Chromium 对合成 WheelEvent 的默认滚动**：若未来 Chromium 行为变化，断言可能失效；`activeCount` 结构断言仍是主防线，wheel 断言是行为补强
- **契约标记在 Viewport（仅 ScrollArea 消费方）**：ScrollArea 的 `data-testid`/`data-scroll-region` 落在 Viewport（真正的滚动元素），Root 上没有这两个属性；wrapper（div）这两个标记落在自己身上

### 兼容性

- 消费方 DOM 变化：内容 wrapper 从 `<ScrollArea class="flex-1 min-h-0">` **回退**为 `<div class="flex-1 min-h-0 overflow-auto">`（layout 容器不该渲染自定义滚动条，避免与内层 ScrollArea 的 ScrollBar 在右侧重叠）；chat-view 消息区仍是 ScrollArea，既有 `[data-slot="scroll-area-viewport"][data-scroll-region]` 选择器继续生效
- ScrollArea 视觉微调：自定义滚动条 `!end-1` 让滚动条离右侧 4px（覆盖 zag 注入的 `insetInlineEnd:0`）
- 无新增依赖（ScrollArea 复用 `@ark-ui/solid/scroll-area`，已有）；无 electron / IPC 改动
- e2e spec 编号 03（该序号此前空缺，不冲突）

## Decision Tree

| # | 决策维度 | 锁定值 |
|--|---------|--------|
| Q1 | 契约内容 | 主栏内恰好一个活动滚动区（scrollHeight > clientHeight 的 [data-scroll-region]） |
| Q2 | 载体 | shadcn `ScrollArea`（ui/scrollarea.tsx，`.repos/shadcn` 移植；契约标记在 Viewport，尺寸链在 Root） |
| Q3 | 消费方 | 内容 wrapper（testid=main-content-scroll）+ ChatView 消息区，均 `class="flex-1 min-h-0"` |
| Q4 | wrapper 身份 | `data-testid="main-content-scroll"`（专属、恰好一个） |
| Q5 | 断言模块位置 | shared/lib/scroll-region.ts（vitest + e2e 双端） |
| Q6 | findActiveScrollRegion | 自包含实现，可 page.evaluate 序列化 |
| Q7 | e2e 场景 | A（超高设置页）+ B（chat-view 长消息），均断言工具栏钉住 |
| Q8 | wheel 模拟 | CDP `Input.dispatchMouseEvent(mouseWheel)`（合成 WheelEvent dispatch 不触发 Chromium 默认滚动，实测弃用） |
| Q9 | 范围 | 不动 sidebar 自身滚动 / dropdown；ScrollArea 自带滚动条是 shadcn 既定外观 |
| Q10 | 术语 | Scroll Region（滚动区），_避免_ scroll area / scroll container |

## References

- `2bf2d7d` — fix(sidebar): remove SidebarInset overflow-y-auto（V2.9，误伤非 chat 路由）
- `e39e434` — fix(sidebar): restore scrolling on non-chat pages via content-wrapper overflow-y-auto（V2.10 修复）
- ADR-0033 — shadcn sidebar 重写（两栏壳结构）
- CONTEXT.md「Scroll Region」词条
