# D8-W Workspace Chat-Ownership Migration — Wave 0 Implementation Plan

**Plan date**: 2026-06-28
**Source ADR**: [0023-codeman-prefix-and-ark-ui-select.md D8-W](../../adr/0023-codeman-prefix-and-ark-ui-select.md)
**Plan agent session**: ses_0f3714274ffeXy8DOJHbMNOYjy
**Hyperplan team**: ses_0f39c6516fferf6xzo0qXsYaj8 (5 members, 3 rounds)

---

## TL;DR

D8-W migrates workspace ownership from Settings JSON (`appStore`) to chat domain (`chat.store` + SQLite-backed `WorkspaceService`). **35+ files across Rust + TS + e2e**, single atomic commit after merging V2.1 polish wave 3 first. Existing `Settings.workspaces[]` data is **destroyed without migration** — release note mandatory. Estimated 7-10 hours implementation + 4-6 hours e2e debugging.

---

## User Decisions (resolving R3 open tensions + Q1/Q2/Q3 from plan)

| Tension | User Choice | Rationale |
|---|---|---|
| **T1: Data destruction of `Settings.workspaces[]`** | **A — Pure destruction, no migration** | Maintains grilling session decision. Release note required. |
| **T2: Split-brain prevention** | **C — Merge V2.1 polish first + 30+ file single commit** | Rejects feature flag complexity + incremental commit risk. Atomic commit relies on git rebase if needed. |
| **T3 (Path C rejected)** | Confirmed via Round 3 artist concession — full D8-W is the only valid path. Path B/C violate user-stated decisions. |
| **Q1 (last_used_workspace_id storage)** | **REMOVED entirely** — no persistence, app launch always shows Home. Major simplification. |
| **Q2 (Conversation orphan handling)** | **CASCADE delete conversations when workspace deleted** — destructive but explicit. |
| **Q3 (SQLite ON DELETE behavior)** | **CASCADE** (consistent with Q2) — `REFERENCES workspaces(id) ON DELETE CASCADE` + `PRAGMA foreign_keys = ON` |

---

## Phase 0: Branch Cleanup (BLOCKS all D8-W work)

**Goal**: Clear 28+ unstaged files from V2.1 polish wave 3 before starting D8-W.

### Steps

```bash
# 1. Check current branch state
git status --short

# 2. Verify V2.1 polish wave 3 commits are available
git log --oneline -10
# Expected: 64cb98a docs(plans): V2.1 polish Home Add Workspace wave 3 plan + status: completed (C5)
# Earlier wave 2 commits: 7977553 docs(plans): V2.1 polish wave 2 plan + status: completed 2026-06-27 (C19)

# 3. Stash or commit V2.1 polish wave 3 changes
git stash push -m "WIP: V2.1 polish wave 3 (C5)" --include-untracked

# 4. Create D8-W feature branch from current HEAD
git checkout -b feature/d8-w-workspace-chat-ownership

# 5. Pop stash (will conflict with file changes — resolve case-by-case)
git stash pop
# Resolution strategy: V2.1 polish changes (codeman-select integration in home.tsx,
# codeman-sidebar cascade tree) take precedence. D8-W changes apply on top.
```

### Verification

- [ ] `git status` clean (no uncommitted changes)
- [ ] V2.1 polish wave 3 commits visible in `git log`
- [ ] D8-W branch created
- [ ] **Conflict resolution**: 6 files overlap (codeman-sidebar.tsx, home.tsx, routes/index.tsx, AGENTS.md files, e2e helpers). V2.1 polish wins on conflicts.

---

## Phase 1: Rust Foundation (BLOCKS all TS work)

**Goal**: Create SQLite workspaces table + 4 Tauri commands.

### Files

**NEW**:
- `src-tauri/src/db/workspaces.rs` — Workspace struct + CRUD with `ON DELETE SET NULL` consideration
- `src-tauri/src/db/migrations/0003_workspaces.sql` — Schema

**MODIFY**:
- `src-tauri/src/db/mod.rs` — register `pub mod workspaces;`
- `src-tauri/src/commands/mod.rs` — add 4 commands
- `src-tauri/src/lib.rs` — register commands in `invoke_handler!`

### `0003_workspaces.sql` schema

