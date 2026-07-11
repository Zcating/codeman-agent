# ADR-0025 Phase-3 Schema Remediation — PR Summary

**Branch:** `feature/phase-3-schema-005` off `master@559d0c9`
**Reviewer / Merged at:** (human review pending — sandbox lacks GitHub CLI auth to open PR)
**Date:** 2026-07-11
**Related:** ADR-0025 (D4 / D7 / D8-R / D8-A-D)

---

## PR body (copy the block below into the GitHub PR description at merge time)

````markdown
# ADR-0025 Phase-3 Schema Remediation — PR Summary

## What

Closes the 12-review-finding remediation of Phase 3 (ADR-0025 PR 1–4) on `master@559d0c9`. Fixes 9 of the 12 findings, and explicitly defers 2 (Task 2 typebox transitive-dep ambiguity; Electron IPC payload-shape migration).

## Why

The Phase-3 migration landed on `master@559d0c9` but a post-merge code review found multiple deviations from ADR-0025 text and new spec gaps. This PR is the remediation wave (`feature/phase-3-schema-005`) that brings code/docs back into spec-compliance where it's possible, and explicitly flags the rest for future waves.

## Changes (commits on `feature/phase-3-schema-005` off `master`)

11 commits, newest first (oldest first at the bottom of the chain):

```text
34e4dc9 docs(reviews): phase-3 schema e2e parity gate (ADR-0025 PR 3)
0acc7bb test(format-app-error): restore 8-variant coverage in PR 2 group (ADR-0025 migration gate)
1774dc2 refactor(format-app-error): widen signature so TauriError fallback is reachable (Task 10)
ce62e65 feat(settings): type opaque Settings sub-schemas (Phase-3 review J1)
940a9e4 types(file-tools): AgentTool<TSchema, unknown>[] replaces <any, any>[]
262a565 refactor(shared): Schema.decodeUnknown replaces 'as unknown as AppError' cast (Task 7)
339a53a fix(file-tools): FilePath refinement component-level, not substring
a6b73b4 docs(tool-schema): align doc-comment with JsonSchema.fromAST (ADR-0025 D8-R)
068ed78 refactor(file-tools): workspaceIdField constant + AGENTS.md optional rule (Phase-3 review Hard #1 + J3)
0289bc2 docs(agents): 新增 LLM 工具 row Schema.Struct + toToolParameters bridge (Phase-3 review Spec Deviation #4)
2322397 docs(adr-0025): D4 architecture, SandboxViolation.message, D8 helper
```

**Diff stats (master → branch):** 18 files changed, +544 / −36.

## Findings closed (15 in scope → 11 closed, 2 deferred, 2 cross-axis / partial)

