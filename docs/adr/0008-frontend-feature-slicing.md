# ADR 0008 — Feature-Sliced 前端分层 + shadcn 风格 UI 原子

- Status: Accepted
- Date: 2026-06-14
- Scope: codeman-agent V1 frontend architecture (src/ structure + UI primitive stack)

## Context

V1 完成时（Wave 1-7），src/ 目录已积累 5 个 UI 组件 + 7 个 logic 文件，inline class 重复约 15 处。开发者每次新增 Button 或 Input 要复制 50+ 字符的 utility class 字符串，视觉实现漂移风险高。src/agent/ 下的 components 和 store 混杂了 chat 域和 settings 域逻辑，跨域 import 频繁，边界模糊。

同时，Wave 4-6 已引入 Tailwind v4（ADR-0006），但组件样式全靠内联字符串复用，没有复用抽象层。Settings 域的 ProviderCard 和 Chat 域的 Sidebar 视觉风格略有不同，缺乏统一约束。

本期（Wave 8）决定一次性收口前端分层结构：

1. **目录切分**：按业务域（features/）替代按技术层（agent/components 等），解决跨域 import 混乱和 atomic conflict 问题
2. **UI 原子抽取**：5 个排版 / 受控交互原子（Button / Input / Textarea / Checkbox / Card）通过 cva + clsx + tailwind-merge + lucide-solid 抽象，消除 inline class 重复
3. **图标替换**：5 处 Unicode 字符全面替换为 lucide-solid 图标，设置域 7 个具体图标

## Decision

### 目录结构

src/ 全面改成 Feature-Sliced 结构：

```
src/
├── shared/                    # 跨 feature 共享（按 type 分类）
│   ├── lib/                   # tauri.ts + cn.ts
│   ├── types/                 # 跨域类型
│   ├── state/                 # theme
│   ├── assets/
│   └── ui/                    # 5 原子
└── features/
    ├── chat/                  # runtime + 2 stores + 4 components + routes
    ├── settings/              # ProviderCard + 2 subsystems + routes
    └── billing/               # tools + types（无 UI）
```

**路由保持 code-based TanStack Router**，不引入 @tanstack/router-plugin。routes 跟 feature 走（src/features/chat/routes/index.tsx + src/features/settings/routes/settings.tsx）。

### UI 原子栈

| 包 | 版本 | 用途 |
|---|---|---|
| `class-variance-authority` | `^0.7.1` | 变体契约（Button 6v×4s） |
| `clsx` | `^2.1.1` | 条件 className 拼接 |
| `tailwind-merge` | `^3.6.0` | 冲突 utility 解决（px-2 + px-4 → px-4） |
| `lucide-solid` | `^1.18.0` | 图标库（1000+ 图标，Solid 官方包） |

**cn 工具**：`clsx + tailwind-merge` 组合，在 `src/shared/lib/cn.ts` 导出。所有 UI 组件 className 合并必须用 `cn()`，不得用 `clsx()` 单独使用。

### 范围限制

**引入（OK）**：
- 纯排版原子（Button / Input / Textarea / Checkbox）
- 受控交互原子（Checkbox 用 native `<input type="checkbox">`）
- 静态复合容器（Card + 7 子件）

**排除（V1）**：
- Radix UI / Kobalte — V1 排除 dependency 风险，等真实 Dialog 需求再开新 ADR
- shadcn 复杂复合体 — Sidebar / Dialog / Sheet / DropdownMenu 全部 V1 排除

### Card 7 子件契约

Card + CardHeader + CardTitle + CardDescription + CardContent + CardFooter + CardAction — 7 个静态子件，**用 cn 不用 cva**（样式固定，无动态变体需求）。

### 图标决策

全面用 lucide-solid 替换 Unicode 字符（5 处）。设置域 7 个具体图标：

| 用途 | 图标 |
|---|---|
| 添加 Provider | `Plus` |
| 搜索 | `Search` |
| 设置入口 | `Settings` |
| 返回 | `ArrowLeft` |
| 发送消息 | `Send` |
| 关闭 | `X` |
| 删除 | `Trash2` |

## Why not...

### Why not 保留按技术层切分（旧 src/agent/components）