```sql
-- D8-W: workspaces moves from Settings JSON to SQLite (ADR-0023 D8-W2)
-- Cascade: deleting workspace CASCADE-deletes all conversations with that workspace_id

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  root_path TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_workspaces_created_at ON workspaces(created_at DESC);

-- Migration also adds CASCADE FK to existing conversations table:
-- (Run this only if conversations table exists; idempotent)
-- ALTER TABLE conversations ADD CONSTRAINT fk_workspace
--   FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

PRAGMA foreign_keys = ON; -- Must run per-connection in Rust layer
```

### Tauri commands (in `commands/mod.rs`)

```rust
#[tauri::command]
pub async fn add_workspace(
    state: State<'_, AppState>,
    label: String,
    root_path: String,
) -> Result<Workspace, AppError> {
    // Generate id, validate uniqueness, insert
}

#[tauri::command]
pub async fn list_workspaces(
    state: State<'_, AppState>,
) -> Result<Vec<Workspace>, AppError> {
    // SELECT * FROM workspaces ORDER BY created_at DESC
}

#[tauri::command]
pub async fn rename_workspace(
    state: State<'_, AppState>,
    id: String,
    label: String,
) -> Result<(), AppError> {
    // UPDATE workspaces SET label = ? WHERE id = ?
}

#[tauri::command]
pub async fn delete_workspace(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    // DELETE FROM workspaces WHERE id = ?
    // Note: ON DELETE behavior for conversations.workspace_id is handled by SQLite
    // default (RESTRICT) — existing conversations keep the deleted workspace_id,
    // which surfaces as "needs workspace" (workspace_id === "") via existing
    // legacy logic in chat feature
}
```

### Verification (Gate 1)

```bash
cargo build --lib
# Expect: clean compile, 4 new command symbols visible in invoke_handler

vp run tauri:test
# Expect: Rust integration tests pass including workspaces table CRUD
```

---

## Phase 2: TS Type Sync (after Phase 1 compiles)

**Goal**: Update shared type definitions to match new Rust schema.

### Files

**MODIFY**:
- `src/shared/lib/types.ts` — remove `workspaces?` from Settings, remove `enabled` from Workspace

### Diff sketch

```ts
// REMOVE from Settings interface:
workspaces?: Array<{
  id: string;
  label: string;
  root_path: string;
  enabled: boolean;
}>;

// REMOVE from Workspace interface:
enabled: boolean;

// Workspace becomes: { id: string; label: string; root_path: string; created_at: number }
```

### Verification

- [ ] `tsc --noEmit` clean (only the workspaces/enabled removal errors expected, no other regressions)

---

## Phase 3: TS IPC Layer (after Phase 2)

**Goal**: Replace Settings-backed `WorkspaceService` with SQLite-backed version. Create chat-domain `workspace-service.ts`.

### Files

**MODIFY**:
- `src/shared/lib/tauri.ts` — replace `WorkspaceServiceLive` to use new Tauri commands

**NEW**:
- `src/features/chat/lib/workspace-service.ts` — Effect Context.Tag service for chat domain
- `src/features/chat/lib/workspace-service.test.ts` — unit tests

### `workspace-service.ts` sketch

```ts
import { Context, Effect, Layer } from "effect";
import type { Workspace } from "../../../shared/lib/types";

export class WorkspaceService extends Context.Tag("WorkspaceService")<
  WorkspaceService,
  {
    readonly list: () => Effect.Effect<Workspace[]>;
    readonly add: (label: string, rootPath: string) => Effect.Effect<Workspace>;
    readonly rename: (id: string, label: string) => Effect.Effect<void>;
    readonly remove: (id: string) => Effect.Effect<void>;
    readonly pickPath: () => Effect.Effect<string | null>;
  }
>() {}

export const WorkspaceServiceLive = Layer.succeed(
  WorkspaceService,
  {
    list: () => Effect.tryPromise(() => invoke<Workspace[]>("list_workspaces")),
    add: (label, rootPath) =>
      Effect.tryPromise(() => invoke<Workspace>("add_workspace", { label, rootPath })),
    rename: (id, label) =>
      Effect.tryPromise(() => invoke<void>("rename_workspace", { id, label })),
    remove: (id) =>
      Effect.tryPromise(() => invoke<void>("delete_workspace", { id })),
    pickPath: () => Effect.tryPromise(() => invoke<string | null>("pick_workspace_path")),
  },
);
```

