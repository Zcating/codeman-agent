# Chat Effect Refactor + Routing + Dialog + E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor chat.store.ts to return Effect throughout, restructure routing to use `/` and `/conversation/{id}`, fix Select positioning flash, refactor Dialog to module-level singleton, and rebuild e2e tests to remove window bridge.

**Architecture:** The current single `/` route with activeId state machine is split into three route files sharing a layout. chat.store.ts methods change from `async Promise` to `Effect<A, AppError, never>`. CodemanSelect fixes positioning with Ark UI's `positioning.sameWidth`. Dialog becomes a module-level singleton using `render()` + `Portal` from solid-js/web. E2E tests remove `window.__chatStore` bridge and drive UI directly with mock provider.

**Tech Stack:** Solid.js, TanStack Router, Ark UI Select/Dialog, Effect-TS, Playwright e2e

---

## File Structure

### Created
- `src/features/chat/routes/chat-layout.tsx` — Layout shell with Sidebar + Footer + Outlet + buildSidebarNodes
- `src/features/chat/routes/home-route.tsx` — Home route component (HomeAgentForm)
- `src/features/chat/routes/conversation-route.tsx` — Conversation route component (ChatView + back button)
- `src/features/chat/routes/index.ts` — Barrel for route components

### Modified
- `src/router.tsx` — Route tree (chat layout + home + conversation + settings)
- `src/features/chat/stores/chat.store.ts` — Effect return types, remove activeId
- `src/features/chat/components/chat-view.tsx` — Effect.runPromiseExit for sendMessage
- `src/features/chat/components/home.tsx` — New handleSend flow (create → navigate → send)
- `src/features/chat/stores/chat.store.test.ts` — Updated for Effect return types
- `src/features/chat/components/chat-view.test.tsx` — Updated imports
- `src/features/chat/routes/index.test.tsx` — Updated for new routing
- `src/shared/components/ui/codeman-select.tsx` — positioning.sameWidth
- `src/shared/components/ui/codeman-group-select.tsx` — positioning.sameWidth
- `src/shared/components/internal/codeman-dialog.tsx` — Module-level singleton
- `src/shared/components/internal/codeman-dialog.test.tsx` — Rewritten for module-level API
- `src/index.tsx` — Remove window.__chatStore bridge
- `e2e/helpers.ts` — Rewrite clickNewConversationAndWait, remove bridge refs
- `e2e/09-per-conv-runtime.spec.ts` — Remove bridge refs
- `e2e/05-chat-message-bubble.spec.ts` — Remove activeId$ bridge, use mock provider
- All other e2e spec files — Use mock provider + UI-driven flow

### Deleted
- `src/features/chat/routes/index.tsx` — Split into 3 files
- `src/features/chat/components/workspace-rename-dialog.tsx` — Replaced by Dialog.show()
- `src/features/chat/components/workspace-delete-dialog.tsx` — Replaced by Dialog.confirm()
- `src/features/chat/components/workspace-rename-dialog.test.tsx`
- `src/features/chat/components/workspace-delete-dialog.test.tsx`

---

### Task 1: chat.store.ts — Remove activeId, make createConversation return Effect<string>

**Files:**
- Modify: `src/features/chat/stores/chat.store.ts`
- Modify: `src/features/chat/stores/chat.store.test.ts`

- [ ] **Step 1: Remove activeId signal and related functions**

Delete the following from chat.store.ts:
- `activeId$` signal (line 66-67)
- `conversations$` signal (line 69-70) — keep the setter for internal use
- `setActiveIdSignal` — used by selectConversation/clearActiveConversation
- `selectConversation()` function (lines 108-111)
- `clearActiveConversation()` function (lines 115-118)
- `store.activeId` from createStore initial state (line 57)
- `setStore("activeId", ...)` calls

Keep the internal `activeId` signal renaming:
```typescript
// Replace
const [activeId, setActiveIdSignal] = createSignal<string | null>(null);
export const activeId$: Accessor<string | null> = activeId;

// With — keep the signal for internal use (setupConvState still reads it for sidebar)
// Actually remove entirely — URL is SSOT now
```

- [ ] **Step 2: Change createConversation to return Effect<string, AppError, never>**

```typescript
// Before (async function returning Promise<void>):
export async function createConversation(
  workspaceId: string,
  title: string,
  systemPrompt?: string,
): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* ConversationService;
    return yield* svc.create(title, systemPrompt ?? null, workspaceId);
  }).pipe(Effect.provide(ConversationServiceLive));
  const result = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(result)) {
    setupConvState(result.value, []);
    selectConversation(result.value.id);
  }
}

// After (returns Effect<string, AppError, never>):
export function createConversation(
  workspaceId: string,
  title: string,
  systemPrompt?: string,
): Effect.Effect<string, AppError, never> {
  return Effect.gen(function* () {
    const svc = yield* ConversationService;
    const conv = yield* svc.create(title, systemPrompt ?? null, workspaceId);
    setupConvState(conv, []);
    return conv.id;
  }).pipe(Effect.provide(ConversationServiceLive));
}
```

- [ ] **Step 3: Change createAndSendConversation to return Effect<void, AppError, never>**

