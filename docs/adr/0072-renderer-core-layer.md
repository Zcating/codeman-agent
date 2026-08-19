# — Renderer `core/` layer for LLM runtime + tool definitions

**Status**: accepted · 2026-08-12

## Context

### 1. Chat domain leaked agent runtime into 7 cross-domain files

Before this ADR, `src/renderer/src/features/chat/lib/` hosted the chat feature's runtime **and** the LLM agent runtime primitives. The latter were consumed by two other plugins (multi-agents, automations) and three feature files. Specifically, these chat-owned symbols were imported from outside `features/chat/`:

| Symbol                                                                                                | chat/lib location                 | Cross-domain importers                                               |
| ----------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------- |
| `ProviderConfig` (type)                                                                               | `chat/lib/runtime.ts`             | automations, multi-agents (factory + delegate-task-tool) |
| `anthropicStream`                                                                                     | `chat/lib/anthropic-stream-fn.ts` | multi-agents factory                                                 |
| `createProviderFromConfig`, `findDefaultModel`                                                        | `chat/lib/pi-provider-adapter.ts` | multi-agents factory, chat.store                                     |
| `buildSystemPrompt`, `DEFAULT_IDENTITY`, `DEFAULT_GUIDELINES`, `DEFAULT_TOOL_SNIPPETS`, `ToolSnippet` | `chat/lib/build-system-prompt.ts` | multi-agents factory, chat.store                                     |
| `createFileTools`, `webfetchTool`, `runCommandTool` (via `@codeman-frontend/tools/*`)                 | `src/renderer/src/tools/`         | chat runtime, webfetch.api                                           |

The dependency direction was wrong: chat feature should not own the LLM runtime that four different consumers need. Plugins reaching into `features/chat/lib/` for runtime primitives inverted the architectural boundary.

### 2. `ProviderConfig` lived in `chat/lib/runtime.ts` despite being a data type

`ProviderConfig` is a pure data interface (`id/models/apiKey/baseUrl/defaultModel/systemPrompt/tools/workspaceId/skills`) with zero chat-runtime dependencies. Its presence in `chat/lib/runtime.ts` was an accident of file ownership — runtime.ts was the first home for chat execution config, and `ProviderConfig` was colocated. The type is consumed by chat, multi-agents, and automations — none of which are chat.

### 3. `src/renderer/src/tools/` lived at a top-level that signalled "non-domain"

`src/renderer/src/tools/` was a peer of `src/renderer/src/features/` and `src/renderer/src/plugins/`. The name "tools" is too generic — it could hold LLM agent tools (the actual content), or CLI utilities, or build scripts. The previous `AGENTS.md` files described it as "6+1 whitelist" but lacked any architectural justification for being peer to features/.

### 4. Empty placeholder directory leaked intent drift

`src/renderer/src/shared/lib/llm/` existed as an empty directory. It suggested someone had previously planned to move LLM primitives into `shared/lib/` but never followed through. An empty placeholder in version control is worse than nothing — it telegraphs abandoned intent.

### 5. After candidate 1's 5 commits, the chat domain consolidation was incomplete

The candidate 1 chain removed `appStore` and 4 plugin-store reads from `chat.store.ts` and `runtime.ts` (commits 9acdb09 → 0d1ed07). But `chat/lib/` still owned the LLM runtime primitives that other plugins needed. Candidate 1 solved the chat-store-side cross-domain reads; this ADR solves the chat-lib-side cross-domain exports.

## Decision

### D1. Create `src/renderer/src/core/` as a permanent renderer-side architectural layer

`src/renderer/src/core/` is a peer of `src/renderer/src/features/`, `src/renderer/src/plugins/`, and `src/renderer/src/shared/`. It holds **renderer-side domain primitives** shared by chat and all plugins. It is renderer-internal (not a peer of `src/main/`); main process keeps its own boundaries.