### Verification

- [ ] `vp run typecheck` — WorkspaceService tag resolves
- [ ] `vp run test` — workspace-service unit tests pass

---

## Phase 4: Dialog Atoms (PARALLEL with Phases 1-3)

**Goal**: Build reusable dialog atoms that will be used by workspace-rename/delete dialogs.

### Files

**NEW**:
- `src/shared/components/ui/dialog.tsx` — @ark-ui/solid Dialog wrapper (shadcn/ui style)
- `src/shared/components/ui/dialog.test.tsx`
- `src/shared/components/internal/codeman-dialog.tsx` — imperative alert/confirm/show API
- `src/shared/components/internal/codeman-dialog.test.tsx`

### `codeman-dialog.tsx` API

```ts
export interface CodemanDialog {
  alert: (opts: { title: string; content: string; confirmText: string }) => Promise<void>;
  confirm: (opts: {
    title: string;
    content: string;
    confirmText: string;
    cancelText: string;
  }) => Promise<boolean>;
  show: <T>(render: (resolve: (value: T) => void) => JSX.Element) => Promise<T>;
}
```

### Verification

- [ ] `vp run test` — dialog unit tests pass
- [ ] codeman-dialog is prop-driven (no feature store dependency, per ADR-0022 D3)

---

## Phase 5: chat.store Rename + Workspace CRUD (atomic single commit)

**Goal**: Atomic rename `conversations.store.ts → chat.store.ts` + add workspace CRUD methods + update all imports.

**CRITICAL**: This MUST be a single atomic commit per ADR-0023 D4-N pattern. All imports updated in same commit.

### Files

**RENAME**:
- `src/features/chat/stores/conversations.store.ts` → `chat.store.ts`
- `src/features/chat/stores/conversations.store.test.ts` → `chat.store.test.ts`

**MODIFY**:
- `chat.store.ts` — add workspace CRUD methods (addWorkspace, removeWorkspace, renameWorkspace, pickWorkspacePath, setLastUsedWorkspaceId, setSelectedWorkspaceId)
- `src/features/chat/index.ts` — barrel export update (`export * as chatStore from "./stores/chat.store"`)
- All consumer files in chat feature:
  - `src/features/chat/routes/index.tsx`
  - `src/features/chat/components/home.tsx`
  - `src/features/chat/components/chat-view.tsx`
  - `src/features/chat/components/home.test.tsx`
  - `src/features/chat/components/chat-view.test.tsx`
  - `src/features/chat/routes/index.test.tsx`
  - `src/features/chat/lib/runtime.test.ts`

### chat.store.ts workspace additions (D8-W7 API)

**Design principle (per ADR-0016 D4 + CONTEXT.md "Bridge")**: chat.store exposes **Effect-returning methods**, not async/Promise. UI consumers bridge via `Effect.runPromiseExit(...)` + `Exit.match`.

```ts
// addWorkspace: pickWorkspace → deriveLabel → service.add → setStore
export const addWorkspace: () => Effect.Effect<Workspace | null, AppError, never>;

// removeWorkspace: service.remove → setStore (filter by id)
// CASCADE: all conversations with workspace_id === id are deleted via SQLite FK ON DELETE CASCADE
export const removeWorkspace: (id: string) => Effect.Effect<void, AppError, never>;

// renameWorkspace: service.rename → setStore (patch by id)
export const renameWorkspace: (id: string, label: string) => Effect.Effect<void, AppError, never>;

// pickWorkspacePath: thin wrapper
export const pickWorkspacePath: () => Effect.Effect<string | null, AppError, never>;

// Local reactive state (in createStore)
export function setSelectedWorkspaceId(id: string | null): void { ... }
// NOTE: last_used_workspace_id REMOVED entirely (per plan Q1).
// App launch always shows Home; user selects workspace each time.
```

### UI consumer pattern (codeman-sidebar.tsx)

