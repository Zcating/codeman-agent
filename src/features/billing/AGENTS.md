# src/features/billing/ — Billing Feature (计费域)

> **Scope：** V1 billing 工具 schema + types。本目录无 UI，无 runtime 接入。
> 本目录结构遵循 [ADR-0010](../../docs/adr/0010-frontend-5-1-folder-whitelist.md) 的 5 子目录白名单。V1.5（2026-06-15）将旧 `tools/` 合并到 `lib/`。

## 目录布局（ADR-0010 V1.5）

```
src/features/billing/
├── index.ts              # Barrel: exports tools + shared types（feature 根级唯一允许的文件之一）
├── AGENTS.md             # 本文件
└── lib/                  # 纯代码 / 工具 schema 定义（从旧 tools/ 合并）
    ├── billing.ts        # Tool definitions (getBalance, getPlanQuota, billingTools)
    └── billing.test.ts   # Effect service tests (BillingService mock)
```

> **ADR-0010 前后路径对照**：
>
> - `tools/billing.ts` → `lib/billing.ts`
> - 旧 `types/` 目录（空）已删除
> - `tools/` 目录已删除
>
> `components/`、`routes/`、`stores/`、`hooks/` 目录 V1 都没有（billing 域无 UI / 无路由 / 无 Solid signal / 无 composable）——5 子目录按需创建，本 feature 只有 `lib/` 是合理的。

## 本 Feature 包含的内容

- **Tool schemas**（`lib/billing.ts`）：`getBalance` 和 `getPlanQuota` 作为 pi-ai `Tool` 对象。
  - `getBalance`：获取 DeepSeek/MiniMax 的余额快照。
  - `getPlanQuota`：获取 DeepSeek/MiniMax 的套餐配额快照。
  - 两者均使用 `Type.Object({ provider: ProviderEnum })`，`ProviderEnum = Union([Literal("deepseek"), Literal("minimax")])`。

- **Types**（从 `src/shared/lib/types.ts` 重新导出，**路径从 `shared/types/` 改为 `shared/lib/types.ts`**——ADR-0010）：
  - `Snapshot`、`Balance`、`PlanQuota`、`BillingProviderMeta`。

## 本 Feature 不包含的内容

- **无工具执行。** 工具是纯 schema 声明。执行由 chat runtime 的 `agent.subscribe` 监听器在 `tool_execution_end` 事件上分发——该逻辑在 `src/features/chat/lib/runtime.ts`（**路径从 `chat/runtime.ts` 改为 `chat/lib/runtime.ts`**——ADR-0010）中，不在本目录。
- **无 IPC。** 所有 billing IPC（`getSnapshot`、`hasKey`、`setKey`）位于 `BillingService`（`src/shared/lib/tauri.ts`）。工具不直接调用 IPC。

## 工具注册方式

```ts
// src/features/chat/lib/runtime.ts
import { billingTools } from "../../billing/lib/billing";

new Agent({
  transport,
  initialState: {
    systemPrompt: ...,
    model,
    tools: billingTools as any,   // ← 在此注册
    messages: [],
  },
});
```

## 测试

`lib/billing.test.ts` 使用 `it.effect` + `Layer.succeed(BillingService, ...)` 来 mock 服务。无真实 IPC；测试验证 `getSnapshot` 分发到正确的 provider，以及 `hasKey` 对每个 provider 返回正确的布尔值。

```bash
pnpm test src/features/billing/lib/billing.test.ts
```

## 从本 Feature 导入

```ts
// 仅导入工具
import { billingTools } from "@/features/billing/lib/billing";

// 或通过 barrel
import { billingTools, getBalance, getPlanQuota } from "@/features/billing";
```

## 关键约束

- 禁止在 `lib/billing.ts` 内添加 HTTP 调用或 IPC。
- 禁止在此添加工具执行逻辑——它属于 runtime 的事件分发器（`src/features/chat/lib/runtime.ts`）。
- 禁止在此添加 UI 组件——billing UI（若有）属于 `src/features/chat/components/`。
- 禁止在此创建 5 子目录白名单外的子目录（无 `types/` / `subsystems/` / `tools/` 等）。
- 禁止在 5 个子目录外添加文件——billing feature 根级只允许 `index.ts` + `AGENTS.md`。

## Wave 笔记

- **Wave 6**（2026-06-14）：billing tools 拆分到 `src/features/billing/tools/`
- **Wave V1.5**（2026-06-15，ADR-0010）：`tools/` 合并到 `lib/`；types 镜像路径从 `shared/types/` 改为 `shared/lib/types.ts`