```
src/renderer/src/
├── core/               ← NEW (this ADR)
│   ├── index.ts        ← barrel: re-exports core/llm + core/tools
│   ├── llm/
│   │   ├── runtime.ts               (LLMRuntime + createLLMRuntime, per)
│   │   ├── anthropic-stream-fn.ts   (Chromium URL-rewrite hack per)
│   │   ├── build-system-prompt.ts   (raw data → assembled system prompt)
│   │   ├── pi-provider-adapter.ts   (ProviderConfig → pi-agent Provider)
│   │   └── provider-config.ts       (data type: agent runtime config)
│   └── tools/
│       ├── file-ops/    (LLM-facing file operations)
│       ├── run-command/ (LLM-facing shell exec, ADR-0010/0038)
│       └── webfetch/    (LLM-facing HTTP fetch,)
├── features/           ← UI features (chat, settings)
├── plugins/            ← Plugins (multi-agents, automations, skills)
└── shared/             ← Cross-cutting UI utilities (apis, components, hooks, stores, lib)
```

### D2. `core/` is renderer-internal, not a peer of `src/main/`

Considered promoting `core/` to the project root (`src/core/`) for cross-process sharing. Rejected: none of the primitives are used in main process. `pi-provider-adapter` imports `@earendil-works/pi-agent-core` (renderer-bundled). `anthropicStream` rewrites a URL for Chromium's XSS filter (main process has no XSS filter). `buildSystemPrompt` is a pure string template but its consumers are all renderer-side. Tools are sent to the LLM by the renderer-side runtime. Everything in `core/` is renderer-only.

`src/main/` keeps its own boundaries: `src/main/features/*` (system-level handlers), `src/main/db/*`, `src/main/lib/*`, `src/main/plugins/*`.

### D3. `chat/lib/` keeps chat-domain state machines, not agent runtime

After this ADR, `features/chat/lib/` contains only chat-internal concerns:

- `runtime.ts` (chat execution flow, message loops, error handling)
- `chat.store.ts`, `compaction/`, `conversations/` (UI state)
- `runtime-validate-provider.ts`, `runtime-tool-error.ts`, `runtime-to-pi-messages.ts`, `runtime-type-guards.ts` (chat-specific helpers)
- Chat-specific UI helpers (markdown, message rendering)

It no longer holds:

- ❌ `anthropicStream` → `core/llm/`
- ❌ `pi-provider-adapter.ts` → `core/llm/`
- ❌ `build-system-prompt.ts` → `core/llm/`
- ❌ `ProviderConfig` → `core/llm/`

### D4. `src/renderer/src/tools/` is deleted; content moves to `core/tools/`

`tools/` was a top-level peer of `features/` and `plugins/`. The peer relationship implied "tools are siblings of chat, settings, skills, etc." — wrong. Tools are LLM-facing primitives, used by chat and any plugin that wants to give the LLM agent filesystem / shell / HTTP access. They belong under `core/`.

After the move, `src/renderer/src/tools/` is removed entirely. `core/tools/{file-ops,run-command,webfetch}/` retain their internal `index.ts` barrels; a new `core/tools/index.ts` re-exports all three for consumers who want the whole suite.

### D5. `core/index.ts` is the public barrel; deep paths are the implementation detail

`@codeman-frontend/core` re-exports everything from `core/llm/` and `core/tools/`. Consumers should prefer the barrel when they want a broad set; deep paths (`@codeman-frontend/core/llm/provider-config`) are fine for type-only or single-symbol imports.

```typescript
// Preferred for broad imports
import type { ProviderConfig } from '@codeman-frontend/core';
import { buildSystemPrompt, anthropicStream } from '@codeman-frontend/core';

// Acceptable for type-only / single-symbol
import type { ProviderConfig } from '@codeman-frontend/core/llm/provider-config';
```

`core/llm/index.ts` and `core/tools/index.ts` are NOT created as sub-barrels — they are not needed and would only duplicate re-exports.

### D6. No re-export shims in `chat/lib/` or `chat/index.ts`