```typescript
// Replace current async function:
export function createAndSendConversation(
  workspaceId: string,
  title: string,
  firstMessage: string,
  provider: ProviderConfig,
): Effect.Effect<void, AppError, never> {
  return Effect.gen(function* () {
    const convId = yield* createConversation(workspaceId, title);
    yield* sendMessage(convId, firstMessage, provider);
  });
}
```

Note: `createAndSendConversation` is called from `home.tsx` handleSend. After this change, the caller navigates after `createConversation` (not here).

- [ ] **Step 4: Change sendMessage to return Effect<void, AppError, never>**

```typescript
// Before:
export async function sendMessage(...): Promise<void> {
  // setStore + persistUserMessage (await) + Stream.runForEach (await runPromiseExit)
}

// After:
export function sendMessage(
  convId: string,
  content: string,
  provider: ProviderConfig,
): Effect.Effect<void, never, never> {
  return Effect.gen(function* () {
    const cs = store.byId[convId];
    if (!cs) return;

    // 1. Append user message to local + DB
    const userMsg: Message = {
      id: crypto.randomUUID(),
      conversation_id: convId,
      role: "user",
      content,
      tool_calls: null,
      tool_results: null,
      model: null,
      input_tokens: null,
      output_tokens: null,
      created_at: Date.now(),
    };
    setStore("byId", convId, "messages", (msgs) => [...msgs, userMsg]);
    yield* persistUserMessageEffect(userMsg);

    // 2. Build context (浅拷贝,含最新 user msg)
    const context = [...store.byId[convId]!.messages];

    // 3. Run runtime + subscribe
    const stream = cs.runtime.run({ context, provider });
    yield* Stream.runForEach(stream, (evt) =>
      Effect.sync(() => handleEvent(convId, evt)),
    ).pipe(Effect.scoped);
  }).pipe(
    Effect.catchAll((err) =>
      Effect.sync(() => {
        console.error("[chat.store] sendMessage stream failure:", err);
      }),
    ),
  );
}
```

- [ ] **Step 5: Convert persistUserMessage/persistAssistantMessage to return Effect**

```typescript
// Before — async function
async function persistUserMessage(msg: Message): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* MessageService;
    return yield* svc.append({ ... });
  }).pipe(Effect.provide(MessageServiceLive));
  await Effect.runPromiseExit(program);
}

// After — return Effect
function persistUserMessageEffect(msg: Message): Effect.Effect<void, AppError, never> {
  return Effect.gen(function* () {
    const svc = yield* MessageService;
    yield* svc.append({
      conversationId: msg.conversation_id,
      role: msg.role,
      content: msg.content,
    });
  }).pipe(Effect.provide(MessageServiceLive));
}

// Same for persistAssistantMessageEffect
```

- [ ] **Step 6: Change archiveConversation, deleteConversation, loadConversations to return Effect**

```typescript
export function archiveConversation(convId: string): Effect.Effect<void, AppError, never> {
  return Effect.gen(function* () {
    cancel(convId);
    const svc = yield* ConversationService;
    yield* svc.archive(convId);
    // @ts-expect-error — setStore delete
    setStore("byId", convId, undefined);
  }).pipe(Effect.provide(ConversationServiceLive));
}

export function deleteConversation(convId: string): Effect.Effect<void, AppError, never> {
  return Effect.gen(function* () {
    cancel(convId);
    const svc = yield* ConversationService;
    yield* svc.delete(convId);
    // @ts-expect-error — setStore delete
    setStore("byId", convId, undefined);
  }).pipe(Effect.provide(ConversationServiceLive));
}

export function loadConversations(includeArchived = false): Effect.Effect<void, AppError, never> {
  return Effect.gen(function* () {
    const svc = yield* ConversationService;
    const convs = yield* svc.list(includeArchived);
    for (const conv of convs) {
      const msgSvc = yield* MessageService;
      const history = yield* msgSvc.list(conv.id);
      setupConvState(conv, history);
    }
  }).pipe(
    Effect.provide(ConversationServiceLive),
    Effect.provide(MessageServiceLive),
  );
}
```

- [ ] **Step 7: Update chat.store.test.ts**

Run: `npx vitest run src/features/chat/stores/chat.store.test.ts`
Expected: Tests compile and run (may fail until Task 2 updates consumers)

Key changes:
- `await createConversation(wsId, title)` → `await Effect.runPromise(createConversation(wsId, title))`
- `await sendMessage(convId, text, provider)` → `await Effect.runPromise(sendMessage(convId, text, provider))`
- Remove tests for `activeId$`, `selectConversation`, `clearActiveConversation`
- `createConversation` now returns convId — assert the return value

- [ ] **Step 8: Check lsp_diagnostics clean**

Run lsp_diagnostics on `src/features/chat/stores/chat.store.ts`

- [ ] **Step 9: Commit**

```bash
git add src/features/chat/stores/chat.store.ts src/features/chat/stores/chat.store.test.ts
git commit -m "refactor(chat.store): return Effect, remove activeId signal"
```

---

### Task 2: Update UI consumers (chat-view.tsx, home.tsx)