旧结构 `src/agent/components/` 包含来自 chat 和 settings 两个域的组件，跨域 import 导致边界腐蚀。同质化命名（`components/` 下什么都放）无法表达业务语义，每次新增组件要理解上下文才能决定放哪里。Feature-sliced 让 import 方向天然表达依赖方向。

### Why not Bulletproof-react / Nx-style libs/ + apps/

Bulletproof-react 的 `libs/` 目录是按技术角色划分（hooks / utils / api），适合 10+ 开发者的大型团队。codeman-agent V1 规模 2-3 人，前端代码 2000 行，不需要 Nx monorepo 带来的认知开销。Feature-sliced 在同一 src/ 内按业务域分，是 V1 规模最轻量的正确抽象。

### Why not shadcn full 复刻（含 Radix primitives）

shadcn/ui 的设计目标是 React 生态，Radix UI 是其交互基础。Solid 生态没有等价的 Radix 移植（solid-ui / kobalte 成熟度不一）。V1 的 UI 需求只缺 5 个原子，现有实现已够用。引入 Radix 会带来 50KB+ bundle 成本，且 Dialog 需求尚未出现。V2 出现 Dialog 时走新 ADR 评估。

### Why not 保持 inline utility class 不抽取

Wave 4-6 的 15 处 class 重复证明 inline 不可扩展。Button 新增 `destructive` 变体需要改 3 个文件而不是 1 个。cn + cva 的抽象成本（~100 行基础设施）远低于重复风险，是经过验证的工程取舍。

### Why not @tanstack/router-plugin file-based routing

TanStack Router 的 file-based routing 需要 Vite 插件 + 约定目录结构，当前 code-based（`src/router.tsx` 用 `createRootRoute`）改动最小且已稳定。V1 只有 2 个路由（/ 和 /settings），file-based 的路由发现优势在 V1 规模完全体现不出。V2 若新增 per-conversation 路由，ADR 评估是否迁移。

## Consequences

**目录结构替换**：src/agent/ + src/lib/ + src/routes/ + src/assets/ 全部迁移到 src/features/{chat,settings,billing}/ + src/shared/{ui,lib,types,state,assets}/。git history 在新目录断裂（untracked files），但文件内容正确。

**20 个测试全通过**：Button / Input / Textarea / Checkbox / Card 5 个 ui 原子各配套测试，theme 配套测试，cn 配套测试。Card 测试 71 行超过 50 LOC 约定，因 7 个子件每个至少验证一个 DOM 结构，属于可记录例外。

**ProviderCard 重构**：settings/components/ProviderCard 用 Card 7 子件（CardHeader 包含 CardTitle + CardDescription + CardAction）重构，验证 Card 契约在真实组件中的可用性。

**runtime.ts 死代码清理**：原 `src/agent/runtime.ts` 内 inline 的 billingTools 定义删除，改为从 `src/features/billing/tools/billing.ts` 导入。routes/ 和 components/ 的 icon 替换 4+3 处。

**跨 feature import 方向强制**：features → shared OK，shared → features 禁止。编译期无法强制，靠 code review 守护。

**ADR-0008 自身**：本 ADR 记录 Feature-Sliced + UI 原子栈的完整决策，替代 Wave 7 期间对 `src/AGENTS.md` 的重写承诺。

**已知坑保留**：pi-mono 版本错位（pi-ai@0.73.1 vs pi-agent@0.9.0）仍是 runtime.ts 顶部的 `as any` 桥接，V1 scope 外。

## References

- 顶层 `AGENTS.md`（"目录布局" 段）
- `src/shared/AGENTS.md`（shared 规则）
- `src/shared/ui/AGENTS.md`（5 原子契约）
- `src/features/chat/AGENTS.md`
- `src/features/settings/AGENTS.md`
- `src/features/billing/AGENTS.md`
- ADR-0006 (Tailwind v4 utility-only)
- ADR-0007 (完整原生窗口 + TanStack Router)
- ADR-0003 (Effect-TS 逻辑层 + UI 不导入 effect)
- solidcn-ui/solidcn (shadcn Solid port) — 借鉴 Button/Card 模式
- lucide-solid v1.18.0 官方包
- class-variance-authority 文档
