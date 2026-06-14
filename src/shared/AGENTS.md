# src/shared — 跨 Feature 共享规范

> 本目录是**只读的跨域基础设施**，所有 feature 均可 import，但任何 feature 均不可被 shared 依赖。

## 子目录职责

| 子目录 | 内容 | 维护者 |
|---|---|---|
| `lib/` | `tauri.ts`（IPC invoke 入口）+ `cn.ts`（clsx+tailwind-merge） | @/shared/lib 维护者 |
| `types/` | 跨域 TypeScript 类型：Settings / Message / Conversation / Snapshot / AppError | 全员（改动走 DR） |
| `state/` | 跨域 Solid 状态：`theme.ts`（`<html class="dark">` 切换） | @/shared/state 维护者 |
| `assets/` | logo.svg 等静态资源 | 全员 |
| `ui/` | 5 个原子组件：Button / Input / Textarea / Checkbox / Card | @/shared/ui 维护者 |

## Import 方向规则

```
features/chat  ──imports──►  shared/
features/settings              shared/ui/
features/billing                shared/types/
                                 shared/state/
                                 shared/lib/
```

**反向禁止**：`shared/` 目录下任何文件不得 import `src/features/` 下的任何模块。

编译期无法强制此约束，靠 code review 守护。

## 文件命名约定

- `index.ts` 仅用于 public API barrel 导出（每个 feature 根 + shared/lib + shared/types）
- 非 barrel 文件：各自独立的 `.ts` / `.tsx`，不追求 `index` 聚合
- 测试文件：`*.test.ts` 或 `*.test.tsx`，与被测文件同目录

## cn 工具

`src/shared/lib/cn.ts` 是 `clsx + tailwind-merge` 的组合工具。

```typescript
import { cn } from "../lib/cn";
// or with path alias
import { cn } from "@/shared/lib/cn";
```

**所有 UI 组件的 className 合并必须用 `cn()`**，不得手动拼接模板字符串或用 `clsx()` 单独使用。

**为什么**：tailwind-merge 解决同一 utility 的冲突（如 `px-2 px-4` → `px-4`），clsx 处理条件开关。两者缺一会有潜在样式 bug。

## 测试策略

| 文件 | 测试方式 |
|---|---|
| `cn.ts` | 独立测试（`cn.test.ts`），覆盖冲突合并 + 条件拼接 |
| `state/theme.ts` | 独立测试（`theme.test.ts`），覆盖 dark mode 切换 |
| `ui/*.tsx` | 各自独立的 `*.test.tsx`，契约测试 < 50 LOC（详见 `ui/AGENTS.md`） |
| 其他 shared 文件 | 跟随消费方 feature 的集成测试，不单独写 |

## 变更流程

1. 改动 `shared/` 下的基础设施前，确认没有 feature 会意外破坏
2. `cn.ts` 改动需要独立测试全量通过
3. 新增 shared 类型需要同步 Rust backend（走 Tauri 命令或 shared 类型定义）