**Files:**
- Modify: `src/features/chat/components/chat-view.tsx`
- Modify: `src/features/chat/components/home.tsx`
- Modify: `src/features/chat/components/chat-view.test.tsx`

- [ ] **Step 1: Update chat-view.tsx to use Effect.runPromiseExit**

Import Effect and Exit:
```typescript
import { Effect, Exit } from "effect";
```

Change handleSend:
```typescript
// Before:
await sendMessage(id, text, provider);

// After:
Effect.runPromiseExit(sendMessage(id, text, provider)).then((exit) => {
  if (Exit.isFailure(exit)) {
    console.error("[chat-view] sendMessage failed:", exit.cause);
  }
});
```

- [ ] **Step 2: Update home.tsx handleSend for new flow**

```typescript
import { Effect, Exit } from "effect";
import { useNavigate } from "@tanstack/solid-router";

// In component:
const navigate = useNavigate();

const handleSend = async (e: Event) => {
  e.preventDefault();
  const text = input().trim();
  const wsId = selectedWorkspaceId();
  if (!text || !wsId) return;

  const provider = buildProviderConfig();

  const exit = await Effect.runPromiseExit(
    createConversation(wsId, text.slice(0, 30))
  );
  if (Exit.isFailure(exit)) return;
  const convId = exit.value;

  setInput("");
  navigate({ to: "/conversation/$convId", params: { convId } });

  // Start streaming
  Effect.runPromiseExit(sendMessage(convId, text, provider));
};
```

Note: Remove `createAndSendConversation` import from imports.

- [ ] **Step 3: Update chat-view.tsx — convId comes from route params**

```typescript
import { useParams } from "@tanstack/solid-router";

// In component:
const params = useParams();
const convId = () => params.convId;
// Remove old convId prop — the route passes it via URL params
```

Update `currentMessages` to read from store.byId[convId()]:
```typescript
// Replace:
const currentMessages = createMemo(() => store.byId[activeId()]?.messages ?? []);

// With:
const currentMessages = createMemo(() => store.byId[convId()]?.messages ?? []);

// Replace:
const isRunning = createMemo(() => store.byId[activeId()]?.streamingMessageId != null);

// With:
const isRunning = createMemo(() => store.byId[convId()]?.streamingMessageId != null);
```

- [ ] **Step 4: Update chat-view.test.tsx**

Update tests to pass convId via params mock instead of relying on activeId$.

- [ ] **Step 5: Check lsp_diagnostics**

Run: lsp_diagnostics on modified files

- [ ] **Step 6: Run unit tests**

Run: `npx vitest run src/features/chat/components/`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/features/chat/components/chat-view.tsx src/features/chat/components/home.tsx
git commit -m "refactor(ui): update consumers for Effect-based store + route params"
```

---

### Task 3: Restructure routing (chat-layout, home-route, conversation-route)

**Files:**
- Create: `src/features/chat/routes/chat-layout.tsx`
- Create: `src/features/chat/routes/home-route.tsx`
- Create: `src/features/chat/routes/conversation-route.tsx`
- Create: `src/features/chat/routes/index.ts`
- Delete: `src/features/chat/routes/index.tsx`
- Modify: `src/router.tsx`
- Modify: `src/features/chat/routes/index.test.tsx`

- [ ] **Step 1: Create chat-layout.tsx**

Extract the shared layout (Sidebar + Footer + Dialogs + Outlet) from the old routes/index.tsx:

```typescript
// src/features/chat/routes/chat-layout.tsx
import { createSignal, Show, onMount, type JSX } from "solid-js";
import { Outlet, useParams, Link } from "@tanstack/solid-router";
import { Settings as SettingsIcon } from "lucide-solid";
import { Effect, Exit } from "effect";
import { CodemanSidebar, type WorkspaceNode } from "../../../shared/components/internal/codeman-sidebar";
import {
  store,
  workspaces$,
  conversations$,
  deleteConversation,
  clearActiveConversation,
  setSelectedWorkspaceId,
  loadWorkspaces,
} from "../stores/chat.store";
import { WorkspaceRenameDialog } from "../components/workspace-rename-dialog";
import { WorkspaceDeleteDialog } from "../components/workspace-delete-dialog";
// Note: Dialogs will be replaced in Task 5

function buildSidebarNodes(): WorkspaceNode[] {
  const allConvs = conversations$() ?? [];
  const wsList = workspaces$() ?? [];
  return wsList.map((ws) => {
    const wsConvs = allConvs
      .filter((c) => c.workspace_id === ws.id)
      .sort((a, b) => b.updated_at - a.updated_at);
    return {
      kind: "workspace" as const,
      id: ws.id,
      label: ws.label,
      rootPath: ws.root_path,
      children: wsConvs.map((c) => ({
        kind: "conv" as const,
        id: c.id,
        label: c.title,
        subLabel: new Date(c.updated_at * 1000).toLocaleDateString("zh-CN"),
        isStreaming: store.byId[c.id]?.streamingMessageId != null,
      })),
    };
  });
}

function workspacesExist(): boolean {
  return (workspaces$()?.length ?? 0) > 0;
}

