# src/features/billing/ — Billing Feature (计费域)

> **Scope：** V1 billing 工具 schema + types。本目录无 UI，无 runtime 接入。

## 目录布局

```
src/features/billing/
├── index.ts              # Barrel: exports tools + shared types
├── AGENTS.md             # 本文件
└── tools/
    ├── billing.ts        # Tool definitions (getBalance, getPlanQuota, billingTools)
    └── billing.test.ts   # Effect service tests (BillingService mock)
```

## 本 Feature 包含的内容

- **Tool schemas**（`billing.ts`）：`getBalance` 和 `getPlanQuota` 作为 pi-ai `Tool` 对象。
  - `getBalance`：获取 DeepSeek/MiniMax 的余额快照。
  - `getPlanQuota`：获取 DeepSeek/MiniMax 的套餐配额快照。
  - 两者均使用 `Type.Object({ provider: ProviderEnum })`，`ProviderEnum = Union([Literal("deepseek"), Literal("minimax")])`。

- **Types**（从 `src/shared/types` 重新导出）：
  - `Snapshot`、`Balance`、`PlanQuota`、`BillingProviderMeta`。

## 本 Feature 不包含的内容

- **无工具执行。** 工具是纯 schema 声明。执行由 chat runtime 的 `agent.subscribe` 监听器在 `tool_execution_end` 事件上分发——该逻辑在 `src/features/chat/runtime.ts` 中，不在本目录。

- **无 IPC。** 所有 billing IPC（`getSnapshot`、`hasKey`、`setKey`）位于 `BillingService`（`src/shared/lib/tauri.ts`）。工具不直接调用 IPC。

## 工具注册方式

```
// src/features/chat/runtime.ts
import { billingTools } from "../features/billing/tools/billing";

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

`billing.test.ts` 使用 `it.effect` + `Layer.succeed(BillingService, ...)` 来 mock 服务。无真实 IPC；测试验证 `getSnapshot` 分发到正确的 provider，以及 `hasKey` 对每个 provider 返回正确的布尔值。

```bash
pnpm test src/features/billing/tools/billing.test.ts
```

## 从本 Feature 导入

```ts
// 仅导入工具
import { billingTools } from "./features/billing/tools/billing";

// 或通过 barrel
import { billingTools, getBalance, getPlanQuota } from "./features/billing";
```

## 关键约束

- 禁止在 `tools/billing.ts` 内添加 HTTP 调用或 IPC。
- 禁止在此添加工具执行逻辑——它属于 runtime 的事件分发器。
- 禁止在此添加 UI 组件——billing UI（若有）属于 `src/features/chat/components/`。
