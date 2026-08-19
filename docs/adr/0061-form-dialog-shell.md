# 0061 — FormDialogShell: 3 个 form-dialog 收敛为表驱动壳

**Status**: proposed · **Date**: 2026-08-11

`src/renderer/src/shared/components/internal/form-dialog-shell.tsx` (新增) + 3 个 form-dialog 同步改造（`createProviderFormDialog` 阶段 2 / `createMultiAgentFormDialog` / `createRuleFormDialog`）。承接 推广的 TanStack Form 模式与 的 `CodemanDialog` 命令式 API，把 3 份「`CodemanDialog.show + createForm + fields map + ScrollArea + buttons`」样板收敛到一个表驱动壳。

## Context

V2.5 推广 TanStack Form 模式后，3 个 form-dialog 各自手写「dialog + form + field 循环 + 滚动 + 底部按钮」五件套：

| 调用方                            | 文件                                                   | 行数 | 包含的样板                                                      |
| --------------------------------- | ------------------------------------------------------ | ---- | --------------------------------------------------------------- |
| `createMultiAgentFormDialog`      | `plugins/multi-agents/components/settings-tab.tsx`     | 288  | dialog + form + 6 fields + ScrollArea(60vh) + Cancel+Save/Add   |
| `createRuleFormDialog`            | `plugins/automations/components/rule-form.tsx`         | 517  | dialog + form + ~20 fields + ScrollArea(60vh) + Cancel+Save/Add |
| `createProviderFormDialog` 阶段 2 | `features/settings/components/add-provider-dialog.tsx` | 262  | dialog + form + 6 fields + Back+Cancel+Add                      |

3 份文件的「dialog 外壳 + form 创建 + 滚动区域 + 默认 Cancel/Submit 按钮」完全相同，每处都顺手硬编了 `ScrollArea class="max-h-[60vh]"` + `viewportClass="flex flex-col gap-3 pr-5"` + `firstErrorMessage(field().state.meta.errors)`。理解「如何把 schema 变成一个 dialog」要读 3 个文件，未来 dialog UX bug（如 V2.4 的「打开弹窗就显示一排红色错误」）要 3 处同时修。

## Decision

### D1 — 接口形状：表驱动 + discriminated union

```ts
type CommonOption = { label: string; value: string };

interface BaseField {
  name: string;
  label?: JSX.Element;
  helperText?: JSX.Element;
  required?: boolean;
  placeholder?: string;
}

interface TextField extends BaseField {
  kind: 'text';
}
interface PasswordField extends BaseField {
  kind: 'password';
}
interface NumberField extends BaseField {
  kind: 'number';
}
interface TextareaField extends BaseField {
  kind: 'textarea';
  rows?: number;
}
interface SelectField extends BaseField {
  kind: 'select';
  options: CommonOption[];
  multiple?: boolean;
  allowCustomValue?: boolean;
}
interface CheckboxField extends BaseField {
  kind: 'checkbox';
  description?: string;
}
interface RadioField extends BaseField {
  kind: 'radio';
  options: CommonOption[];
}

type FormDialogField =
  | TextField
  | PasswordField
  | NumberField
  | TextareaField
  | SelectField
  | CheckboxField
  | RadioField;

interface FormDialogShellProps<T> {
  title: string;
  description?: string;
  fields: FormDialogField[];
  defaultValues: T;
  schema?: Schema<T>; // effect/Schema, onSubmit-only 校验
  onSubmit: (values: T) => void | Promise<void>;
  onCancel: () => void;
  actions?: JSX.Element; // caller 额外按钮 (ProviderDialog 阶段 2 的「← Back」)
  cancelLabel?: string; // 默认 '取消', 传空串隐藏
  submitLabel?: string; // 默认 '添加' / '保存' (由 isEdit 决定)
  'data-testid'?: string;
}
```

**discriminated union 派发**：shell 内部 `switch(field.kind)` 映射到 `CodemanInput` / `CodemanTextarea` / `CodemanSelect` / `CodemanCheckbox` 等控件。具体类型 hidden，caller 仅持有 `FormDialogField[]`。

**D1 拒绝**：(a) 单 interface + 可选字段（编译期无法保证 `kind: 'select'` 必填 `options`，接口与实现等宽 → shallow wrapper）；(b) 暴露 `SelectField` 等具体类型（API 面膨胀，caller 需记 7 个类型名）；(c) 新增 `kind: "custom"` 漏口（破坏表驱动纯度，会退回 render-prop 模式）。

### D2 — kind 派发：CodemanInput / Textarea / Select / Checkbox

