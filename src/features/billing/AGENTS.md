# src/features/billing — Billing Feature

> **Scope:** V1 billing tool schemas + types. No UI, no runtime wiring in this directory.

## Directory Layout

```
src/features/billing/
├── index.ts              # Barrel: exports tools + shared types
├── AGENTS.md             # This file
└── tools/
    ├── billing.ts        # Tool definitions (getBalance, getPlanQuota, billingTools)
    └── billing.test.ts   # Effect service tests (BillingService mock)
```

## What This Feature Contains

- **Tool schemas** (`billing.ts`): `getBalance` and `getPlanQuota` as pi-ai `Tool` objects.
  - `getBalance`: fetches balance snapshot for DeepSeek/MiniMax.
  - `getPlanQuota`: fetches plan quota snapshot for DeepSeek/MiniMax.
  - Both use `Type.Object({ provider: ProviderEnum })` with `ProviderEnum = Union([Literal("deepseek"), Literal("minimax")])`.

- **Types** (re-exported from `src/shared/types`):
  - `Snapshot`, `Balance`, `PlanQuota`, `BillingProviderMeta`.

## What This Feature Does NOT Contain

- **No tool execution.** Tools are pure schema declarations. Execution is dispatched by the
  chat runtime's `agent.subscribe` listener on `tool_execution_end` events — that lives in
  `src/features/chat/runtime.ts`, not here.

- **No IPC.** All billing IPC (`getSnapshot`, `hasKey`, `setKey`) lives in `BillingService`
  (`src/shared/lib/tauri.ts`). Tools do not call IPC directly.

## How Tools Are Registered

```
// src/features/chat/runtime.ts
import { billingTools } from "../features/billing/tools/billing";

new Agent({
  transport,
  initialState: {
    systemPrompt: ...,
    model,
    tools: billingTools as any,   // ← registered here
    messages: [],
  },
});
```

## Tests

`billing.test.ts` uses `it.effect` + `Layer.succeed(BillingService, ...)` to mock the
service. No real IPC; tests verify `getSnapshot` dispatches to the correct provider and
that `hasKey` returns the right boolean per provider.

```bash
pnpm test src/features/billing/tools/billing.test.ts
```

## Importing From This Feature

```ts
// Import tools only
import { billingTools } from "./features/billing/tools/billing";

// Or via barrel
import { billingTools, getBalance, getPlanQuota } from "./features/billing";
```

## Key Constraints

- Do NOT add HTTP calls or IPC inside `tools/billing.ts`.
- Do NOT add tool execution logic here — it belongs in the runtime's event dispatcher.
- Do NOT add UI components here — billing UI (if any) belongs in `src/features/chat/components/`.