```tsx
// codeman-sidebar.tsx — onRenameClick handler
const handleRenameClick = async (id: string, newLabel: string) => {
  const result = await Effect.runPromiseExit(chatStore.renameWorkspace(id, newLabel));
  Exit.match(result, {
    onSuccess: () => {
      // reactive store update already happened via setStore in chatStore.renameWorkspace
      // close dialog, no further UI action needed
    },
    onFailure: (cause) => {
      console.error("[codeman-sidebar] rename workspace failed:", cause);
      // show error toast or close dialog with error state
    },
  });
};
```

The same pattern applies to `removeWorkspace` and `addWorkspace`. UI never directly imports `WorkspaceService` or calls IPC — chat.store is the single bridge per ADR-0016 D4.

### Verification

- [ ] `vp run typecheck` — all imports resolve to `chat.store`
- [ ] `vp run test` — chat.store tests pass (renamed + new workspace tests)
- [ ] No consumer still references `conversations.store`

---

## Phase 6: Workspace Dialogs (after Phase 4 + 5)

**Goal**: Create the two feature-local dialogs that call chat.store workspace methods.

### Files

**NEW**:
- `src/features/chat/components/workspace-rename-dialog.tsx` + `.test.tsx`
- `src/features/chat/components/workspace-delete-dialog.tsx` + `.test.tsx`

### Verification

- [ ] `vp run test` — both dialog unit tests pass
- [ ] Both use `<CodemanDialog show={...}>` pattern (not native HTMLDialogElement)

---

## Phase 7: Sidebar + Home + Routes + Settings Cleanup (after Phase 6)

**Goal**: Wire up sidebar hover buttons + update consumers + remove WorkspaceCard.

### Files

**MODIFY**:
- `src/shared/components/internal/codeman-sidebar.tsx` — add hover rename/delete buttons + dialog integration
- `src/shared/components/internal/codeman-sidebar.test.tsx` — add hover tests
- `src/features/chat/components/home.tsx` — replace `appStore.workspaces` reads with `chatStore`
- `src/features/chat/components/home.test.tsx`
- `src/features/chat/routes/index.tsx` — replace `appStore.workspaces` reads with `chatStore`
- `src/features/chat/routes/index.test.tsx`
- `src/features/settings/routes/settings.tsx` — remove WorkspaceCard import + section
- `src/features/settings/routes/settings.test.tsx`

**DELETE**:
- `src/features/settings/components/workspace-card.tsx`
- `src/features/settings/components/workspace-card.test.tsx`

### Verification

- [ ] `vp run test` — sidebar + home + routes tests pass with chat.store
- [ ] WorkspaceCard references all removed from settings.tsx

---

## Phase 8: app.store Cleanup (after Phase 7)

**Goal**: Delete all workspace methods from app.store.

### Files

**MODIFY**:
- `src/shared/stores/app.store.ts` — DELETE `pickWorkspacePath()`, `addWorkspace()`, `setLastUsedWorkspaceId()`, `getLastUsedWorkspaceId()`, `selectedWorkspaceId()` methods
- `src/shared/stores/app.store.test.ts` — remove tests for deleted methods

### Verification

- [ ] No consumer references deleted appStore methods
- [ ] `vp run typecheck` clean
- [ ] `vp run test` — app.store tests pass

---

## Phase 9: E2E + Final Verification (LAST)

**Goal**: Update e2e helpers + 5 minimum specs + add P0-1 boot race test.

### Files

**MODIFY**:
- `e2e/helpers.ts` — workspace setup helpers use new IPC commands
- `e2e/05-file-tools.spec.ts` — workspace injection via new IPC
- `e2e/08-file-tools-mock.spec.ts` — workspace injection via new IPC
- `e2e/09-per-conv-runtime.spec.ts` — sidebar selectors + workspace reads
- `e2e/10-home-agent.spec.ts` — workspace picker state machine

**MODIFY (add P0-1 test)**:
- `e2e/01-app-launch.spec.ts` — add boot race test

### P0-1 boot race test (in `01-app-launch.spec.ts`)

```typescript
test("D8-W: WorkspaceService usable immediately on app boot", async ({ tauriEnv }) => {
  const { page } = tauriEnv;
  await page.goto("/");
  await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });

  // Immediately try list_workspaces — no user action
  const workspaces = await invoke<Workspace[]>(page, "list_workspaces");
  expect(Array.isArray(workspaces)).toBe(true);

  // Add workspace + immediately list — no reload
  await invoke(page, "add_workspace", {
    label: "Boot Test",
    root_path: "/tmp/boot-test",
  });
  const workspaces2 = await invoke<Workspace[]>(page, "list_workspaces");
  expect(workspaces2.some(w => w.label === "Boot Test")).toBe(true);
});
```

