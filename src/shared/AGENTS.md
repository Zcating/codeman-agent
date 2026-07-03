# src/shared — 跨 Feature 共享规范（5+1 白名单）

> 本目录是**只读的跨域基础设施**，所有 feature 均可 import，但任何 feature 均不可被 shared 依赖。完整决策见 [ADR-0010](../../docs/adr/0010-frontend-5-1-folder-whitelist.md)。

## 5+1 子目录职责

| 子目录                 | 语义                                                                                                    | 现状                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `lib/`                 | 纯函数 + 跨域类型：`cn.ts` / `logger.ts` / `ipc.ts` / `units.ts` / `types.ts` / `format-app-error.ts` / `design-tokens.ts` | 7 个文件（ADR-0010 前：3 文件；ADR-0018 加 `logger.ts`；ADR-0016 加 `format-app-error.ts`；**ADR-0022** 加 `design-tokens.ts`；T5 迁移：`tauri.ts` → `ipc.ts`） |
| `stores/`              | 跨域 Solid signal                                                                                       | `theme.ts`（从 `state/` 迁，ADR-0010）                                                                        |
| `hooks/`               | 跨域 composable（`use-` 前缀）                                                                          | 空，V1 预留                                                                                                   |
| `components/ui/`       | 跨域**设计系统原子**                                                                                    | 6 原子（Button / Card / Checkbox / Input / Textarea / **Dialog**）+ `codeman-select.tsx` + `codeman-group-select.tsx`（Select 包装，ADR-0023 D4-S）+ `AGENTS.md` |
| `components/internal/` | 跨域**业务组件**——跟本应用业务绑定但被多个 feature 复用  | `codeman-sidebar`（ADR-0022 首例）+ `codeman-dialog`（ADR-0023 D8-W6 引入，命令式 Modal：`alert` / `confirm` / `show`）；命名规则由 [ADR-0023 D4-N](../../docs/adr/0023-codeman-prefix-and-ark-ui-select.md) 锁定 |

**`shared/` 不允许**的子目录（旧命名已废弃，违反 ADR-0010 一律删除）：

- `types/` — 旧跨域类型目录，合并到 `lib/types.ts`
- `state/` — 旧 Solid 状态目录，重命名为 `stores/`
- `ui/` — 旧设计系统目录，重命名为 `components/ui/`
- `mocks/` — 已删除，唯一源在 `src/__mocks__/ipc-mock.ts`（T5 迁移：`@tauri-apps/api/core` → `ipc-mock`）
- `assets/` — 当前无跨域静态资源需求；如未来有新增，走新 ADR 加进白名单

## components/ui vs components/internal 边界（Q4 决策）

| 类别                   | 定义                                                     | 例子                                                                                 |
| ---------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `components/ui/`       | **跨域设计系统原子**——不依赖具体业务，可在其它项目里复用 | Button / Input / Textarea / Checkbox / Card / **Select**（codeman-select + codeman-group-select wrappers，ADR-0023 D4-S）/ **Dialog**（`dialog.tsx`，@ark-ui/solid 包装，ADR-0023 D8-W6） |
| `components/internal/` | **跨域业务组件**——跟本应用业务绑定但被多个 feature 复用  | ErrorBoundary / LoadingSpinner / Toast / Provider wrappers / Layout atoms / AppShell / **codeman-sidebar** / **codeman-dialog**（命令式 confirm/alert/show，ADR-0023 D8-W6） |

**为什么 `internal` 而不是 `app` 或 `feature-shared`**：与"设计系统（ui）"形成对照语义——"ui = 跨项目通用，internal = 跨 feature 通用但绑定本应用"。V1.5+ 开首例 `codeman-sidebar`（chat feature 消费；详见 [ADR-0022 D1](../docs/adr/0022-internal-components-and-design-tokens.md)）。后续新增 internal 组件须保持严格 prop-driven，不依赖任何 feature 的 store / 类型。

## Naming convention for internal/

