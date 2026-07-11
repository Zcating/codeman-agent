# Phase 2 Refactor — Code Review

**Reviewed**: `feature/phase-2-refactor` (9935027…31fb61e, 3 commits)
**Reviewer**: `/code-review` skill, parallel sub-agents (Standards + Spec axes)
**Date**: 2026-07-11
**Verdict**: ⚠️ **Standards pass with 1 hard violation; Spec fails with 7 missing + 3 creep + 2 wrong**

## Diff Overview

```
31fb61e docs(agents): lock Effect.fn as default for business operations
ade16f0 refactor(effect-fn): wrap 16 business operations in Effect.fn
c1a07da refactor(p1): fix AGENTS.md hard-rule violations - console.*, type escapes, root-level whitelist, doc distortion
```

| Stats | Value |
|-------|-------|
| Files changed | 11 |
| Insertions | +74 |
| Deletions | −97 |
| Spec source | `.omo/plans/phase-2-refactor.md` |
| Standards sources | `src/AGENTS.md`, `src/shared/AGENTS.md`, `src/features/chat/AGENTS.md`, `src/shared/components/ui/AGENTS.md`, `.agents/skills/effect-ts/references/guide-observability.md` |

---

## Standards

**Findings count: 1 hard, 2 judgement**

### Hard violation

#### S1. Effect.fn naming — `src/shared/stores/app.store.ts:116, 122`
- **Standard**: `src/AGENTS.md:51` (PR 3 added hard rule) + `guide-observability.md:199-215` ("use meaningful names" + Avoid list)
- **Violation**: `Effect.fn("flush")` and `Effect.fn("refresh")` are generic verbs, not business op names. The rule's example is `refreshProviderModels` — generic prefix must specify the business subject.
- **Fix**: rename → `flushSettings` / `refreshSettings` (or `saveSettings` / `reloadSettings`). Outer variable names `flushEffect` / `refreshEffect` mirror the same vagueness; consider `flushSettingsEffect` / `reloadSettingsEffect` for consistency.

### Judgement calls

#### S2. Mysterious Name (Fowler baseline) — same as S1
Span names "flush" / "refresh" alone don't reveal what is flushed or refreshed.

#### S3. vite-env.d.ts type augmentation mechanism change — `src/vite-env.d.ts:2`
- **Standard**: jest-dom README (cited in deleted `test-globals.d.ts:8-12`) recommends `import "@testing-library/jest-dom"` side-effect import for `Assertion` augmentation.
- **Change**: replaced with `/// <reference types="@testing-library/jest-dom" />`. Functionally equivalent under `moduleResolution: bundler` + vitest conditional export, but a different mechanism.
- **Verify**: `vp run typecheck` + any `toBeInTheDocument()` test passing clears the concern (runtime registration is still provided by `vitest.setup.ts:14`).

### Positive (informational)