### Helper function updates in `e2e/helpers.ts`

```ts
// OLD: directly modify Settings JSON
// export function ensureWorkspaceByPath(rootPath: string): Promise<void>

// NEW: invoke WorkspaceService commands
export async function ensureWorkspaceByPath(label: string, rootPath: string): Promise<void> {
  await invoke(page, "add_workspace", { label, root_path: rootPath });
}
```

### Verification (Gate 5 — final)

```bash
vp run e2e
# Expect: All 5 minimum specs pass (05, 08, 09, 10) + P0-1 boot race test
```

---

## Atomic Commit Strategy

Per user choice (Q2 = C), D8-W is **single atomic commit** containing all 35+ file changes.

```bash
git add \
  src-tauri/src/db/workspaces.rs \
  src-tauri/src/db/migrations/0003_workspaces.sql \
  src-tauri/src/db/mod.rs \
  src-tauri/src/commands/mod.rs \
  src-tauri/src/lib.rs \
  src-tauri/src/settings.rs \
  src/shared/lib/types.ts \
  src/shared/lib/tauri.ts \
  src/shared/stores/app.store.ts \
  src/shared/stores/app.store.test.ts \
  src/shared/components/ui/dialog.tsx \
  src/shared/components/ui/dialog.test.tsx \
  src/shared/components/internal/codeman-dialog.tsx \
  src/shared/components/internal/codeman-dialog.test.tsx \
  src/shared/components/internal/codeman-sidebar.tsx \
  src/shared/components/internal/codeman-sidebar.test.tsx \
  src/features/chat/stores/chat.store.ts \
  src/features/chat/stores/chat.store.test.ts \
  src/features/chat/lib/workspace-service.ts \
  src/features/chat/lib/workspace-service.test.ts \
  src/features/chat/lib/runtime.test.ts \
  src/features/chat/components/home.tsx \
  src/features/chat/components/home.test.tsx \
  src/features/chat/components/chat-view.tsx \
  src/features/chat/components/chat-view.test.tsx \
  src/features/chat/components/workspace-rename-dialog.tsx \
  src/features/chat/components/workspace-rename-dialog.test.tsx \
  src/features/chat/components/workspace-delete-dialog.tsx \
  src/features/chat/components/workspace-delete-dialog.test.tsx \
  src/features/chat/routes/index.tsx \
  src/features/chat/routes/index.test.tsx \
  src/features/chat/index.ts \
  e2e/helpers.ts \
  e2e/01-app-launch.spec.ts \
  e2e/05-file-tools.spec.ts \
  e2e/08-file-tools-mock.spec.ts \
  e2e/09-per-conv-runtime.spec.ts \
  e2e/10-home-agent.spec.ts

git rm src/features/chat/stores/conversations.store.ts \
        src/features/chat/stores/conversations.store.test.ts \
        src/features/settings/components/workspace-card.tsx \
        src/features/settings/components/workspace-card.test.tsx

git commit -m "feat(workspace): D8-W workspace chat-ownership migration

- workspace data moves from Settings JSON to SQLite (ADR-0023 D8-W)
- chat.store.ts (renamed from conversations.store.ts) owns workspace CRUD
- WorkspaceService Effect Context.Tag wraps 4 new Tauri commands
- enabled field removed from Workspace; root_path immutable after creation
- WorkspaceCard deleted; sidebar hover rename/delete dialogs
- Settings.workspaces[] removed (existing data not migrated — release note)
- codeman-dialog imperative alert/confirm/show API
- 5 e2e specs updated + P0-1 boot race test added

BREAKING CHANGE: existing Settings.workspaces[] data is destroyed on upgrade.
Users must re-add their workspaces via Home picker after upgrading."
```

---

## Parallel Work Opportunities

Despite single commit, the **planning** can parallelize:

| Workstream | Owner | Parallel with |
|---|---|---|
| Phase 1 Rust | Backend agent | Phase 4 dialog atoms |
| Phase 4 dialog atoms | Frontend agent | Phase 1 Rust |
| Phase 5 chat.store rename | Frontend agent | (after Phase 1-3 done) |
| Phase 6 workspace dialogs | Frontend agent | (after Phase 4+5) |
| Phase 7 UI integration | Frontend agent | (sequential after 6) |
| Phase 8 app.store cleanup | Backend agent | (after Phase 7) |
| Phase 9 e2e | QA agent | (last) |

---

## Verification Gates Summary

1. `cargo build --lib` — Rust compiles (after Phase 1)
2. `vp run typecheck` — Zero TS errors (after Phase 5)
3. `vp run test` — All vitest unit tests pass (after Phase 6)
4. `vp run tauri:test` — Rust integration tests pass (after Phase 8)
5. `vp run e2e` — All 5 specs + P0-1 test pass (after Phase 9)

---

## Release Notes Draft

```markdown
# v2.2.0 — D8-W Workspace Chat-Ownership Migration

## ⚠️ BREAKING CHANGES

### Workspace data not migrated
Existing workspaces stored in `Settings.workspaces[]` are **not migrated** to the new SQLite table.
After upgrading, you will need to **re-add your workspaces** via the Home workspace picker.

If you had multiple workspaces configured, please:
1. Note down each workspace's root path before upgrading
2. After upgrade, use Home → "+ Add new workspace…" to re-add each one

### ⚠️ Deleting a workspace deletes ALL conversations in it
When you delete a workspace via sidebar hover → Delete, **all conversations in that workspace are CASCADE-deleted**.
This is intentional but destructive. Always review your conversations before deleting a workspace.

### last_used_workspace_id REMOVED
The "remember last workspace" feature is removed. Every app launch starts at Home — you must pick a workspace each time.
This was a major simplification request.

### Workspace behavior changes
- **`enabled` field removed**: All workspaces are always active. Sandbox enforcement unchanged (all workspace roots are boundaries).
- **`root_path` immutable after creation**: To change a workspace's path, delete and re-add.
- **WorkspaceCard deleted from /settings**: Workspace management now lives in sidebar hover buttons (rename/delete) and Home picker (add).

## What's new
- Workspace data persisted in SQLite (faster, more reliable)
- Workspace rename/delete via sidebar hover (no /settings navigation needed)
- Confirmation dialogs for destructive operations
```

---

## Time Estimate

| Phase | Hours |
|---|---|
| Phase 0 branch cleanup | 0.5 |
| Phase 1 Rust foundation | 2-3 |
| Phase 2 TS types | 0.5 |
| Phase 3 TS IPC + WorkspaceService | 1-2 |
| Phase 4 dialog atoms | 1-2 |
| Phase 5 chat.store rename | 1-2 |
| Phase 6 workspace dialogs | 1 |
| Phase 7 UI integration | 1-2 |
| Phase 8 app.store cleanup | 0.5 |
| Phase 9 e2e | 2-4 |
| **Total** | **10-18 hours** |

Conservative estimate (7-10 hours from Round 1) was undercooked per Round 3 deep-analyst critique. Realistic: 10-18 hours with full e2e debugging.

---

## All User Decisions Captured

1. ✅ **last_used_workspace_id REMOVED** — no persistence, app launch always Home
2. ✅ **Conversation orphan handling**: CASCADE delete (destructive but explicit)
3. ✅ **SQLite ON DELETE**: CASCADE (consistent with Q2)
4. ✅ **Data migration**: Pure destruction, release note mandatory
5. ✅ **Split-brain**: Single atomic commit after Phase 0 cleanup

No further unresolved items at this point.

---

## Provenance

- **Hyperplan team session**: ses_0f39c6516fferf6xzo0qXsYaj8
- **Plan agent session**: ses_0f3714274ffeXy8DOJHbMNOYjy
- **ADR source**: docs/adr/0023-codeman-prefix-and-ark-ui-select.md D8-W block (added 2026-06-28)
- **Grilling decisions**: 9 confirmed via /grill-with-docs session 2026-06-28
- **Round 3 member positions**: analyst-low ✅, analyst-high ✅, critic-brain ✅, artist ✅, deep-analyst ✅