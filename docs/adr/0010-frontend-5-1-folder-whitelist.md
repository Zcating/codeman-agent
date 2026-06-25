# ADR 0010 — 前端 5+1 子目录白名单 + 跨域类型/lib 收口 + mockState 单一源

- Status: Accepted
- Date: 2026-06-15
- Scope: codeman-agent V1 前端 src/ 结构第二轮收口（ADR-0008 之后的延伸）

## Context

ADR-0008（Wave 8，2026-06-14）完成了 src/ 从"技术层（agent/components 等）"到"业务域（features/）"的迁移，落地结构：

```
src/
├── shared/
│   ├── lib/           # tauri.ts + cn.ts
│   ├── types/         # 跨域类型
│   ├── state/         # theme
│   ├── assets/
│   └── ui/            # 5 原子
└── features/
    ├── chat/          # components/ + routes/ + store/ + runtime.ts
    ├── settings/      # components/ + routes/ + subsystems/
    └── billing/       # tools/ + types/
```

落地后产生 4 类问题，本期一次性收口：

1. **子目录命名不一致**：chat 域 `store/`（单数）、shared `state/`（单数）、feature 内 `subsystems/` / `tools/`、shared `ui/`（5 原子）。6 个允许外子目录、5 种命名，新人 5 分钟说不清"Effect service 放哪"。
2. **共享类型走单独目录**：`shared/types/` 装 5 个域类型，跟 `lib/` 其它 pure util 平级但分目录，无强理由。
3. **`mockState` 双源 bug**：`src/__mocks__/@tauri-apps/api/core.ts`（vitest 约定路径，settings.test.tsx 直接 import 此处 mockState）和 `src/shared/shared-mock-state.ts`（test-setup.ts 用此 mock invoke）独立定义同名 export，互不引用。配置 `mockState.resolved` 改 A 不会影响 B——是真实隐藏 bug。
4. **死代码 / 空目录**：`src/assets/logo.svg`（无 import）、`src/styles/`（空）、`features/<feature>/types/`（3 个空目录）、`shared/mocks/`（仅 1 个文件且功能重复）、`subsystems/` 与 `tools/` 在新结构下概念重复。

本期决定收口到 **5+1 白名单**：每个 feature 最多 5 个允许子目录、shared 最多 6 个（其中 components 拆 ui 与 internal 两子目录）。所有现存"非白名单"内容（subsystems、tools、store、state、types、ui、mocks、empty dirs）一次性归位或删除。

## Decision

### 5+1 子目录白名单

**每个 `features/<feature>/` 允许的子目录**（白名单，按需创建，不需要全部存在）：

| 子目录        | 语义                                                                 | 文件示例                                       |
| ------------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| `stores/`     | 暴露 Solid signal / store / Accessor 的反应式状态                    | `conversations.ts`, `messages.ts`              |
| `components/` | UI 组件（PascalCase 导出，kebab-case 文件）                          | `chat-view.tsx`, `provider-card.tsx`           |
| `routes/`     | 路由组件                                                             | `index.tsx`                                    |
| `hooks/`      | Solid composable（`use-` 前缀，参数或返回值含 Accessor）             | `use-debounce.ts`, `use-conversations.ts`      |
| `lib/`        | 纯函数 / Effect-TS service / Effect runtime / 类型 / schema / 格式化 | `runtime.ts`, `llm-providers.ts`, `billing.ts` |

**`shared/` 允许的子目录**：

| 子目录                 | 语义                                                                              | 现状                                           |
| ---------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------- |
| `stores/`              | 跨域 Solid signal                                                                 | `theme.ts`（从 `state/` 迁）                   |
| `components/ui/`       | 跨域设计系统原子                                                                  | 5 原子（从 `ui/` 迁）+ `AGENTS.md`             |
| `components/internal/` | 跨域业务组件（ErrorBoundary / LoadingSpinner / Provider wrappers / Layout atoms） | 空，V1 预留                                    |
| `hooks/`               | 跨域 Solid composable                                                             | 空，V1 预留                                    |
| `lib/`                 | 纯函数 / 跨域类型 / 跨域 util                                                     | `cn.ts` + `tauri.ts` + `units.ts` + `types.ts` |

### Feature 根级只允许两个文件

每个 `features/<feature>/` 根级**只允许**：

- `index.ts` — public API barrel
- `AGENTS.md` — feature 规则