`chat/lib/runtime.ts` no longer re-exports `ProviderConfig`. `chat/index.ts` no longer re-exports `ProviderConfig`. All callers import directly from `@codeman-frontend/core/llm/provider-config` or `@codeman-frontend/core`. This forces the boundary to be explicit at every call site — no hidden shim that future code could use to bypass the architectural intent.

### D7. Empty `shared/lib/llm/` is removed

The placeholder is deleted as part of C5. Future LLM-related code goes to `core/llm/`, not `shared/lib/llm/`.

## Alternatives considered

### A. Keep chat/lib/ as the LLM runtime owner (status quo)

Plugins reach into `chat/lib/` for runtime primitives.

Pros: zero churn; chat continues to own the agent runtime.
Cons: four cross-domain files have a reversed-dependency smell (plugin → feature). Every new plugin that wants to give the LLM a task must remember to import from chat. Architectural rot is inevitable.

### B. Move primitives to `shared/lib/llm/` instead of `core/llm/`

Same idea but uses `shared/` (which is the cross-cutting UI utilities layer).

Pros: shared/lib/ already exists; less new vocabulary.
Cons: `shared/` is for cross-cutting utilities (apis, components, hooks, stores, lib) — not domain primitives. Putting a "pi-provider-adapter" (which is intrinsically LLM-runtime-specific) into `shared/` muddles its scope. The reviewer for `shared/lib/` PRs would now need to understand agent runtime to evaluate changes.

### C. Promote `core/` to project root (`src/core/`)

Cross-process core layer, peer of `src/main/` and `src/renderer/`.

Pros: maximum reuse — main process could also use the LLM runtime if it ever needed to (e.g. for IPC-side stream processing).
Cons: requires main process to depend on renderer-bundled pi-agent-core. Currently nothing in main uses LLM runtime; speculative future-proofing. The path-length and import-path complexity (e.g. `@core/llm/...` from both sides) adds friction for zero present benefit. **Decision deferred**: when main process has a concrete need, revisit.

### D. Keep `ProviderConfig` in `chat/lib/runtime.ts` as a re-export shim

Chat re-exports ProviderConfig from core; plugin imports stay at `@codeman-frontend/features/chat/lib/runtime`.

Pros: minimal blast radius; plugins don't need import updates.
Cons: every new plugin would copy the same wrong pattern. The shim makes the boundary invisible at call sites. **Rejected** because the architectural boundary must be explicit; explicit > implicit.

### E. Keep `src/renderer/src/tools/` at top level, just rename it

Change `tools/` to something like `agent-tools/` to clarify its scope.

Pros: smaller diff.
Cons: `agent-tools/` at top level is still peer to `features/` and `plugins/`, which is the original problem (just renamed). **Rejected** as cosmetic.

## Consequences

### Positive

- **Architectural boundary explicit**: plugins import agent-runtime symbols from `core/`, not from chat. The wrong direction is no longer possible without explicit override.
- **Chat feature is honest about its scope**: `chat/lib/` no longer pretends to be the LLM runtime owner.
- **`ProviderConfig` is a first-class cross-domain type**: imported from a stable `core/` location by chat + multi-agents + automations.
- **`buildSystemPrompt` is a shared template**: not chat's private prompt builder.
- **`tools/` no longer implies "non-domain"**: clearly nested under `core/`, signalling "domain primitive".
- **Empty `shared/lib/llm/` placeholder removed**: no future drift toward the abandoned layout.
- **`core/index.ts` barrel**: future additions land in one place; consumers have a stable import surface.

### Negative

- **Import path churn**: 11 importer files updated across 4 commits. Plugin authors familiar with `chat/lib` paths must learn `core/`.
- **No main-process parity**: if main ever needs to construct an `anthropicStream` for IPC streaming, the same code would need to be re-created there (currently not needed).
- **Single barrel file (`core/index.ts`)**: a future proliferation of `core/` exports could make it harder to find a symbol; mitigated by the relatively small surface (5 files in `core/llm/`, 3 directories in `core/tools/`).