export function ChatLayout(): JSX.Element {
  // Load workspaces on mount
  onMount(() => {
    Effect.runPromiseExit(loadWorkspaces());
  });

  const params = useParams();
  // selectedItemId comes from URL — /conversation/{id} has convId, / has null
  const selectedItemId = (): string | null => params.convId ?? null;

  const handleSelectItem = (id: string) => {
    // Navigate handled by CodemanSidebar's link behavior
  };

  const handleDeleteItem = (id: string) => {
    Effect.runPromiseExit(deleteConversation(id));
  };

  const handleBackToHome = () => clearActiveConversation();

  const handleEmptyWorkspaceClick = (wsId: string) => {
    setSelectedWorkspaceId(wsId);
    clearActiveConversation();
  };

  const [dialogType, setDialogType] = createSignal<"rename" | "delete" | null>(null);
  const [dialogWorkspaceId, setDialogWorkspaceId] = createSignal<string>("");
  const [dialogWorkspaceLabel, setDialogWorkspaceLabel] = createSignal<string>("");

  const handleRenameWorkspace = (workspaceId: string, currentLabel: string) => {
    setDialogWorkspaceId(workspaceId);
    setDialogWorkspaceLabel(currentLabel);
    setDialogType("rename");
  };

  const handleDeleteWorkspace = (workspaceId: string, label: string) => {
    setDialogWorkspaceId(workspaceId);
    setDialogWorkspaceLabel(label);
    setDialogType("delete");
  };

  const closeDialog = () => {
    setDialogType(null);
    setDialogWorkspaceId("");
    setDialogWorkspaceLabel("");
  };

  return (
    <main class="flex h-screen w-full bg-background text-foreground">
      <Show when={workspacesExist()}>
        <CodemanSidebar
          nodes={buildSidebarNodes()}
          selectedItemId={selectedItemId()}
          onSelectItem={handleSelectItem}
          onDeleteItem={handleDeleteItem}
          onCreateItem={handleBackToHome}
          onAddWorkspace={() => { window.location.href = "/settings"; }}
          onEmptyWorkspaceClick={handleEmptyWorkspaceClick}
          onRenameWorkspace={handleRenameWorkspace}
          onDeleteWorkspace={handleDeleteWorkspace}
        />
      </Show>

      <section class="flex-1 flex flex-col overflow-hidden">
        <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
          <Outlet />
        </div>
        <footer class="flex items-center justify-between px-4 py-2 border-t border-border bg-card text-xs text-muted-foreground">
          <span>codeman-agent</span>
          <Link
            to="/settings"
            activeProps={{ class: "text-primary font-medium" }}
            inactiveProps={{
              class: "hover:text-foreground transition-colors flex items-center gap-1 px-2 py-1 -mx-2 -my-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            }}
          >
            <SettingsIcon class="h-3.5 w-3.5" aria-hidden="true" />
            <span>设置</span>
          </Link>
        </footer>
      </section>

      <Show when={dialogType() === "rename"}>
        <WorkspaceRenameDialog
          workspaceId={dialogWorkspaceId()}
          initialLabel={dialogWorkspaceLabel()}
          open={true}
          onClose={closeDialog}
        />
      </Show>
      <Show when={dialogType() === "delete"}>
        <WorkspaceDeleteDialog
          workspaceId={dialogWorkspaceId()}
          label={dialogWorkspaceLabel()}
          open={true}
          onClose={closeDialog}
        />
      </Show>
    </main>
  );
}
```

- [ ] **Step 2: Create home-route.tsx**

```typescript
// src/features/chat/routes/home-route.tsx
import type { JSX } from "solid-js";
import { HomeAgentForm } from "../components/home";

export function HomeRoute(): JSX.Element {
  return <HomeAgentForm />;
}
```

- [ ] **Step 3: Create conversation-route.tsx**

```typescript
// src/features/chat/routes/conversation-route.tsx
import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { useNavigate, useParams } from "@tanstack/solid-router";
import { ArrowLeft } from "lucide-solid";
import { ChatView } from "../components/chat-view";

export function ConversationRoute(): JSX.Element {
  const navigate = useNavigate();
  const params = useParams();

  const handleBack = () => {
    navigate({ to: "/" });
  };

  return (
    <>
      <button
        type="button"
        onClick={handleBack}
        class="flex items-center gap-1 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border-b border-border transition-colors"
        aria-label="返回首页"
        data-testid="back-to-home"
      >
        <ArrowLeft class="h-4 w-4" aria-hidden="true" />
        返回首页
      </button>
      <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
        <ChatView />
      </div>
    </>
  );
}
```

- [ ] **Step 4: Create routes/index.ts barrel**

```typescript
// src/features/chat/routes/index.ts
export { ChatLayout } from "./chat-layout";
export { HomeRoute } from "./home-route";
export { ConversationRoute } from "./conversation-route";
```

- [ ] **Step 5: Update router.tsx**

```typescript
// src/router.tsx
import { createRouter, createRoute, createRootRoute, Outlet } from "@tanstack/solid-router";
import { ChatLayout, HomeRoute, ConversationRoute } from "./features/chat/routes/index";
import { SettingsPage } from "./features/settings/routes/settings";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const chatLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "chat",
  component: ChatLayout,
});