所有其它文件（runtime、service、tool schema、bridge、类型）必须落在 5 个子目录之一。`chat/runtime.ts` 当前在 feature 根级，迁到 `chat/lib/runtime.ts`。

### 现有 → 新映射

| 当前位置                                              | 域       | 新位置                                                                  |
| ----------------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| `chat/store/conversations.ts`                         | chat     | `chat/stores/conversations.ts`                                          |
| `chat/store/messages.ts`                              | chat     | `chat/stores/messages.ts`                                               |
| `chat/runtime.ts`（根级）                             | chat     | `chat/lib/runtime.ts`                                                   |
| `chat/runtime.test.ts`（根级）                        | chat     | `chat/lib/runtime.test.ts`                                              |
| `settings/subsystems/llm_providers.ts`                | settings | `settings/lib/llm-providers.ts`（**同时修复 snake_case → kebab-case**） |
| `settings/subsystems/system-prompt.ts`                | settings | `settings/lib/system-prompt.ts`                                         |
| `billing/tools/billing.ts`                            | billing  | `billing/lib/billing.ts`                                                |
| `shared/state/theme.ts`                               | shared   | `shared/stores/theme.ts`                                                |
| `shared/state/theme.test.ts`                          | shared   | `shared/stores/theme.test.ts`                                           |
| `shared/types/index.ts`                               | shared   | `shared/lib/types.ts`（合并为单文件）                                   |
| `shared/ui/{button,card,checkbox,input,textarea}.tsx` | shared   | `shared/components/ui/{...}.tsx`                                        |
| `shared/ui/AGENTS.md`                                 | shared   | `shared/components/ui/AGENTS.md`                                        |

### 删除项

| 路径                              | 理由                                                              |
| --------------------------------- | ----------------------------------------------------------------- |
| `src/assets/logo.svg`             | 死代码（无 import，tauri.conf.json icon 指向 `src-tauri/icons/`） |
| `src/styles/`                     | 空目录                                                            |
| `src/shared/shared-mock-state.ts` | 与 `src/__mocks__/@tauri-apps/api/core.ts` 重复，迁移唯一源后删除 |
| `src/shared/mocks/`               | 删除 shared-mock-state.ts 后为空                                  |
| `src/shared/types/`               | 已合并到 `lib/types.ts`                                           |
| `src/shared/state/`               | 已重命名为 `stores/`                                              |
| `src/shared/ui/`                  | 已重命名为 `components/ui/`                                       |
| `features/chat/types/`            | 当前为空（无任何文件）                                            |
| `features/chat/store/`            | 已重命名为 `stores/`                                              |
| `features/settings/types/`        | 空                                                                |
| `features/settings/subsystems/`   | 已合并到 `lib/`                                                   |
| `features/billing/types/`         | 空                                                                |
| `features/billing/tools/`         | 已合并到 `lib/`                                                   |

### mockState 单一源（Bug 修复）

**唯一源**：`src/__mocks__/@tauri-apps/api/core.ts`（vitest 约定路径，自动应用）。

**修复步骤**：

1. 保留 `src/__mocks__/@tauri-apps/api/core.ts` 中的 `mockState` 定义与 `invoke` 实现
2. 删除 `src/shared/shared-mock-state.ts`
3. `src/test-setup.ts` 改为 `import { mockState } from "src/__mocks__/@tauri-apps/api/core"`
4. `features/settings/components/provider-card.test.tsx`、`features/settings/subsystems/llm_providers.test.ts`（迁到 `features/settings/lib/` 后）改为从 `src/__mocks__/@tauri-apps/api/core` import
5. `features/settings/routes/settings.test.tsx`（当前已从 `__mocks__/` import，路径不变但因父目录迁移 import 路径需更新）

**修复后**：`mockState` 在测试运行时与配置时是同一引用，配置 `resolved` 立即影响 `invoke` 返回。

### 命名约定

- 文件名统一 **kebab-case**（项目既有约定，AGENTS.md "硬性规则" 段）
- **唯一例外修复**：`llm_providers.ts` → `llm-providers.ts`（项目内唯一 snake_case）
- hooks 文件以 `use-` 前缀：`use-theme.ts`、`use-debounce.ts`、`use-conversations.ts`
- 组件 PascalCase 导出：`MessageBubble` from `message-bubble.tsx`
- barrel 仅在 feature 根 `index.ts` 用，**子目录不强制 `index.ts`**

