# src/features/chat/ — Chat Feature

> **chat feature** = AgentRuntime + 2 stores + 4 components + routes. Billing tools (Wave 6) import from `src/features/chat/` once moved.

## Directory Layout

```
src/features/chat/
├── index.ts              # Barrel — public API
├── runtime.ts           # AgentRuntime + RuntimeLayer + RuntimeDeps
├── runtime.test.ts      # Runtime unit tests
│
├── store/
│   ├── conversations.ts  # Effect → Solid bridge: conversations$ + CRUD
│   ├── conversations.test.ts
│   ├── messages.ts       # Effect → Solid bridge: messages$ + stream callbacks
│   └── messages.test.ts
│
├── components/
│   ├── sidebar.tsx       # Conversation list + search (reads chatStore)
│   ├── sidebar.test.tsx
│   ├── message-bubble.tsx # Role-aware message renderer (user/assistant/tool/system)
│   ├── message-bubble.test.tsx
│   ├── tool-call-card.tsx # Tool invocation card (running/success/error states)
│   ├── tool-call-card.test.tsx
│   ├── chat-view.tsx     # Main chat UI (subscribes runtime events → store)
│   └── chat-view.test.tsx
│
└── routes/
    └── index.tsx         # ChatLayout — Sidebar + ChatView + Settings link
```

## Hard Constraints

- **UI components (`components/*.tsx`) must NOT import `effect`.** They are pure Solid signal consumers. Logic lives in `store/` and `runtime.ts`.
- **`AgentRuntime` is a single-instance.** `AgentRuntimeLive` holds `Ref<Agent | null>`. Only one `run()` at a time. `cancel()` calls `agent.abort()`.
- **Store is the only bridge layer.** `store/*.ts` converts Effect results to Solid signals via `Effect.runPromiseExit`. Components never call `Effect.runPromise` directly.
- **No IPC from components.** All Tauri IPC goes through `src/shared/lib/tauri.ts` Service Tags.
- **`Sidebar` uses `createSignal` for local state.** The `query` / `debouncedQuery` / `setQuery/setDebouncedQuery` signals are component-local and do NOT conflict with store exports.

## Runtime Events (5 variants)

| Variant | Payload | UI Side Effect |
|---|---|---|
| `token` | `string` | `appendAssistantMessageDelta` |
| `tool_call` | `ToolCall` | `appendToolCall` |
| `tool_result` | `toolCallId + result + error?` | `finalizeToolResult` |
| `done` | `Message` | `finalizeAssistantMessage` |
| `error` | `{ message: string }` | logged only |

## pi-mono Version Drift (Known Issue)

`runtime.ts` has `// pi-ai@0.73.1 vs pi-agent@0.9.0 type drift — `as any` bridge` at line ~119.
`pi-ai@0.73.1` exports `Tool` (no `AgentTool`). `pi-agent@0.9.0` expects `AgentTool` (has `label + execute`).
Current workaround: `as any` cast on `billingTools`. **Before upgrading pi-ai**, remove the `as any` cast and wire real Model via `getModel()`.

## Test Patterns

| Layer | Test file | Framework |
|---|---|---|
| Runtime | `runtime.test.ts` | `@effect/vitest` + `it.effect()` + `Layer.succeed` |
| Store | `store/*.test.ts` | `@effect/vitest` + `it.effect()` + `Layer.succeed` |
| Components | `components/*.test.tsx` | `vitest` + `@solidjs/testing-library` + `render` |

Component tests mock the store module via `vi.mock("../store/X")`. Runtime tests provide mock `SettingsService` + `BillingService` via `Layer.mergeAll`.

## Icon Strategy

Icons come from **lucide-solid** (already a project dependency). Do NOT use emoji in new code.
Existing emoji (`⏳ ✓ ✗`) in `tool-call-card.tsx` are grandfathered; new UI uses lucide-solid.

## Wave 4 Notes

- All files migrated from `src/agent/` → `src/features/chat/`
- Import paths updated: `../../lib/tauri` → `../../../shared/lib/tauri`, etc.
- `routes/index.tsx` updated: `../agent/components/*` → `../../agent/components/*`
- `lucide-solid` icons added: `Plus` in `sidebar.tsx`, `Send`/`X` in `chat-view.tsx`, `Settings` in `routes/index.tsx`
- `runtime.test.ts` migrated alongside `runtime.ts` (test stays with impl)
- Old files in `src/agent/` and `src/routes/index.tsx` left in place for Wave 7 cleanup