const homeRoute = createRoute({
  getParentRoute: () => chatLayoutRoute,
  path: "/",
  component: HomeRoute,
});

const conversationRoute = createRoute({
  getParentRoute: () => chatLayoutRoute,
  path: "/conversation/$convId",
  component: ConversationRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

export const routeTree = rootRoute.addChildren([
  chatLayoutRoute.addChildren([homeRoute, conversationRoute]),
  settingsRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router;
  }
}
```

- [ ] **Step 6: Delete old routes/index.tsx**

Remove `src/features/chat/routes/index.tsx`.

- [ ] **Step 7: Update routes/index.test.tsx**

Update tests to work with the new route structure. Mock router context for ChatLayout tests.

- [ ] **Step 8: Check lsp_diagnostics**

Run: lsp_diagnostics on all created/modified files

- [ ] **Step 9: Run unit tests**

Run: `npx vitest run src/features/chat/`
Expected: All tests pass

- [ ] **Step 10: Commit**

```bash
git add src/features/chat/routes/ src/router.tsx
git rm src/features/chat/routes/index.tsx
git commit -m "feat(routes): split into chat-layout, home-route, conversation-route"
```

---

### Task 4: Fix Select positioning flash

**Files:**
- Modify: `src/shared/components/ui/codeman-select.tsx`
- Modify: `src/shared/components/ui/codeman-group-select.tsx`

- [ ] **Step 1: Fix codeman-select.tsx**

Remove inline style from Select.Positioner and add positioning to Select.Root:

```typescript
// Replace current Select.Root:
<Select.Root
  collection={collection()}
  value={props.value ? [props.value] : []}
  onValueChange={handleValueChange}
  disabled={props.disabled}
  positioning={{ sameWidth: true }}  // ADD THIS
>

// Remove inline style from Select.Positioner — delete the style prop entirely:
<Select.Positioner
  class="z-50 overflow-hidden rounded-md border border-input bg-background shadow-md"
  // style={{ ... }}  ← DELETE THIS BLOCK
>
```

- [ ] **Step 2: Fix codeman-group-select.tsx**

Same changes:
```typescript
<Select.Root
  collection={collection()}
  value={props.value ? [props.value] : []}
  onValueChange={handleValueChange}
  disabled={props.disabled}
  positioning={{ sameWidth: true }}  // ADD THIS
>

<Select.Positioner
  class="z-50 overflow-hidden rounded-md border border-input bg-background shadow-md"
  // style={{ ... }}  ← DELETE THIS BLOCK
>
```

- [ ] **Step 3: Check lsp_diagnostics**

Run: lsp_diagnostics on modified files

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/ui/codeman-select.tsx src/shared/components/ui/codeman-group-select.tsx
git commit -m "fix(select): use positioning.sameWidth to prevent flash"
```

---

### Task 5: Refactor Dialog to module-level singleton

**Files:**
- Modify: `src/shared/components/internal/codeman-dialog.tsx`
- Modify: `src/shared/components/internal/codeman-dialog.test.tsx`
- Delete: `src/features/chat/components/workspace-rename-dialog.tsx`
- Delete: `src/features/chat/components/workspace-delete-dialog.tsx`
- Delete: `src/features/chat/components/workspace-rename-dialog.test.tsx`
- Delete: `src/features/chat/components/workspace-delete-dialog.test.tsx`
- Modify: `src/features/chat/routes/chat-layout.tsx` (replace dialog rendering)

- [ ] **Step 1: Rewrite codeman-dialog.tsx as module-level singleton**

```typescript
// src/shared/components/internal/codeman-dialog.tsx
import { createSignal, type JSX } from "solid-js";
import { render, Portal } from "solid-js/web";
import {
  Dialog as ArkDialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "../ui/dialog";
import { Button } from "../ui/button";

// ─── Types ────────────────────────────────────────────────────────────

export interface DialogAlertOptions {
  title: string;
  content: string;
  confirmText?: string;
}

export interface DialogConfirmOptions {
  title: string;
  content: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function getMountTarget(): HTMLElement {
  return document.getElementById("root")?.parentElement ?? document.body;
}

function createContainer(): HTMLDivElement {
  const el = document.createElement("div");
  getMountTarget().appendChild(el);
  return el;
}

// ─── Dialog API ───────────────────────────────────────────────────────

export const Dialog = {
  alert(opts: DialogAlertOptions): Promise<void> {
    return new Promise<void>((resolve) => {
      const container = createContainer();
      const [open, setOpen] = createSignal(true);

      const dispose = render(
        () => (
          <Portal mount={getMountTarget()}>
            <ArkDialog
              open={open()}
              onOpenChange={(details) => {
                if (!details.open) {
                  resolve();
                  dispose();
                  container.remove();
                }
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{opts.title}</DialogTitle>
                  <DialogDescription>{opts.content}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    onClick={() => {
                      setOpen(false);
                    }}
                  >
                    {opts.confirmText ?? "OK"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </ArkDialog>
          </Portal>
        ),
        container,
      );
    });
  },

  confirm(opts: DialogConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const container = createContainer();
      const [open, setOpen] = createSignal(true);

      const handleClose = () => {
        resolve(false);
        setOpen(false);
        setTimeout(() => { dispose(); container.remove(); }, 300);
      };

      const handleConfirm = () => {
        resolve(true);
        setOpen(false);
        setTimeout(() => { dispose(); container.remove(); }, 300);
      };

      const dispose = render(
        () => (
          <Portal mount={getMountTarget()}>
            <ArkDialog
              open={open()}
              onOpenChange={(details) => {
                if (!details.open) handleClose();
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{opts.title}</DialogTitle>
                  <DialogDescription>{opts.content}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose data-testid="cancel-btn">
                    {opts.cancelText ?? "Cancel"}
                  </DialogClose>
                  <Button
                    variant={opts.destructive ? "destructive" : "default"}
                    onClick={handleConfirm}
                    data-testid="confirm-btn"
                  >
                    {opts.confirmText ?? "Confirm"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </ArkDialog>
          </Portal>
        ),
        container,
      );
    });
  },

  show<T>(
    renderFn: (resolve: (value: T) => void) => JSX.Element,
  ): Promise<T> {
    return new Promise<T>((resolve) => {
      const container = createContainer();
      const [open, setOpen] = createSignal(true);

      const handleResolve = (value: T) => {
        resolve(value);
        setOpen(false);
        setTimeout(() => { dispose(); container.remove(); }, 300);
      };

      const dispose = render(
        () => (
          <Portal mount={getMountTarget()}>
            <ArkDialog
              open={open()}
              onOpenChange={(details) => {
                if (!details.open) {
                  resolve(null as unknown as T);
                  setTimeout(() => { dispose(); container.remove(); }, 300);
                }
              }}
            >
              <DialogContent>
                {renderFn(handleResolve)}
              </DialogContent>
            </ArkDialog>
          </Portal>
        ),
        container,
      );
    });
  },
};
```

- [ ] **Step 2: Update chat-layout.tsx to use Dialog instead of Show-based dialogs**

Replace the workspace rename/delete dialog rendering in chat-layout.tsx:

```typescript
import { Dialog } from "../../../shared/components/internal/codeman-dialog";
import { renameWorkspace, removeWorkspace } from "../stores/chat.store";

// Replace handleRenameWorkspace:
const handleRenameWorkspace = async (workspaceId: string, currentLabel: string) => {
  const newLabel = await Dialog.show<string | null>((resolve) => (
    <div class="space-y-4 p-4" data-testid="rename-dialog">
      <label class="text-sm font-medium">Workspace name</label>
      <input
        class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={currentLabel}
        onInput={(e) => {
          // Store value on the element for later reading
          (e.currentTarget as HTMLInputElement).dataset.value = e.currentTarget.value;
        }}
        autofocus
      />
      <div class="flex justify-end gap-2 pt-2">
        <button
          class="inline-flex h-10 px-4 py-2 items-center justify-center rounded-md border border-input"
          onClick={() => resolve(null)}
        >
          Cancel
        </button>
        <button
          class="inline-flex h-10 px-4 py-2 items-center justify-center rounded-md bg-primary text-primary-foreground"
          onClick={() => {
            const input = document.querySelector('[data-testid="rename-dialog"] input') as HTMLInputElement;
            resolve(input?.dataset.value ?? currentLabel);
          }}
          data-testid="rename-submit"
        >
          Rename
        </button>
      </div>
    </div>
  ));

  if (newLabel && newLabel !== currentLabel) {
    const exit = await Effect.runPromiseExit(renameWorkspace(workspaceId, newLabel));
    if (Exit.isFailure(exit)) {
      console.error("[chat-layout] rename failed:", exit.cause);
    }
  }
};

// Replace handleDeleteWorkspace:
const handleDeleteWorkspace = async (workspaceId: string, label: string) => {
  const confirmed = await Dialog.confirm({
    title: "Delete workspace",
    content: `Are you sure you want to delete "${label}"? All conversations in this workspace will be permanently deleted.`,
    confirmText: "Delete",
    cancelText: "Cancel",
    destructive: true,
  });

  if (!confirmed) return;

  const exit = await Effect.runPromiseExit(removeWorkspace(workspaceId));
  if (Exit.isFailure(exit)) {
    console.error("[chat-layout] delete failed:", exit.cause);
  }
};
```

Then remove:
- The `dialogType`, `dialogWorkspaceId`, `dialogWorkspaceLabel` signals
- The `closeDialog` function
- The `<Show when={dialogType() === "rename"}>` and `<Show when={dialogType() === "delete"}>` blocks
- Imports for `WorkspaceRenameDialog` and `WorkspaceDeleteDialog`

- [ ] **Step 3: Delete workspace dialog component files**

```bash
git rm src/features/chat/components/workspace-rename-dialog.tsx
git rm src/features/chat/components/workspace-delete-dialog.tsx
git rm src/features/chat/components/workspace-rename-dialog.test.tsx
git rm src/features/chat/components/workspace-delete-dialog.test.tsx
```

- [ ] **Step 4: Update CodemanDialog tests**

Rewrite `codeman-dialog.test.tsx` to test the module-level `Dialog.{alert,confirm,show}` API.
Test with render() + Portal pattern verification.

- [ ] **Step 5: Remove CodemanDialogProvider from anywhere it's used**

Search for `CodemanDialogProvider` usage and remove. Since the new Dialog doesn't need a provider, any wrapping can be removed.

- [ ] **Step 6: Check lsp_diagnostics**

Run: lsp_diagnostics on modified files

- [ ] **Step 7: Run unit tests**

Run: `npx vitest run src/shared/components/internal/codeman-dialog.test.tsx`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add src/shared/components/internal/codeman-dialog.tsx src/features/chat/routes/chat-layout.tsx
git commit -m "refactor(dialog): module-level singleton with render+Portal"
```

---

### Task 6: Remove window.__chatStore bridge from index.tsx

**Files:**
- Modify: `src/index.tsx`

- [ ] **Step 1: Delete the bridge code**

Remove lines 83-107 from `src/index.tsx` (the entire `WindowWithChatStore` type and assignment block).

Also can remove the unused `import * as chatStore` if no longer needed at that scope (it's still used on line 45 for `chatStore.loadWorkspaces` — keep that).

- [ ] **Step 2: Check lsp_diagnostics**

Run: lsp_diagnostics on `src/index.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/index.tsx
git commit -m "chore: remove window.__chatStore e2e bridge"
```

---

### Task 7: Rebuild e2e tests

**Files:**
- Modify: `e2e/helpers.ts`
- Modify: `e2e/09-per-conv-runtime.spec.ts`
- Modify: `e2e/05-chat-message-bubble.spec.ts`
- Modify: `e2e/07-mock-provider.spec.ts`
- Modify: `e2e/05-file-tools.spec.ts`
- Modify: `e2e/08-file-tools-mock.spec.ts`
- Modify: `e2e/06-llm-round-trip.spec.ts`
- Modify: `e2e/10-home-agent.spec.ts`

- [ ] **Step 1: Rewrite clickNewConversationAndWait in helpers.ts**

```typescript
/**
 * UI-driven conversation creation flow:
 * 1. Navigate to /
 * 2. Select workspace from picker (or use auto-select for 1 ws)
 * 3. Type in HomeAgentForm input
 * 4. Click send
 * 5. Wait for ChatView mount (textarea visible)
 * 6. Read convId from URL or sidebar
 *
 * Caller MUST have:
 * - Workspace provisioned via invoke(page, "add_workspace", ...)
 * - Mock provider active (useMockProvider) + enqueueMockResponse
 */
export async function clickNewConversationAndWait(
  p: TauriPage,
  opts: { workspaceLabel?: string; title?: string } = {},
): Promise<{ convId: string }> {
  // 1. Navigate to /
  await p.goto("/");

  // 2. Wait for home form input to appear
  await assert.visible(p.locator('[data-testid="codex-input"]'), { timeout: 15_000 });

  // 3. Select workspace from picker (trigger click → select option by label)
  const wsLabel = opts.workspaceLabel;
  if (wsLabel) {
    await p.evaluate((label: string) => {
      const trigger = document.querySelector('[data-testid="workspace-select-trigger"]') as HTMLElement;
      trigger?.click();
      // Wait for content
      setTimeout(() => {
        const items = document.querySelectorAll('[role="option"]');
        for (const item of Array.from(items)) {
          if ((item.textContent ?? "").trim() === label) {
            (item as HTMLElement).click();
            break;
          }
        }
      }, 100);
    }, wsLabel);
    await new Promise((r) => setTimeout(r, 300));
  }

  // 4. Type + submit
  const text = opts.title ?? "E2E Test Conv";
  await p.locator('[data-testid="codex-input"]').fill(text);
  await p.locator('[data-testid="codex-send"]').click();

  // 5. Wait for ChatView mount
  await assert.visible(
    p.locator('textarea[placeholder="发条消息\u2026"]'),
    { timeout: 15_000 },
  );

  // 6. Read convId from URL
  const convId = await p.evaluate(() => {
    const match = window.location.pathname.match(/\/conversation\/(.+)/);
    return match?.[1] ?? null;
  });
  if (!convId) {
    throw new Error("clickNewConversationAndWait: no convId in URL after navigation");
  }

  return { convId };
}
```

- [ ] **Step 2: Rewrite setupWorkspaceAndCreateConvViaIpc**

```typescript
/**
 * Simplified version that:
 * 1. Cleans old workspaces via IPC
 * 2. Creates a workspace via IPC
 * 3. Navigates to / (auto-loads workspaces from mount)
 * 4. Drives HomeAgentForm UI
 * 5. Returns workspaceId + convId
 */
export async function setupWorkspaceAndCreateConvViaIpc(
  p: TauriPage,
  opts: { workspaceLabel?: string; workspaceRoot?: string; title?: string } = {},
): Promise<{ workspaceId: string; convId: string }> {
  const label = opts.workspaceLabel ?? "E2E Test Workspace";
  const root = opts.workspaceRoot ?? path.join(os.tmpdir(), "codeman-e2e-" + Date.now());
  const title = opts.title ?? "E2E Test Conv";

  await p.goto("/");
  await assert.visible(p.locator('[data-testid="codex-input"]'), { timeout: 15_000 });

  // Clean old workspaces
  try {
    const oldWorkspaces = await invoke<{ id: string }[]>(p, "list_workspaces");
    for (const ws of oldWorkspaces) {
      await invoke(p, "delete_workspace", { id: ws.id });
    }
  } catch { /* best-effort */ }

  // Create workspace via IPC
  const actualWsId = (await invoke<Workspace>(p, "add_workspace", { label, rootPath: root })).id;

  // Navigate to / — chat-layout mount triggers loadWorkspaces
  await p.goto("/");
  await assert.visible(p.locator('[data-testid="codex-input"]'), { timeout: 15_000 });

  // Use clickNewConversationAndWait to create conversation
  const { convId } = await clickNewConversationAndWait(p, { workspaceLabel: label, title });

  return { workspaceId: actualWsId, convId };
}
```

- [ ] **Step 3: Rewrite resetChatState**

```typescript
export async function resetChatState(page: TauriPage): Promise<void> {
  try {
    await cancelRunningAgent(page);
    await invoke(page, "clear_all_history");
  } catch { /* best-effort */ }

  await page.goto("/");
  await assert.visible(page.locator('[data-testid="codex-input"]'), { timeout: 15_000 });

  // Provision workspace + create conv via UI
  try {
    await setupWorkspaceAndCreateConvViaIpc(page);
  } catch { /* best-effort */ }

  await assert.visible(
    page.locator('textarea[placeholder="发条消息\u2026"]'),
    { timeout: 15_000 },
  );
}
```

- [ ] **Step 4: Update 09-per-conv-runtime.spec.ts**

Remove `__chatStore` references in beforeAll (lines 52-60). Workspace is loaded by chat-layout mount after page.goto("/").

```typescript
test.beforeAll(async ({ tauriEnv }) => {
  const { page } = tauriEnv;
  await page.goto("/");
  await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });

  // D8-W: provision workspace directly via IPC
  const ws = await invoke<{ id: string }>(page, "add_workspace", {
    label: "09 Test Workspace",
    rootPath: path.join(os.tmpdir(), "codeman-09-" + Date.now()),
  });
  // No __chatStore needed — chat-layout mount loads workspaces

  await useMockProvider(page);
  // Verify mock provider
  const settings = await invoke<{ default_llm_provider_id?: string }>(page, "get_settings");
  if (settings.default_llm_provider_id !== "mock") {
    throw new Error("default_llm_provider_id should be 'mock'");
  }
});
```

Update `beforeEach` — enqueue mock response for clickNewConversationAndWait:
```typescript
test.beforeEach(async ({ tauriEnv }) => {
  const { page } = tauriEnv;
  await cancelRunningAgent(page);
  await clearAllHistory(page);
  await clearMockQueue(page);
  // Enqueue mock response for conversation creation
  await enqueueMockResponse(page, { text: "Mock setup", delayMs: 50 });
  const { convId } = await clickNewConversationAndWait(page);
  beforeEachConvId = convId;
});
```

- [ ] **Step 5: Update 05-chat-message-bubble.spec.ts**

Replace `activeId$()` store reading (lines 72-76) with URL-based reading:

```typescript
// Replace:
const activeInStore = await page.evaluate(() => {
  const w = window as unknown as { __chatStore?: { activeId$: () => string | null } };
  return w.__chatStore?.activeId$() ?? null;
});
expect(activeInStore).toBe(convId);