shell 内部不直接 import `ui/Input` 等 ui/ 原子；统一走 `shared/components/internal/codeman-*`（IME-safe + label/error layout 已包）。kind → 控件映射：

| `kind`                             | 控件                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `'text' \| 'password' \| 'number'` | `CodemanInput`（`type` 传对应值）                                                            |
| `'textarea'`                       | `CodemanTextarea`（`rows` 透传）                                                             |
| `'select'`                         | `CodemanSelect`（`options` 透传 + `multiple` / `allowCustomValue` 后续）                     |
| `'checkbox'`                       | `CodemanCheckbox`（`description` 后续作为 helperText）                                       |
| `'radio'`                          | `CodemanRadio`（V1 暂未实现；shell 接到 `'radio'` 时 throw `not implemented`，避免悄悄回退） |

### D3 — 滚动：承接，shell 包 ScrollArea

shell 内部固定 `<ScrollArea class="max-h-[60vh]" viewportClass="flex flex-col gap-3 pr-5">`，与 rule-form / multi-agent / cq-scrape 现存语义一致；ProviderDialog 阶段 1（preset tag cloud）不高，不需要 ScrollArea，仍走 `CodemanDialog.show` 自管，不接 shell。

### D4 — actions 区域：shell 默认 Cancel + Submit，caller 装额外按钮

底部 actions 区域从左到右布局：

1. caller 装的 `actions` 插槽（如 ProviderDialog 阶段 2 的「← Back」）—— 最左
2. shell 默认装的「提交」按钮（`isSubmitting` 时 disable）—— 中右
3. shell 默认装的「取消」按钮（`variant="outline"`，调 `onCancel`）—— 最右

**ProviderDialog 阶段 2** 的「← Back」由 caller 在 `actions` 插槽装，不接 `onBack` 回调。**ProviderDialog 阶段 1**（无 form）传 `cancelLabel="取消"` 只装 Cancel 按钮。

### D5 — 错误：onSubmit Promise reject → shell 装 banner

```ts
onSubmit: (values) => void | Promise<void>;
```

- onSubmit 返 Promise 时 shell 内部 `isSubmitting=true` 锁定提交按钮
- Promise reject → shell 内部 `setSubmitError(err)`，red banner 出现在 `title` 下、`fields` 上方（`text-sm text-destructive bg-destructive/10 p-2 rounded`），dialog 保持开
- isSubmitting=false，caller 决定 catch 后语义（`codemanToast.error` 提示外因错误 或 重提交）

shell **不接** `onError` 回调——保持职责纯，错误反馈由 caller 自决。

### D6 — a11y 委托：ui/dialog

shell 接所有 props 后转给 `shared/components/ui/dialog.tsx`（基于 `@ark-ui/solid` Dialog primitive），a11y / focus trap / ARIA 由 ui/dialog 负责。shell 不另接。

**焦点行为**：open 时 focus 第一个 field；close 时焦点恢复到 trigger（ui/dialog 已支持）。

### D7 — phase 不接管：caller 自管

shell **不知道** `phase` 概念。ProviderDialog caller 在外层管 `phase` state：

- 阶段 1（preset tag cloud）→ 直接用 `CodemanDialog.show` + caller 自管状态
- 阶段 2（form 填写）→ 走 FormDialogShell，caller 在 `actions` 插槽装「← Back」按钮触发 `setPhase('select')`

shell **不接** `phase` / `onBack` / `onPhaseChange` / `form.reset`——保持壳只管 form 业务，phase 由 caller 自由表达。

### D8 — 迁移路径：一锅端 1 PR

**1 PR**：

- 新增 `shared/components/internal/form-dialog-shell.tsx` + `form-dialog-shell.test.tsx`（契约单测）
- 同步改造 3 个 create\*FormDialog，把 3 份重复的 dialog 外壳替换为 shell 调用
- 3 份 dialog 单测改为「提交时 `onSubmit` 拿到正确 values + onCancel 调起」（不重测 form/校验/dialog 框架）

**D8 拒绝**：

- **逐个迁 3 PR**（shell API 不准时 3 个 dialog 一起坏，调试成本低；reviewer 1 次看完 3 处一致）
- **shell 单出、dialog 不动**（shell 接 0 个 dialog，无收益；同 home/chat-input 一起迁的范式）

## Considered Options