### Neutral

- `chat/index.ts` loses its `ProviderConfig` re-export. Callers of `chat/index.ts` who need `ProviderConfig` now import from `@codeman-frontend/core`.
- No new ADR for `core/` — this ADR is the design doc.
- No change to `chat/store.ts` semantics (already uses typed APIs from candidate 1 commits).
- The runtime.ts commit from candidate 1 (3ce410d) was a sibling of this ADR; together they complete the "chat feature owns chat, core owns primitives" split.

## Migration executed (4 commits)

| Commit | Hash          | Scope                                                                                                                                      |
| ------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| C1     | `a0985d7`     | `ProviderConfig` → `core/llm/provider-config.ts`; 17 importers updated; `chat/index.ts` drops re-export                                    |
| C2     | `46de4d5`     | `anthropic-stream-fn.ts` + `pi-provider-adapter.ts` → `core/llm/`; `runtime.ts`, `chat.store.ts`, `multi-agent-factory.ts` imports updated |
| C3     | `71418f3`     | `build-system-prompt.ts` + `DEFAULT_*` + `ToolSnippet` → `core/llm/`; `chat.store.ts`, `multi-agent-factory.ts` imports updated            |
| C4     | `7570aaf`     | `src/renderer/src/tools/{file-ops,run-command,webfetch}/` → `core/tools/`; 9 importers updated; new `core/tools/index.ts` barrel           |
| C5     | (this commit) | Delete `shared/lib/llm/` placeholder; this ADR                                                                                             |

## Validation

- `pnpm run typecheck` — clean across node + web configs (verified after each of C1–C4)
- `pnpm exec vitest run` — 2080/2080 passing after C4 (4 skipped pre-existing)
- `git grep "features/chat/lib/anthropic-stream-fn\|features/chat/lib/pi-provider-adapter\|features/chat/lib/build-system-prompt"` — zero hits
- `git grep "src/renderer/src/tools/"` — zero hits (directory deleted)
- `git grep "@codeman-frontend/tools/(file-ops\|run-command\|webfetch)"` — zero hits
- All renames preserve 95–100% git similarity (verified in commit output)

## Rollback

If the `core/` layer proves worse than the original cross-domain reach:

1. Revert commits in reverse order: C4 → C3 → C2 → C1.
2. Restore `src/renderer/src/tools/` from commit history.
3. Restore empty `shared/lib/llm/` placeholder (low-cost; not a real code dependency).
4. Update plugin imports back to `chat/lib/` paths.

All four commits are revertable individually with `git revert`. The architectural intent (clear `core/` boundary) would need to be re-argued before re-introducing the cross-domain smell.

## Amendment

**2026-08-13 · amended per D5**

`core/llm/runtime.ts` (`LLMRuntime` interface + `createLLMRuntime`) was added to the `core/llm/` enumeration in the D1 diagram above. established that `createLLMRuntime` is the canonical entry point for constructing an LLM runtime in this architecture; `runtime.ts` belongs alongside the other `core/llm/` primitives.

## Family tree

| Commit          | ADR  | Scope                                                                 |
| --------------- | ---- | --------------------------------------------------------------------- |
| 9acdb09–0d1ed07 | 0067 | Candidate 1: chat store cross-domain reads                            |
| 5510c76         | —    | `lookupContextWindow` already in shared/lib (false positive resolved) |
| a0985d7         | 0068 | C1: `ProviderConfig` → `core/llm/`                                    |
| 46de4d5         | 0068 | C2: `anthropicStream` + `pi-provider-adapter` → `core/llm/`           |
| 71418f3         | 0068 | C3: `build-system-prompt` + `DEFAULT_*` → `core/llm/`                 |
| 7570aaf         | 0068 | C4: tools → `core/tools/`                                             |
| (this)          | 0068 | C5: cleanup + this ADR                                                |
| (next)          | 0069 | C6: chat-view/home handler → SettingsApi                              |
