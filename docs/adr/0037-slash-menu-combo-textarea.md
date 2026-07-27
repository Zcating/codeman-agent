# 0037 — Slash Menu Variants 决议：Variant A + ComboTextarea 拆分

**Status**: accepted · **Date**: 2026-07-27
**Scope**: `src/renderer/src/features/chat/components/combo-textarea.tsx` (新增) + `src/renderer/src/features/chat/components/combo-textarea.test.tsx` (新增) + `src/renderer/src/features/chat/components/chat-view.tsx` (改 — 替换 textarea + slash-menu 为 `<ComboTextarea>`) + `src/renderer/src/features/chat/components/home.tsx` (改 — 同样替换) + `src/renderer/src/plugins/skills/components/slash-menu.tsx` (删 — chat-view + home 两处都迁出) + `src/renderer/src/plugins/skills/components/slash-menu.test.tsx` (删) + `src/renderer/src/plugins/skills/lib/use-slash-trigger.ts` (删 — 状态机吸收进 ComboTextarea 内部) + `src/renderer/src/features/chat/prototypes/_slash-menu-variants/` (删 — 整个目录) + `src/renderer/src/features/chat/routes/prototype-slash-menu-variants-route.tsx` (删) + `src/renderer/src/router.tsx` (改 — 删除 `/prototype/slash-menu-variants` 注册) + `src/renderer/src/shared/components/ui/popover.tsx` (改 — 暴露 4 个新 prop, 沿用 ship-slash-menu-variant-a 4 个 commit) + `src/renderer/src/shared/components/ui/popover.test.tsx` (沿用) + `src/renderer/src/shared/components/ui/scrollarea.tsx` (沿用, 0 引用也保留)
**Supersedes**: 无（Variant A 修复已是 4 commit 在 worktree `feat/slash-menu-popover-variant-a` 上落地，本 ADR 是「原型 → 生产」的提升决议）
**Related**: ADR-0029 (Form 模式统一应用到 HomeAgentForm 与 ChatView — chat-view 已用 TanStack Form + `<form onSubmit>`，本 ADR 维持此架构), ADR-0023 (codeman-* namespace), ADR-0022 (Internal Components & Design Tokens)

## Context

slash 菜单此前在 chat-view 中实现，输入 `/` 后：
1. 焦点被 ark-ui Popover 的 `autoFocus: true` 抢到 `<div id="popover:undefined:content">`，textarea 失焦，后续键入与 ArrowUp/Down 失效。
2. `closeOnInteractOutside` 默认 true，鼠标点回 textarea 也触发 Ark UI 的 `onOpenChange({open:false})`，与 `isOpen` 受控信号形成 flicker（关 → 立刻重开）。

为系统化对比，2026-07 起拆出原型 `prototypes/_slash-menu-variants/`，对比三个变体（Floating / Inline / Reserved Slot）。Playwright 实测 Variant A 的 Popover variant 在焦点 + 方向键维度已达标（见 ship-slash-menu-variant-a 4 个 commit），但 README Decision Matrix 中「Animation」「Resize」「Scroll」「Implementation complexity」等维度未填、且 Variant A 修复仅停留在原型层、未触及生产代码。

经过 `/grilling` 流程 10 题决策（2026-07-27），生产落地形态确定为：把 Variant A 的修复提炼为可复用 `<ComboTextarea>` 组件 + 接入 chat-view.tsx + 删除原型。

## Decisions

### D1 — Variant A 胜出（Floating Portal + fixed 320×320）

| 维度 | A (Floating) | B (Inline) | C (Reserved) | 选 A 的理由 |
|------|:---:|:---:|:---:|---|
| 焦点管理 | ✅ (修复后) | ⚠️ 菜单内焦点环 | ⚠️ 同左 | ark-ui Popover 在 `autoFocus={false}` 下完全旁观 textarea |
| 方向键 / Enter | ✅ 原生 onKeyDown | ✅ 同左 | ✅ 同左 | Popover 不持有焦点 → onKeyDown 由 textarea 自然处理 |
| 高度稳定 | ✅ 锁定 320×320 | ❌ 随 filter 抖 | ✅ 固定 320 | A 用 `w-80 h-80 overflow-hidden` + `getAnchorRect` 跟随滚动 |
| 锚点同步 | ✅ `getAnchorRect` 重读 rect | ⚠️ inline 跟随文本流 | ⚠️ reserved slot 位置固定 | resize/scroll 时 A 跟随 textarea；B/C 不会 |
| Stacking 复杂度 | ⚠️ Portal 与父级 stacking context | ✅ 原生流 | ✅ 原生流 | A 需要在 renderer 外层渲染（已在原型 line 712 完成） |

### D2 — Popover 原子保留裸 ark-ui prop 透传 + JSDoc 警示

新增 4 个 prop：`autoFocus` / `restoreFocus` / `closeOnInteractOutside` / `closeOnEscape`，均直接透传给 `@ark-ui/solid` Popover.Root。默认值保留 ark-ui 原状（陷阱不变）。每个 prop 的 JSDoc 显式标注默认陷阱与何时需要显式设为 `false`。

**拒绝**抽 `mode="input-anchored"` 高阶 API（会增加概念、扩大 API 表面）；**拒绝**改默认值（会偏离 ark-ui 默认，跨项目惯例埋坑）。JSDoc 即文档。