- **A — render-prop 回调**（shell 提供 dialog + header + actions 三 slot；form / field 留给 caller render）：leverage 最小，3 份现存 form 重复（`CodemanDialog.show + createForm`）仅删不吸；选 D1 表驱动拒绝。
- **B — 只提供 kind 集不接 onPhaseChange**（shell 接到 phase 切换事件调 form.reset）：状态双源（shell 内部 + caller 外部）有同步风险；D7 已锁 caller 自管 phase。
- **C — shell 接 phase + onBack + onPhaseChange 接管阶段切换**：职责膨胀；shell 知道「preset → form」领域子流程；与「shell 只管 form 业务」违反。D7 拒绝。
- **D — shell 接 onError 回调**：保持职责纯但增加 1 个 prop；D5 已选 caller catch 自决（`codemanToast.error` 可由 caller 在 catch 里调），不需 shell 暴露 onError。

## Consequences

### 正面

- **leverage**：1 壳接 3 调（+ 未来 dialog 边际成本 = 0）；约 200 行样板代码（3 份 dialog 外壳）吸收到 1 份 shell 实现
- **locality**：dialog UX bug（焦点、滚动、按钮、错误）收敛到 1 处
- **depth**：interface = 8 个 props + discriminated union 字段表；implementation 吸收 3 份重复；test locality 提升（1 份 shell 契约 + 3 份提交逻辑）
- **承接 ADR-0029**：TanStack Form 模式从 home/chat-input 推广到 settings/plugin 域的 form-dialog 全场景
- **承接 D8**：`firstErrorMessage` 收敛到 effect-schema-adapter 1 处，shell 内部不重复实现
- **承接 ADR-0039**：shell 内部固定 ScrollArea(60vh) + pr-5，滚动契约只此一处

### 负面 / 风险

- **discriminated union 选 D1 拒绝「单 interface + 可选字段」**：未来加新 kind 必须改 discriminated union（TextField/.../RadioField + union），但 TS 编译期会强制提示，迁移成本低
- **shell 不接 onError**：caller 必须在 onSubmit 函数体内 try/catch 决定 toast/banner/什么都不做；3 个现存 dialog 的 reject 路径需要 3 处自决
- **ProviderDialog 阶段 1 不接 shell**：「preset tag cloud」不是 form，强行纳入会破坏表驱动；阶段切换由 caller 自管，caller 拼「← Back + Cancel + Add」三按钮是 1 次成本
- **shell 接到 `'radio'` kind 时 throw**（V1 未实现）：避免悄悄回退到 render-prop；后续 wave 加 `CodemanRadio` 时再启用

### 兼容性

- 3 个 create\*FormDialog 的**对外 API 签名不变**（仍返回 `Promise<T | null>`）
- `defaultValues` shape 不变（仍由 caller 提供，schema 不变）
- 现有 3 份 dialog 单测**保留**但改写：只测「onSubmit 收值 + onCancel 调起」，不测 dialog 框架

## Status

proposed

## Decision Tree

| #   | 决策维度  | 锁定值                                                                                                                 |
| --- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| Q1  | 接口形态  | 表驱动 + discriminated union（TextField/PasswordField/NumberField/TextareaField/SelectField/CheckboxField/RadioField） |
| Q2  | kind 派发 | switch(field.kind) 映射到 CodemanInput/Textarea/Select/Checkbox                                                        |
| Q3  | 滚动      | shell 包 ScrollArea class="max-h-[60vh]" viewportClass="flex flex-col gap-3 pr-5"                                      |
| Q4  | actions   | caller `actions` 插槽 + shell 默认 Submit + Cancel，caller 装的额外按钮在 Cancel 左边                                  |
| Q5  | 错误      | onSubmit Promise reject → shell 装 red banner + dialog 保持开 + isSubmitting=false                                     |
| Q6  | a11y      | 委托 ui/dialog（基于 @ark-ui/solid），shell 不另接                                                                     |
| Q7  | phase     | shell 不知道 phase，ProviderDialog caller 自管 phase + 阶段 2 走 shell + 阶段 1 不接 shell                             |
| Q8  | 迁移      | 1 PR 同时迁 3 个 dialog + 1 份 shell 契约单测 + 3 份 dialog 提交逻辑单测                                               |

## References

-  — TanStack Form 模式推广，FormDialogShell 承接
- [ADR-0023 D8-W6](./0023-codeman-prefix-and-ark-ui-select.md) — `CodemanDialog` 命令式 API，shell 基于此
- [ADR-0025 D8](./0025-effect-schema-as-default-schema-library.md) — `effectSchema` + `firstErrorMessage` 校验，shell 内部统一
-  — 页面级 ScrollArea 约定，shell 内部 ScrollArea 承接
-  — `internal/` 组件边界，FormDialogShell 落在 `shared/components/internal/`
- CONTEXT.md「Form Dialog」「Field」词条 — V2.6+ 新增
