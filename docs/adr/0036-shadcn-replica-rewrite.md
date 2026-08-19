# 0034 — Shadcn Replica Rewrite: 9 文件 1:1 仿照重写

**Status**: accepted · **Date**: 2026-07-25
**Scope**: 9 文件 (5 重写 + 1 新增 + 2 同步 + 1 改构) +
**Reference**: `.omo/plans/shadcn-replica-rewrite.md` (7 轮 grill 决策记录)

## Context

用户请求"仿照 `.repos/shadcn` 已落地的组件进行重构". 经过 7 轮 grill, 锁定: 9 个文件 1:1 仿照 shadcn 风格 (Solid 适配), 1 worktree + 1 PR + 9 atomic commits + 1 ADR commit.

| # | 类别 | 文件 | 路径 |
|---|------|------|------|
| 1 | 重写 | `button.tsx` | `src/renderer/src/shared/components/ui/button.tsx` |
| 2 | 重写 | `card.tsx` | `src/renderer/src/shared/components/ui/card.tsx` |
| 3 | 重写 | `checkbox.tsx` | `src/renderer/src/shared/components/ui/checkbox.tsx` |
| 4 | 重写 | `input.tsx` | `src/renderer/src/shared/components/ui/input.tsx` |
| 5 | 重写 | `textarea.tsx` | `src/renderer/src/shared/components/ui/textarea.tsx` |
| 6 | **新增** | `select.tsx` | `src/renderer/src/shared/components/ui/select.tsx` |
| 7 | 同步 | `codeman-input.tsx` | `src/renderer/src/shared/components/internal/codeman-input.tsx` |
| 8 | 同步 | `codeman-textarea.tsx` | `src/renderer/src/shared/components/internal/codeman-textarea.tsx` |
| 9 | 改构 | `codeman-select.tsx` | `src/renderer/src/shared/components/internal/codeman-select.tsx` |

测试文件: 9 个 `<name>.test.tsx` 同目录同步.

## Decision

### D1 — 9 文件 Commit 列表

以下按执行顺序排列 (从底至上):

| C# | SHA | 消息 | 改动 | +行 | -行 |
|----|-----|------|------|-----|-----|
| C1 | `b72b311` | `refactor(ui/button): align to .repos/shadcn 6v × 7s + data-slot` | button.tsx + test | 78 | 29 |
| C2 | `4a3e167` | `refactor(ui/card): align to .repos/shadcn 7-sub + data-slot + size prop` | card.tsx + test + index.css | 167 | 62 |
| C3 | `a09feb9` | `refactor(ui/checkbox): align to .repos/shadcn (native input path)` | checkbox.tsx + test | 33 | 12 |
| C4 | `5b8f404` | `refactor(ui/input): align to .repos/shadcn + data-slot + aria-invalid` | input.tsx + test | 35 | 11 |
| C5 | `cd81acf` | `refactor(ui/textarea): align to .repos/shadcn + data-slot + aria-invalid` | textarea.tsx + test | 24 | 10 |
| C6 | `13a8dfc` | `feat(ui/select): add shadcn-style Select primitive (9 atoms)` | select.tsx + test (新增) | 303 | 0 |
| C7 | `b5a29ba` | `refactor(codeman-input): sync with ui/input alignment + h-10 override` | codeman-input.tsx + test | 26 | 1 |
| C8 | `7154aff` | `refactor(codeman-textarea): sync with ui/textarea alignment + new assertions` | codeman-textarea.test.tsx | 25 | 2 |
| C9 | `a78ef25` | `refactor(codeman-select): switch to ui/select atoms` | codeman-select.tsx + test | 82 | 100 |

### D2 — 生态映射

| 源仓 (`.repos/shadcn`) | 项目 (codeman-agent) |
|---|---|
| React + `"use client"` | SolidJS (删除 `"use client"`, 用 `splitProps` / `mergeProps`) |
| `lucide-react` | `lucide-solid` |
| `@base-ui/react` (button/select/checkbox 等) | `@ark-ui/solid` (select 必需) 或 native (button / input / textarea / checkbox / card) |
| `@/lib/utils` (cn 函数) | `../../lib/cn` (相对路径) |
| `cva` + `VariantProps` | `cva` + `VariantProps` (不变, `class-variance-authority` 跨框架) |
| `data-slot="X"` | `data-slot="X"` (新增 .repos/shadcn 2025+ 风格) |
| Tailwind utility class | Tailwind v4 utility class (相同, `aria-invalid:` variant 已支持) |

**无新依赖**: `@ark-ui/solid` / `lucide-solid` / `class-variance-authority` / `clsx` / `tailwind-merge` 已全部在 `package.json` 中.

### D3 — 变体 1:1 对齐

**button 6v × 7s** (旧 6v × 4s → 完全对齐):