// With:
// convId is already returned by clickNewConversationAndWait — no need to verify via store
```

Add mock provider setup:
```typescript
test.beforeEach(async ({ tauriEnv }) => {
  const { page } = tauriEnv;
  await resetChatState(page);
  // Ensure mock provider + enqueue for conv creation
  await useMockProvider(page);
  await enqueueMockResponse(page, { text: "Mock response", delayMs: 50 });
});
```

- [ ] **Step 6: Update other spec files**

For each spec that uses `clickNewConversationAndWait`:
- Add `await enqueueMockResponse(page, { text: "Setup", delayMs: 50 })` before calling it
- Ensure mock provider is active (useMockProvider where needed)
- Remove any `__chatStore` references

- [ ] **Step 7: Run e2e tests**

Run: `npx playwright test --config playwright.config.ts`
Expected: All specs pass or fail with known issues (not bridge-related)

- [ ] **Step 8: Commit**

```bash
git add e2e/
git commit -m "test(e2e): UI-driven conversation creation, remove window bridge"
```

---

### Task 8: Verify everything compiles and tests pass

**Files:** All

- [ ] **Step 1: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 2: Run all unit tests**

Run: `npx vitest run`
Expected: All unit tests pass

- [ ] **Step 3: LSP diagnostics**

Run: lsp_diagnostics on all modified files
Expected: No errors

- [ ] **Step 4: Build**

Run: `vp run build`
Expected: Build succeeds

- [ ] **Step 5: Final commit (if needed)**

```bash
git add -A
git commit -m "chore: cleanup after refactoring"
```