Per [ADR-0023](../../docs/adr/0023-codeman-prefix-and-ark-ui-select.md) D4-N:
- All files in `components/internal/` MUST be prefixed with `codeman-` (e.g. `codeman-sidebar.tsx`).
- Component export name MUST match file basename (e.g. `CodemanSidebar` from `codeman-sidebar.tsx`).
- Type names exported from the file MUST use `Codeman*` prefix matching component name (e.g. `CodemanSidebarWorkspace`, `CodemanSidebarItem`, `CodemanSidebarProps`).
- Reviewers reject new internal/ files without `codeman-` prefix. No precommit enforcement.
- `components/ui/` keeps non-prefixed names (`button`, `card`, `select`, etc.).

## Import 方向规则

```
features/chat  ──imports──►  shared/
features/settings              shared/components/ui/
features/billing                shared/lib/
                                shared/stores/
                                shared/hooks/        (V1 预留)
                                shared/components/internal/  (V1 预留)
```

**反向禁止**：`shared/` 目录下任何文件不得 import `src/features/` 下的任何模块。

编译期无法强制此约束，靠 code review 守护。

## 文件命名约定

- `index.ts` 仅用于 public API barrel 导出（每个 feature 根 + shared/lib）
- 非 barrel 文件：各自独立的 `.ts` / `.tsx`，不追求 `index` 聚合
- 测试文件：`*.test.ts` 或 `*.test.tsx`，与被测文件同目录
- hooks 文件以 `use-` 前缀（Q5 决策）：`use-theme.ts` / `use-debounce.ts`

## cn 工具

`src/shared/lib/cn.ts` 是 `clsx + tailwind-merge` 的组合工具。

```typescript
import { cn } from "@/shared/lib/cn";
```

**所有 UI 组件的 className 合并必须用 `cn()`**，不得手动拼接模板字符串或用 `clsx()` 单独使用。

**为什么**：tailwind-merge 解决同一 utility 的冲突（如 `px-2 px-4` → `px-4`），clsx 处理条件开关。两者缺一会有潜在样式 bug。

## IPC 唯一入口

`src/shared/lib/ipc.ts` 是**整个项目唯一的 Electron IPC 入口**。所有 IPC 走 `window.codeman.invoke<T>(channel, args)`（由 preload 通过 contextBridge 暴露）。不应直接 `import { invoke } from "@tauri-apps/api"`（该依赖已移除）。

跨域类型（Settings / Message / Conversation / Snapshot / AppError）镜像在 `src/shared/lib/types.ts`，不单独 `types/` 目录。

## mockState 唯一源（T5 迁移）

`mockState` 唯一源在 `src/__mocks__/ipc-mock.ts`。原 `src/__mocks__/@tauri-apps/api/core.ts` 已删除。

`vitest.setup.ts` 用 `import "./__mocks__/ipc-mock"` 静态初始化 `window.codeman` mock。`mockState` 从 `ipc-mock.ts` 唯一源 import，运行时配置与测试 import 是同一引用。

## 测试策略

| 文件                        | 测试方式                                                                     |
| --------------------------- | ---------------------------------------------------------------------------- |
| `lib/cn.ts`                 | 独立测试（`cn.test.ts`），覆盖冲突合并 + 条件拼接                            |
| `lib/logger.ts`             | 独立测试（`logger.test.ts`），覆盖 level 路由 + args 透传 + prefix 大写      |
| `lib/ipc.ts`              | 跟随消费方 feature 的集成测试，不单独写                                      |
| `lib/types.ts`              | 纯类型，无运行时，不单独测                                                   |
| `lib/units.ts`              | 独立测试（`units.test.ts`），覆盖格式化边界                                  |
| `stores/theme.ts`           | 独立测试（`theme.test.ts`），覆盖 dark mode 切换                             |
| `components/ui/*.tsx`       | 各自独立的 `*.test.tsx`，契约测试 < 50 LOC（详见 `components/ui/AGENTS.md`） |
| `components/internal/*.tsx` | 各自独立的 `*.test.tsx`（V1 暂无）                                           |
| `hooks/*.ts`                | 各自独立的 `*.test.ts`（V1 暂无）                                            |

## 变更流程

1. 改动 `shared/` 下的基础设施前，确认没有 feature 会意外破坏
2. `cn.ts` 改动需要独立测试全量通过
3. 新增 shared 类型需要同步 Electron backend（`electron/types.ts` 或 IPC handler 参数）
4. 新增 `components/internal/` 首例组件前，开新 ADR 跟进（命名 / 数量上限 / 维护者）