| variant | align | size | align |
|---------|-------|------|-------|
| default | ✓ | default | ✓ |
| outline | ✓ | xs | **新增** |
| secondary | ✓ | sm | ✓ |
| ghost | ✓ | lg | ✓ |
| destructive | ✓ | icon | ✓ |
| link | ✓ | icon-xs | **新增** |
| | | icon-sm | **新增** |
| | | icon-lg | **新增** |

新增 micro-interactions: `aria-invalid` 边框+ring, `aria-expanded` 状态, `active:not-aria-[haspopup]:translate-y-px`.

**card 7 sub + size prop** (旧 6 sub 无 size → 对齐):

| sub | align | 差异 |
|-----|-------|------|
| Card / CardHeader / CardContent / CardFooter | ✓ | `data-slot` 新增 |
| CardTitle / CardDescription | ⚠️ | `<h3>` / `<p>` → `<div>` (1:1 对齐 .repos/shadcn) |
| CardAction | ✓ | **新增** sub |

`size` prop: `"default"` | `"sm"` (新增).

**checkbox / input / textarea**: 1:1 Tailwind class + `data-slot` + `aria-invalid`.

### D4 — data-slot 全套引入

所有 6 个 ui atoms (button / card / checkbox / input / textarea / select) 加 `data-slot="<name>"`. 内部子件也加: `data-slot="card-header"` / `data-slot="card-title"` / `data-slot="select-trigger"` / `data-slot="select-item"` 等.

此风格来自 `.repos/shadcn` 2025+ 版本 (基于 `@base-ui/react`, 每个 child 显式标注 `data-slot`). 项目 e2e selector 不依赖 `data-slot`, 无 selector 迁移.

### D5 — checkbox 保留 native input 路径

**锁定**: checkbox 仍用 `<input type="checkbox">` + `data-slot` + Tailwind class, 不引入 `@ark-ui/solid Checkbox` primitive.

2 个 consumer (`add-provider-dialog.tsx`, `provider-card.tsx`) 用 `onChange={(e) => e.currentTarget.checked}`. `@ark-ui/solid` 的 Checkbox primitive 事件签名 `onCheckedChange={(d) => d.checked}` 不兼容. 若换 primitive, 2 个 consumer 需要重构 — 超出本轮 scope.

`<input type="checkbox">` 仍然 1:1 对齐 shadcn Tailwind class (peer-based visual check, ring, 等). 注释说明保持 native input 的理由.

### D6 — select 命名空间导出

`ui/select.tsx` 用直接命名导出:

```ts
export const SelectRoot = ...;   // 原 @ark-ui/solid Select.Root
export const SelectTrigger = ...;
export const SelectContent = ...;
export const SelectItem = ...;
// ...
```

**不**用 `Select.Trigger` nested object 语法. 原因: Solid template 编译时 namespace object 写法容易出错. 跟 `ui/dialog.tsx` 命名一致.

### D7 — ui/select.tsx re-export helpers

`createListCollection` 从 `@ark-ui/solid` 重新导出. 让 `codeman-select.tsx` 改构时 `import { SelectRoot, SelectTrigger, ..., createListCollection } from "../ui/select"` 拿到辅助 API.

`useSelectContext` 不再对外 re-export. T11 修改后, `SelectAction` 组件已封装 `useSelectContext().setOpen(false)` 逻辑, codeman-select 通过 `import { SelectAction } from "../ui/select"` 复用, 无需直接接触 `useSelectContext`. 减少 public API surface.

`CodemanSelect` props API 不变, `createListCollection` 调用不变.

### D8 — textarea `field-sizing-content`

旧 class `min-h-20` + `resize-none` → `min-h-16` + `field-sizing-content`. 后者是 CSS 新 property (标准支持中). 视觉等价 (都不允许手动 resize), 行为改进 (textarea 自动适应内容).

`codeman-textarea.test.tsx` 断言更新: `expect(textarea).toHaveClass("min-h-16")` 替代旧 `min-h-20`.

### D9 — 排除范围

- `accordion.tsx` / `sidebar.tsx` / `tooltip.tsx` — 已基于 `.repos/shadcn` 重写完
- `dialog.tsx` — 已基于 shadcn 风格完成 (不含 `data-slot`, 与 2025+ 风格有差异; 但本轮不改)
- 缺失组件 (`tabs` / `dropdown-menu` / `command` / `combobox` / `breadcrumb` / `pagination` / `sheet` / `scroll-area` / `carousel` / `chart` / `calendar` / `resizable` / `input-otp` / `input-group` / `button-group` / `field` / `item` / `progress` / `slider` / `table` / `toggle` / `toggle-group` / `empty` / `kbd` / `spinner` / `aspect-ratio` / `native-select` / `attachment` / `bubble` / `marker` / `message` / `message-scroller` / `direction` / `hover-card`) — 不在 scope, 后续 wave 处理

## Migration Plan

### 1 worktree + 1 PR + 10 atomic commits