### 语义边界（"store vs hook vs lib"）

| 类别      | 判定                                                                                                                                    | 例子                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `stores/` | 暴露 Solid signal / store / Accessor                                                                                                    | `conversations.ts`（导出 `Accessor<Conversation[]>`）                          |
| `hooks/`  | 至少满足：① 导入 solid 运行时（createSignal / createMemo 等）；② 参数或返回类型含 `Accessor` / `Signal` / `Setter`；③ 名字以 `use` 开头 | `useTheme()`, `useDebounce(value: Accessor<T>)`                                |
| `lib/`    | 无 Solid 原语：纯函数、格式化、type guard、Effect service、Effect runtime、schema 定义、跨域类型                                        | `cn()`, `units.ts`, `runtime.ts`, `llm-providers.ts`, `billing.ts`, `types.ts` |

## Why not...

### Why not 保留 `subsystems/` 作为 settings 域的命名

`subsystems/`（settings 域）和 `tools/`（billing 域）装的都是"无 UI、无 Solid 原语、纯 Effect/service 的代码"——区别只是命名。两个命名 + 不同文件位置 = 同一概念 2 次表达，违反 DRY。合并到 `lib/` 后命名统一为"lib = 纯代码"，跟 Q1 决策一致；不同 feature 走 `lib/` 不同子文件，由 feature 域自然区分。

### Why not 把 Effect service / runtime 放进 `stores/`

`stores/` 在本 ADR 语义是"暴露 Solid signal/store/Accessor"——即 UI 反应式原语。Effect-TS service（Context.Tag + Layer.effect）不暴露 Solid 原语，是给桥接层消费的"逻辑层"模块；agent runtime 是单例，封装 pi-mono loop 也不暴露 Solid signal。强行塞进 `stores/` 会让"store = 反应式状态"的语义被压扁，未来读 `chat/lib/runtime.ts` 的人会困惑为什么它跟 `conversations.ts` 平级。

### Why not 保留 `state/` 目录（跟 `stores/` 平行）

`shared/state/theme.ts` 和 `chat/stores/conversations.ts` 装的都是 Solid signal——本质是同一类东西。`state/` 与 `stores/` 并存会让"什么用 state、什么用 stores"成为新问题；且 shared 用单数 state、feature 用复数 stores，命名不统一。统一为 `stores/`（复数）后，所有 Solid 反应式状态走同一目录名（与 file name `theme.ts`、`conversations.ts` 的单数自然形成复数-单数呼应）。

### Why not 保留 `types/` 单独目录

`types/` 装的是纯 TypeScript 类型——不引入运行时、不参与依赖图。放在 `lib/types.ts`（一个文件）即可，搜代码时一个 grep 找到所有跨域类型。单独 `types/` 目录 + `index.ts` barrel 是"多文件、多域类型分类"需求时才合理的抽象，本项目当前 5 个类型域（Settings / Message / Conversation / Snapshot / AppError）规模太小，不值得。

### Why not 保留 `mocks/` 目录

`mocks/` 只装了 `shared-mock-state.ts` 一个文件，且该文件的 `mockState` 在 `src/__mocks__/@tauri-apps/api/core.ts` 已有等价定义。两者不互通是 bug，不是设计。`src/__mocks__/` 是 vitest 约定路径，删除 `shared/mocks/` 后所有 mock 走 `src/__mocks__/`，零认知负担，且修复双源 bug。

> **2026-06-15 实施补充**：上述 ADR 中"仓库根 `__mocks__/`"已迁至 `src/__mocks__/`（保持 vitest auto-mock 行为不变）。tsconfig.json 的 `"include": ["src"]` 覆盖 `src/__mocks__/`，无需修改。所有引用路径的深度统一为：从 `src/test-setup.ts` 看是 `./__mocks__/@tauri-apps/api/core`，从 `src/features/<feature>/<dir>/<file>.test.tsx` 看是 `../../../__mocks__/@tauri-apps/api/core`。

### Why not `shared/assets/` 装 logo.svg

`logo.svg` 当前在 `src/assets/`，codebase 中无任何 import，`tauri.conf.json` 的 icon 路径指向 `src-tauri/icons/`。`src/assets/logo.svg` 是死代码。直接删除。如果未来真出现跨域静态资源需求，再开新 ADR 把 `shared/assets/` 加进白名单（届时按 YAGNI 评估）。