### D3 — 抽 `<ComboTextarea>` 组件而非 `useSlashMenu` hook

- **路径**：`src/renderer/src/features/chat/components/combo-textarea.tsx`
- **职责**：textarea + Popover（autoFocus / restoreFocus / closeOnInteractOutside 三个 false）+ SlashMenuItem 渲染 + userDismissed 状态机 + trigger / filter / highlight / select / close + Ctrl+/ 强制重开
- **不负责**：消息发送（Enter 菜单未开时透传给外层 `<form onSubmit>`）
- **不提供**：`onSkillSelect` 回调（调用方靠 `onChange` 的前后 diff 自行判断）

API 最小集：

```ts
interface ComboTextareaProps {
  value: string;
  onChange: (value: string) => void;
  skills: SkillManifest[];
  placeholder?: string;
  class?: string;
}
```

> **未来出现第二处 slash menu 时再考虑拆 `useSlashMenu` hook**（AGENTS.md「单次使用不做抽象」）。

### D4 — chat-view.tsx + home.tsx 同步采用 ComboTextarea

slash 菜单在生产代码里是**双调用点**（chat-view + home）。两处都是同样的 broken 实现（无 `userDismissed`）。grilling 流程后追加决策（Q11）：home.tsx **同步**迁追 ComboTextarea，避免只修一半。

两处都用 TanStack Form（ADR-0029 V2.5）。`<ComboTextarea>` 内不包 form，原生 submit 透传。两处的 textarea 字段都替换为：

```tsx
<form.Field name="draft">
  {(field) => (
    <ComboTextarea
      value={field().state.value}
      onChange={field().handleChange}
      skills={enabledSkills()}
      placeholder={...}
      rows={3}
    />
  )}
</form.Field>
```

调用方保留 `enabledSkills` memo（从 `skillsManifests$()` ∩ `appStore.enabledSkills` 计算），传给 ComboTextarea 的 `skills` prop。TanStack Form 提交流程不变。

### D5 — 选中即关（保持现状）

按 Enter / 鼠标点击选中后调用 `handleClose`，`userDismissed = true`。下一次 `/` 需用户重新输入。理由：Slack / Linear / Notion / VSCode Cmd+K 均采用此模式；slash 菜单是「单用途触发器」而非「多选选择器」。

### D6 — Ctrl/Cmd+/ 进生产

`Ctrl+/` 或 `Cmd+/` 强制重开菜单（即便 `userDismissed = true`）。注意：Windows 上 Ctrl+/ 与 VSCode/JetBrains「注释切换」快捷键冲突 — 但 codeman-agent 是独立 Electron 应用，焦点内不被 IDE 拦截；接受此冲突。

### D7 — 原型 + 路由全部删除

- `src/renderer/src/features/chat/prototypes/_slash-menu-variants/` 整个目录
- `src/renderer/src/features/chat/routes/prototype-slash-menu-variants-route.tsx`
- `src/renderer/src/router.tsx` 中 `/prototype/slash-menu-variants` 注册

理由：README "Production Path" 第 3 步明文要求「Delete this route and the prototype component」。不保留作为 smoke test 路径（避免 ComboTextarea 改动后 smoke 路径脱节；调试焦点问题走真生产路径即可）。

### D8 — scrollarea.tsx 保留（0 引用也留）

虽目前 ComboTextarea 用原生 `overflow-y-auto div`（固定 320px 视口），未来 dropdown / autocomplete 可能用到。shadcn 模板本身就有 ScrollArea 原子，保留符合上游惯例。组合 lock 在生产验证窗口（2026-Q3 末）审视是否删除。

## Migration Path

```text
工作分支：feat/slash-menu-popover-variant-a（已存在的 worktree）
├── commit 1-4（已落地）: scrollarea.tsx + popover.tsx 4 props + popover.test.tsx + 原型组件 + README 迁移
├── commit 5（新增）: feat(chat): ComboTextarea component
├── commit 6（新增）: test(chat): ComboTextarea state machine (focus + dismiss + Ctrl+/)
├── commit 7（新增）: feat(chat): chat-view adopts ComboTextarea
├── commit 8（新增）: feat(chat): home adopts ComboTextarea
├── commit 9（新增）: chore(skills): delete SlashMenu + useSlashTrigger (chat-view + home both migrated)
├── commit 10（新增）: chore(chat): delete prototype route + prototype component + router entry
└── commit 11（新增）: docs(adr): ADR-0037 slash menu variants decision
```

## Test Plan

- `rtk npm run typecheck:web` — 新文件 + chat-view 改动后无 type error
- `rtk npm run test` — popover.test.tsx (4) + combo-textarea.test.tsx (新增 ≥5 case) + chat-view.test.tsx (现有不动) 全 pass
- Playwright smoke：打开 `/`、`/test-driver`、`/` + ArrowDown + Enter 选中 + Esc 关闭 + Ctrl+/ 重开，document.activeElement 始终 `TEXTAREA`
- Worktree 仅保留 9 个未追踪 PNG 截图

## Open Questions

无。本 ADR 已闭合 10 题决策链；未来若 `userDismissed` 模式需要在第二处复用，回 D3 重审拆 hook。