- ✅ `console.*` → `logger.*` migration complete (7 sites), log levels correct (diagnostic → `debug`, failures → `error`/`warn`), test assertions updated for `[ERROR]` prefix.
- ✅ `chat.store.ts:354,366` replaced `// @ts-expect-error — setStore delete\nsetStore(...,undefined)` with `produce(prev => { delete prev[convId]; })` — type-escape genuinely fixed.
- ✅ AGENTS.md edits minimal: only added new Effect.fn rule + lookup row; removed stale `llm_providers.ts` exception note. No adjacent refactoring.
- ✅ 16 Effect.fn wraps preserve outer-function public API signatures (closure-based pattern works).
- ✅ Naming consistent: apart from S1, all camelCase business op names with no namespace prefix.
- ✅ No `Effect.annotateCurrentSpan` / `Effect.withSpan` / `Effect.log*` introduced (consistent with the new rule's "属后续 wave" deferral).

---

## Spec

**Findings count: 7 missing, 3 creep, 2 wrong**

### Missing (7) — spec promises not delivered

| # | Spec line | Promise | Status |
|---|-----------|---------|--------|
| **M1** | 79 | `file-tools.ts:29` `Record<string, any>` → `Record<string, unknown>` | **NOT IN DIFF** |
| **M2** | 80 | `file-tools.ts:235` `AgentTool<any, any>` → `AgentTool<unknown, unknown>` | **NOT IN DIFF** |
| **M3** | 81 | `runtime.ts:92` `as unknown as PiMessage[]` removed | **NOT IN DIFF** (runtime.ts only changed `console.log → logger.debug`) |
| **M4** | 82 | `codeman-dialog.tsx:168` `null as unknown as T` → `Promise<T | null>` | **NOT IN DIFF** |
| **M5** | 100 | `src/AGENTS.md` ADR count 10 → 25 | **NOT IN DIFF** (file is only 86 lines, no such claim) |
| **M6** | 103–104 | `chat.store.test.ts:519-581` (4) + `routes/index.test.tsx:299,321` (2) test assertions | **2/6 DONE** (only `routes/index.test.tsx` modified) |
| **M7** | 110 | `anthropic-transport.ts` 2 wraps (`anthropicStream` + `parseSseStream`) | **0/2 DONE** (justified in commit message as "plain async, not Effect-returning") |

→ Total: **16/17 wraps** vs spec's promised 17 (spec line 109 + 121).

### Scope creep (3)

#### C1. `chat.store.ts` extra Effect.fn wraps
- `pickWorkspacePath` (line 438) — spec line 109 lists this only in `app.store.ts` (line 108).
- `loadWorkspaces` (line 444) — not listed in spec anywhere.

#### C2. `effect` 3.21.3 → 3.21.4 patch bump in `package.json`
Spec silent on this. Commit message self-labels "Incidental". Defensible but outside spec scope.

#### C3. `workspace-delete-dialog.tsx` reference removed in wrong file
Spec line 99 said `src/AGENTS.md:35-37`, but the reference never existed in `src/AGENTS.md` — it was in `src/features/chat/AGENTS.md`. Implementation fixed the right concept in the wrong location.

### Wrong (2)

#### W1. PR 1 §1.9 — `archiveConversation` / `deleteConversation` (chat.store.ts:350-366)
Spec (line 83, Metis decision #1) explicitly required:
```ts
setStore("byId", prev => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== convId)))
```
Implementation used:
```ts
setStore("byId", produce(prev => { delete prev[convId]; }))
```
Different semantics: `produce` mutates Solid Immer-like draft; `Object.fromEntries` replaces the entire byId map. Functionally equivalent but violates spec literal text + Metis "byId 重置是合理语义" decision. New `produce` import added.

#### W2. `chat.store.ts` wraps = 10 vs spec 9
- Dropped `persistAssistantMessage` (only used inline via `Effect.runPromise` in `handleEvent` — "inline composition" exemption is defensible).
- Added `pickWorkspacePath` + `loadWorkspaces` (spec doesn't list them).
- Net +1 wrap with different composition from spec.

---

## Definition-of-Done Verification (spec line 117-121)

| DoD item | Status |
|----------|--------|
| `vp run test` 全绿 (584+ passed) | ✅ verified (589 passed / 1 skipped / 0 failed) |
| `vp run typecheck` 0 error | ✅ verified |
| `lsp_diagnostics` 改动文件 clean | ✅ verified |
| 0 console.* 残留（除 logger.ts 实现） | ⚠️ **partial** — diff 内 7 处全清，**未全仓 grep 验证** |
| 0 `as any` / `@ts-expect-error` / `@ts-ignore` 在生产代码 | ✗ **VIOLATED** — M1–M4 leave 4 known type-escapes in production code |
| 0 根级白名单违规 | ✅ done (`test-globals.d.ts` deleted; `debug-bubble-harness` exception) |
| 0 Effect.gen 在 17 个目标业务函数 | ⚠️ **16/17** — anthropic-transport.ts 2 处 + chat.store.ts `persistAssistantMessage` 未迁 |

---

## Summary

| Axis | Count | Worst issue |
|------|-------|-------------|
| **Standards** | 1 hard + 2 judgement | `Effect.fn("flush")` / `("refresh")` violates the hard rule that PR 3 just locked in `src/AGENTS.md` |
| **Spec** | 7 missing + 3 creep + 2 wrong | **PR 1 §1.5–1.8 four type-escape fixes entirely unaddressed** — breaks spec's "类型 escape 全部清理" (line 125) and DoD "0 个 `as any`..." (line 119) |

---

## Recommended Remediation — Phase 2 Patch PR

A single follow-up commit to close Standards/Spec gaps before moving to Phase 3:

```
refactor(phase-2-patch): close spec gaps from code review

Standards fix:
- src/shared/stores/app.store.ts:116  Effect.fn("flush") → Effect.fn("flushSettings")
- src/shared/stores/app.store.ts:122  Effect.fn("refresh") → Effect.fn("refreshSettings")

Spec gaps M1–M4 (type escape cleanups — spec §1.5–1.8):
- src/features/file-tools/lib/file-tools.ts:29
    Record<string, any> → Record<string, unknown>
- src/features/file-tools/lib/file-tools.ts:235
    AgentTool<any, any> → AgentTool<unknown, unknown>
- src/features/chat/lib/runtime.ts:92
    as unknown as PiMessage[] → use Message[] + narrow
- src/shared/components/internal/codeman-dialog.tsx:168
    null as unknown as T → Promise<T | null>

Spec gaps M5–M7:
- src/AGENTS.md 补 ADR 计数 10 → 25 (若存在声明位置)
- src/features/chat/stores/chat.store.test.ts 补 4 处 console.error assertion 同步 [ERROR] 前缀
- src/features/chat/lib/anthropic-transport.ts
    加 anthropicStream + parseSseStream 的 Effect.fn wrap
    (or 显式标注 spec deviation 在 commit message)

Verification:
- vp run typecheck exit 0
- vp run test  589 passed / 1 skipped / 0 failed
- lsp_diagnostics clean
```

**Estimated size**: 6-8 files / +50~80 / −30~50 / 1 commit / 4-6h.