### Why not 强制每个 feature 必须有 5 个子目录

billing 是"无 UI 工具 schema"——只有 `lib/`，没有 components/routes/hooks/stores 是合理状态。强制 5 个会出现 4 个空文件夹，git 追踪噪音 + "空目录是设计还是遗漏"歧义。允许按需创建是 YAGNI + 实用主义。

### Why not 把 AGENTS.md 也放进子目录

AGENTS.md 是该 feature 域的"leading source of truth"——开发者进入 feature 第一眼看的就是 `AGENTS.md`。把它放在 feature 根级（`features/<feature>/AGENTS.md`）而非 `features/<feature>/lib/AGENTS.md`，是因为：① feature 根是 IDE 折叠 / 跳读时的入口视觉点；② "AGENTS.md 是根级文件"是项目既有约定，挪到 `lib/` 反而违反"AGENTS.md 是阅读锚点"的隐含语义；③ Q2 已确认 feature 根级只允许 `index.ts` + `AGENTS.md` 两个文件，没有"AGENTS.md 必须进子目录"的约束。

## Consequences

**正面**：

- 5+1 白名单让新人 5 分钟理解 src/ 整体结构
- 命名统一：store→stores、state→stores、subsystems/tools→lib、ui→components/ui
- mockState 单一源消除了 test-setup 与 settings.test.tsx 配置互相看不见的隐藏 bug
- `llm_providers` 改为 `llm-providers`，跟 kebab-case 约定对齐
- 删除死代码（`logo.svg`）和 7 个空目录
- ADR-0008 → 0010 决策链可追溯

**负面 / 风险**：

- 一次 diff 较大（约 30 文件 move + 5 个 import path 重写 + 6 个 AGENTS.md 重写 + 1 新 ADR + 1 ADR 注释）
- `components/internal/` 暂时空，未来"什么是 internal 组件"需新 ADR 跟进
- `hooks/` 在 chat / settings / shared 全部空（V1 预留位），未来命名约定（`use-X`）需要在首个 hook 落地时验证
- 5 个跨域类型从 `shared/types/index.ts` 合并到 `shared/lib/types.ts` 单文件，未来类型增长时可能要重新拆分

**回归验证**：

- `vp run typecheck` 必须通过
- `vp run test` 全部通过（chat 4 测试 + settings 3 测试 + billing 1 测试 + shared 7 测试 = 15 测试）
- 所有迁路径的 import 必须全部更新（grep 自查）

**已知坑保留**：

- pi-mono 版本错位（pi-ai@0.73.1 vs pi-agent@0.9.0，`runtime.ts` 顶部 `as any` 桥接）仍是 V1 scope 外
- V1.5 中文注释规则（ADR-0009）继续生效

**文档同步**：

- 顶层 `AGENTS.md` 目录布局段重写
- `src/AGENTS.md` 从 V0 描述重写为 V1 + 本轮决策（V0 描述已严重过时）
- `src/shared/AGENTS.md` 重写为 5+1 白名单 + components/ui vs internal 区分
- `src/shared/ui/AGENTS.md` → `src/shared/components/ui/AGENTS.md`（路径迁移）
- `src/features/chat/AGENTS.md` 重写（runtime.ts → lib/、store → stores）
- `src/features/settings/AGENTS.md` 重写（subsystems → lib/、llm_providers → llm-providers）
- `src/features/billing/AGENTS.md` 重写（tools → lib/）
- ADR-0008 加 "Superseded in part by ADR-0010" 注

## References

- ADR-0008 (Feature-Sliced 前端分层 + shadcn 风格 UI 原子) — V1.0 初版结构
- ADR-0003 (Effect-TS 逻辑层) — UI 不导入 effect 规则不变
- ADR-0006 (Tailwind v4 utility-only) — 不变
- ADR-0007 (完整原生窗口 + TanStack Router) — 路由结构不变
- ADR-0009 (开发者语言中文化策略 V1.6+) — 注释 / 治理文档 / 测试描述走中文
- 顶层 `AGENTS.md`
- `src/AGENTS.md`
- `src/shared/AGENTS.md`
- `src/features/chat/AGENTS.md`
- `src/features/settings/AGENTS.md`
- `src/features/billing/AGENTS.md`
- vitest 文档：`__mocks__/` 自动应用规则
