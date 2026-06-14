# src/shared/ui — 原子组件规范

> 5 个纯排版 / 受控交互原子组件。无 Radix，无 Kobalte，无复杂复合体。

## 组件清单

| 组件 | 文件 | 用途 | 变体方式 |
|---|---|---|---|
| Button | `button.tsx` | 点击触发操作 | cva（6 变体 × 4 尺寸） |
| Input | `input.tsx` | 文本输入 | cva（4 变体） |
| Textarea | `textarea.tsx` | 多行文本输入 | cva（2 变体） |
| Checkbox | `checkbox.tsx` | 受控勾选（native `<input type="checkbox">`） | cn（条件 class） |
| Card | `card.tsx` | 信息容器 | 7 静态子件（cn，不走 cva） |

## Button 变体表（cva）

变体（variant）：

| 变体 | 用途 | 典型 class |
|---|---|---|
| `default` | 主要操作 | `bg-primary text-primary-foreground` |
| `destructive` | 危险操作 | `bg-destructive text-destructive-foreground` |
| `outline` | 次要操作 | `border border-input bg-background hover:bg-accent` |
| `secondary` | 次要次要 | `bg-secondary text-secondary-foreground` |
| `ghost` | 极低权重 | `hover:bg-accent hover:text-accent-foreground` |
| `link` | 类链接 | `text-primary underline-offset-4 hover:underline` |

尺寸（size）：

| 尺寸 | 典型 class |
|---|---|
| `default` | `h-10 px-4 py-2` |
| `sm` | `h-9 px-3 text-sm` |
| `lg` | `h-11 px-8 text-base` |
| `icon` | `h-10 w-10` |

6v × 4s = 24 个组合，全部通过 cva 静态分析，无运行时开销。

## Card 7 子件

Card 是**静态子件聚合**，不走 cva（样式固定，不需要动态变体）。

| 子件 | 文件内导出名 | 用途 |
|---|---|---|
| `Card` | `Card` | 最外层容器 |
| `CardHeader` | `CardHeader` | 顶部区（可放 Title + Description） |
| `CardTitle` | `CardTitle` | 标题 |
| `CardDescription` | `CardDescription` | 描述文字 |
| `CardContent` | `CardContent` | 内容区 |
| `CardFooter` | `CardFooter` | 底部区（可放操作按钮） |
| `CardAction` | `CardAction` | 右上角操作区（由 CardHeader 消费） |

所有子件样式通过 `cn()` 拼接，无条件变体。ProviderCard（settings 域）用 Card 7 子件重构是本期对契约的验证。

## cn 导入路径

```typescript
import { cn } from "../../lib/cn";
// 实际路径：从 ui/ 下的文件到 lib/cn.ts 是 ../../lib/cn
```

项目配置的 `@/` path alias（如有）优先使用，否则用相对路径。**不得硬编码 `/shared/lib/cn`**。

## 轻量契约测试约定

每个 ui 组件配套 `*.test.tsx`，测试原则：

- **< 50 LOC**（Card 因 7 子件测满可达 71 行，这是例外）
- **Props in, DOM out**：验证 given props then render 后的 DOM 结构
- **零 mock**：不 mock CSS，不 mock 子组件
- **Snapshot 可选**：DOM 结构简单时用 `toBeInTheDocument()` 而非 snapshot

```typescript
// button.test.tsx 示例结构
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { Button } from "./button";

describe("Button", () => {
  it("renders with default variant", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
  // ... 其他 case
});
```

## 何时新增 ui 原子

新增条件（同时满足）：
1. 2+ 个 feature 都有相似需求的 DOM 结构
2. 样式逻辑涉及 cva 变体或重复 utility class 字符串
3. 不是什么复杂交互（复杂交互走 feature/components，不走 shared/ui）

**不在本期引入的复合体**（V1 排除，等真实需求）：
- Sidebar（chat 域专用）
- Dialog / Sheet（需要 Radix 基础，V2 再议）
- Dropdown Menu（需要 Radix 基础，V2 再议）
- Data Table（无需求）

## Radix / Kobalte 排除决定

V1 明确排除 Radix UI 和 Kobalte 依赖，理由：

- V1 只缺 5 个原子（Button/Input/Textarea/Checkbox/Card），已有实现
- Dialog 需求未出现，引入 Radix 会带来 50KB+ bundle 成本
- 若 V2 出现 Dialog/Sheet 需求，走新 ADR 评估（Radix vs Kobalte vs 手写）

## 变更维护者

`src/shared/ui/` 下的组件由 `@/shared/ui` 维护者统一负责，任何 feature 开发者均可提 PR，review 时重点检查 cva 用法正确性和测试覆盖率。