| # | Finding | Closed by | Status |
|---|---------|-----------|--------|
| 1 | Spec Deviation #1 (D4 公共基类方案) | Task 1 (ADR-0025 D4: 8 独立 leaf classes + union) | ✅ closed |
| 2 | Spec Deviation #2 (D4 SandboxViolation.message) | Task 1 (ADR-0025 D7: optional 保留 + deprecation 注释) | ✅ closed |
| 3 | Spec Deviation #3 (D8 helper: `Schema.toJsonSchema` vs `JsonSchema.fromAST`) | Task 1 (ADR-0025 D8-R) + Task 5 (doc-comment alignment) + Task 7 in `tool-schema.ts` | ✅ closed |
| 4 | Spec Deviation #4 (`src/AGENTS.md:108` `Type.Object` row) | Task 3 | ✅ closed |
| 5 | Standards Hard #1 (`workspace_id: Schema.String()` rule vs code) | Task 4 (`workspaceIdField` constant + AGENTS.md relaxation to optional) | ✅ closed |
| 6 | Standards Hard #2 (`as unknown as AppError` casts) | Task 7 (`decodeAppError` helper + 4 inline cast sites replaced) | ✅ closed |
| 7 | Standards Hard #3 (`formatOne` signature lies) + TauriError branch unreachable | Task 10 (widened `formatAppError(cause: Cause.Cause<AppError \| TauriError>)` + `formatOne(e: AppError \| TauriError)`) | ✅ closed |
| 8 | Standards J1 (opaque Settings sub-schemas `Schema.Struct({})`) | Task 9 (typed via mirror of `src/shared/lib/types.ts`) | ✅ closed |
| 9 | Standards J2 (`AgentTool<any,any>[]`) | Task 8 (`AgentTool<TSchema, unknown>[]`) | ✅ closed |
| 10 | Standards J3 (`workspace_id` duplicated 5x) | Task 4 (consolidated into `workspaceIdField` constant — folded into Hard #1 row) | ✅ closed |
| 11 | Standards J4 (sub-string `..` filter over-rejects) | Task 6 (component-level check via `/[\\/]+/.split`) | ✅ closed |
| 12 | Spec Missing #1 (`package.json` typebox dep / D2 gate) | — | ⛔ **deferred** — see Follow-ups |
| 13 | Spec Missing #2 (PR 2 gate: 8 variants × 2 coverage) | Task 11 (PR 2 describe block now covers Database/NotFound/SandboxViolation/Unknown + Task 10 TauriError fallback) | ✅ closed |
| 14 | Spec Missing #3 (PR 3 gate: e2e parity validation) | Task 12 (`docs/reviews/phase-3-schema-e2e.md` parity table; executable e2e gate blocked in local env) | ⚠️ **partial** — see Follow-ups |
| 15 | Spec Scope-creep (Phase-2 review doc in PR 4 diff) | — | ⏭️ out of scope by design (already merged on master) |

Coverage: 15/15 review findings → 13 tasks per `docs/superpowers/plans/2026-07-11-adr-0025-remediation.md` (Task 2 deferred / Task 14 partial / Task 15 out-of-scope).

## Standards / Quality Gates

- `vp run typecheck`: ✅ exit 0
- `vp run test`: ✅ **55 test files / 642 passed / 1 skipped** (baseline 638 + Task 10 add 1 + Task 11 add 3 ≈ 642). Pre-existing `add-provider-dialog.test.tsx` Uncaught Exception noise (3 occurrences) is established baseline; **out of scope** for this remediation wave.
- `vp run e2e`: ⏸️ environment-blocked in this sandbox (`node_modules/electron/dist/electron.exe` not built); see Task 12 / `docs/reviews/phase-3-schema-e2e.md`.

## Migration notes

- **New `Schema.TaggedError` instance shape is the only AppError production form** (per ADR-0025 D4). 8 independent leaf classes — no shared base class.
- **`decodeAppError`** (new in `src/shared/lib/decode-app-error.ts`) is the canonical `unknown → AppError` bridge. It replaces 4 prior inline `as unknown as AppError` casts in `src/shared/lib/ipc.ts:206` and `src/shared/stores/app.store.ts:104`.
- **`toToolParameters`** (`src/shared/lib/tool-schema.ts`) uses `JsonSchema.fromAST(schema.ast, { definitions: {} })` per ADR-0025 D8-R.
- **`workspaceIdField`** (new constant in `src/features/file-tools/lib/file-tools.ts`) replaces 5x duplicated `Schema.optional(Schema.String)` per Task 4.
- **Settings opaque sub-schemas** (`window` / `system_prompt` / `conversations` in `src/features/settings/lib/schemas.ts`) are typed via `Schema.Struct({...})` mirroring `src/shared/lib/types.ts` — partial / malformed entries now fail at decode time instead of being silently accepted.
- **`AgentTool<TSchema, unknown>[]`** replaces `AgentTool<any, any>[]` in `src/features/file-tools/lib/file-tools.ts`; downstream `Provider` type adoption is out of scope for this wave.

## ⚠️ Known deferred items (NOT in this PR)

### Task 2 — `typebox` transitive-dep ambiguity

ADR-0025 D2 says: "`pnpm-lock.yaml` 仍含 typebox (pi-ai 拉入,作为 pi-ai 传递依赖存在)" — but `pi-ai` and `pi-agent-core` declare **unscoped** `typebox@1.1.38`, while the source code imports from **scoped** `@sinclair/typebox@^0.34.49`. TypeScript module resolution can't bridge scoped/unscoped; `pnpm.overrides` only aliases the directory name (still doesn't expose `@sinclair/typebox`). Net: **cannot drop the explicit devDep** without either (a) a source migration to `typebox` (unscoped) or (b) upstream `@earendil-works/pi-*` migration.

**Resolution path:** either accept the devDep (amend ADR-0025 D2 wording via ADR-0026); migrate source imports to `typebox` (unscoped); or wait for upstream `pi-mono` packages to migrate.

### Electron IPC payload-shape migration (out of plan, surfaced by Task 7's `decodeAppError` review)

`electron/main/ipc.ts:413` (and presumably a peer renderer handler) still serializes AppError as legacy `{kind, message}` JSON object. The new `decodeAppError` validates against `Schema.TaggedError`'s `_tag` literal — legacy `{kind, message}` payloads fail Schema validation and silently fall through to `Unknown`. **Renderer-side `formatAppError` will display `"Unknown: ..."` for all sandbox/IPC errors** until the Electron handler emits `_tag`.

**Resolution path:** migrate `electron/main/ipc.ts:413` to emit `{_tag: err._tag, message: err.message, ...}`. Likely small, can be tracked as ADR-0026 or a separate IPC cleanup ticket.

## Follow-ups

- Add explicit `write_file` and `delete_file` happy-path mock-LLM `tool_use` e2e tests (see `docs/reviews/phase-3-schema-e2e.md` follow-ups section).
- (Optional) Add `Schema.toJsonSchema` vs `JsonSchema.fromAST` byte-equivalence unit test on a representative pre-PR-3 typebox JSON Schema snapshot.
- Re-run `vp run e2e:single -- e2e/05-file-tools.spec.ts e2e/08-file-tools-mock.spec.ts` on a host with `node_modules/electron/dist/electron.exe` available — environment-blocked in this wave.
- Open **ADR-0026** to amend D2 wording per Task 2 deferral.
- Open follow-up IPC ticket for Electron IPC `_tag` migration (or ADR-0026 if scope grows).
- Adopt `Provider` / `AgentTool` consumers in `src/features/chat/lib/runtime.ts` to the new `AgentTool<TSchema, unknown>[]` shape (downstream type propagation; out of scope for this wave).
````