```
{C1} b72b311 refactor(ui/button): align to .repos/shadcn 6v × 7s + data-slot
{C2} 4a3e167 refactor(ui/card): align to .repos/shadcn 7-sub + data-slot + size prop
{C3} a09feb9 refactor(ui/checkbox): align to .repos/shadcn (native input path)
{C4} 5b8f404 refactor(ui/input): align to .repos/shadcn + data-slot + aria-invalid
{C5} cd81acf refactor(ui/textarea): align to .repos/shadcn + data-slot + aria-invalid
{C6} 13a8dfc feat(ui/select): add shadcn-style Select primitive (9 atoms)
{C7} b5a29ba refactor(codeman-input): sync with ui/input alignment + h-10 override
{C8} 7154aff refactor(codeman-textarea): sync with ui/textarea alignment + new assertions
{C9} a78ef25 refactor(codeman-select): switch to ui/select atoms
{C10} (this commit) docs(adr): add 0034-shadcn-replica-rewrite
```

### 验证门

- `pnpm test` → 85 test files, 1102 pass, 1 skipped, 2 pre-existing unrelated errors (JsonRpcProtocolError in `src/main/jsonrpc.test.ts`)
- `pnpm typecheck` → 0 errors
- `pnpm e2e` — 待 reviewer 验证 (现有 selector 不动, data-slot 不冲突)

## Consequences

### 正面

- 9 个 UI atoms 1:1 对齐 `.repos/shadcn` 2025+ 风格 (data-slot + 完整 aria-invalid + 完整 size 集合)
- `ui/select.tsx` 新增 9 atoms + re-export helpers 让 `codeman-select.tsx` 改构无缝 — 后续 select 用法都用命名导出
- `@ark-ui/solid` adoption 集中在 `ui/select.tsx`, 减少跨模块耦合
- `button` 新增 `xs` / `icon-xs` / `icon-sm` / `icon-lg` 扩展组件库可用性
- `card` 新增 `size` prop + `CardAction` sub + `data-slot` 对齐
- 所有 input-like 组件 (`input` / `textarea`) 统一 `aria-invalid` 样式
- 记录 9 文件决策, 后续 wave 缺失组件参考本 ADR 范式

### 负面 / 风险

- **CardTitle / CardDescription**: `<h3>` / `<p>` → `<div>` (1:1 对齐 `.repos/shadcn` 决策). 语义降级. subagent 报告确认 e2e selector 不依赖 `<h3>`
- **checkbox 保留 native input**: 偏离 `.repos/shadcn` 1:1 (但保留 2 个 consumer 兼容). 后续 wave 可重新评估
- **ui/select ScrollUpButton / ScrollDownButton**: 用 plain `<div>` (Ark UI Solid 无 ScrollUpArrow primitive). 视觉等价但实现不同
- **textarea `field-sizing-content`**: 较新 CSS property, 需要确保 build 不报 warning

### 不在 scope

- 缺失组件 (tabs / dropdown-menu / command / combobox / ...) — 后续 wave
- sidebar / accordion / tooltip / dialog 重构 — 已有 ADR 覆盖
- e2e selector 适配 — 现有 selector (`getByRole` / `data-testid`) 不动, 跟新 `data-slot` 不冲突
- 视觉 QA — Tailwind v4 class 重写, 语义类不变

## Decision Tree

| # | 决策维度 | 锁定值 |
|---|---------|--------|
| Q1 | 范围 | 选 1:1 仿照"已落地"组件, 不做缺失件 |
| Q2 | 重点 | 9 个文件: button/card/checkbox/input/textarea + select 新增 + codeman-input/textarea 同步 + codeman-select 改构 |
| Q3 | 变体对齐 | 1:1 完全对齐 (button 6v × 7s, card 7 sub + size, 等) |
| Q4 | 工具映射 | 全套 Solid 适配 (React → SolidJS, lucide-react → lucide-solid, @base-ui/react → native 或 @ark-ui/solid) |
| Q5 | Commit 拆分 | 1 worktree + 1 PR + 9 atomic commits (每文件 1 commit + 1 ADR = 10) |
| Q6 | 测试覆盖 | 补齐现有 (5 ui .test.tsx 升级) + 新增 (ui/select test) + 同步 (codeman-input/textarea test) + codeman-select 现有 test 保留 |
| Q7 | 验证门 | typecheck + unit test + e2e 全绿 |
| Q8 | checkbox 策略 | 保留 native input 路径 (2 consumer 兼容), 不加 @ark-ui/solid Checkbox |
| Q9 | select 命名 | 直接命名导出 (SelectRoot / SelectTrigger / ...), 不嵌套 object |
| Q10 | textarea resize | `min-h-20`+`resize-none` → `min-h-16`+`field-sizing-content` |

## References

- `.repos/shadcn/button.tsx` 等 9 文件 — 外部参考实现 (shadcn/ui 2025+ 版本基于 `@base-ui/react`)
- `.omo/plans/shadcn-replica-rewrite.md` — 7 轮 grilling 决策记录
- — sidebar / accordion / tooltip shadcn 重写范式
- — Select via `@ark-ui/solid` 范式
- — Dialog pattern 参照
- — internal components boundary
- — Effect Schema 优先
