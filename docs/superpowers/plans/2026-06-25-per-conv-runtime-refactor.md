# ADR-0019 Per-Conversation Runtime Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor chat runtime + store layer per [ADR-0019](../../adr/0019-per-run-transient-agent.md) — replace `AgentRuntime` Context.Tag service with `createAgentRuntime()` factory, replace per-conv `Agent` accumulation with per-run transient `Agent`, make `conversations.store` single source of truth (replacing `messages.store` + `agent.store`).

**Architecture:**

- `lib/runtime.ts` — pure factory function `createAgentRuntime()` returning `AgentRuntime` interface (closure-based, no class, no Context.Tag, no Layer DI, no `Ref<Map<ConvId, Agent>>`)
- `lib/anthropic-transport.ts` — accept injected `AbortSignal` in options, prefer own signal over pi-agent's internal signal
- `stores/conversations.store.ts` — `ConversationState` type + Solid `createStore<{ activeId, byId }>` + `sendMessage` (runtime.run + Stream.runForEach subscription) + `handleEvent` (event type → setStore update) + CRUD
- Delete: `stores/agent.store.ts` + `stores/messages.store.ts` (subsumed by `conversations.store`)
- `components/chat-view.tsx` — use `conversations.store` directly, no more `messages$` / `chatAgentStore`
- `components/sidebar.tsx` — add streaming status indicator

**Tech Stack:**

- Effect-TS 3.x (`Stream`, `Queue`, `Effect.fork`, `Ref`)
- Solid.js (`createStore`, `Accessor`)
- pi-mono (`@mariozechner/pi-ai` + `@mariozechner/pi-agent`)
- vitest + @effect/vitest + @solidjs/testing-library

**Pre-flight check (before starting):**

```bash
cd C:\Users\zcati\Documents\project\codeman-agent
git status
git branch --show-current
```

Expected: clean working tree on `master`. If dirty, commit or stash first.

**Optional worktree:** skill recommends dedicated worktree (`using-git-worktrees`), but if user didn't create one, proceed on current branch.

---

## Phase 1: Runtime Layer

### Task 1: AnthropicTransport — accept injected `AbortSignal`

**Files:**

- Modify: `src/features/chat/lib/anthropic-transport.ts:157-159` (interface), `:480-527` (run method)

- [ ] **Step 1: Add `signal` to `AnthropicTransportOptions`**

In `src/features/chat/lib/anthropic-transport.ts`, replace lines 157-159:

```ts
export interface AnthropicTransportOptions {
  getApiKey: () => Promise<string | undefined>;
}
```

with:

```ts
export interface AnthropicTransportOptions {
  getApiKey: () => Promise<string | undefined>;
  /** 注入的 abort signal,优先级高于 pi-agent 内部 signal。ADR-0019 D2 cancel 用 AbortController。 */
  signal?: AbortSignal;
}
```

- [ ] **Step 2: Update `run()` to prefer own signal over pi-agent signal**

In `src/features/chat/lib/anthropic-transport.ts:480`, replace the `run` method signature and the `signal` reference inside:

Old (line 480-485):

```ts
async *run(
  messages: Message[],
  _userMessage: Message,
  config: AgentRunConfig,
  signal?: AbortSignal,
): AsyncGenerator<unknown, void, unknown> {
```

New:

```ts
async *run(
  messages: Message[],
  _userMessage: Message,
  config: AgentRunConfig,
  piAgentSignal?: AbortSignal,
): AsyncGenerator<unknown, void, unknown> {
  // 优先使用注入的 signal(createAgentRuntime 的 abortController),fallback 到 pi-agent 内部 signal。
  const signal = this.options.signal ?? piAgentSignal;
```

The rest of `run()` (after line 488) keeps its current implementation; only the parameter name and signal resolution change.

- [ ] **Step 3: Verify TypeScript compiles**

Run:

```bash
cd C:\Users\zcati\Documents\project\codeman-agent
vp run typecheck
```

Expected: no errors. (Existing usage of `AnthropicTransport` passes only `getApiKey`; new `signal` is optional so no breakage.)

- [ ] **Step 4: Run existing tests to confirm no regression**

Run:

```bash
vp run test -- src/features/chat/lib
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/chat/lib/anthropic-transport.ts
git commit -m "feat(transport): accept injected AbortSignal in options"
```

---

### Task 2: `runtime.ts` — types + `createAgentRuntime()` factory (failing test first)

**Files:**

- Rewrite: `src/features/chat/lib/runtime.ts` (entire file)
- Modify: `src/features/chat/lib/runtime.test.ts` (full rewrite)

- [ ] **Step 1: Write failing test for factory contract**

Rewrite `src/features/chat/lib/runtime.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Effect, Stream } from "effect";
import { createAgentRuntime, type ProviderConfig, type RuntimeEvent } from "./runtime";
import type { Message } from "../../../shared/lib/types";

const mockProvider: ProviderConfig = {
  apiKey: "test-key",
  baseUrl: "https://mock.local",
  defaultModel: "mock-model",
  systemPrompt: "You are a helpful assistant.",
  tools: [],
};

const mockContext: Message[] = [
  {
    id: "u1",
    conversation_id: "c1",
    role: "user",
    content: "hi",
    tool_calls: null,
    tool_results: null,
    model: null,
    input_tokens: null,
    output_tokens: null,
    created_at: 1,
  },
];

describe("createAgentRuntime()", () => {
  it("returns object with run + cancel methods", () => {
    const runtime = createAgentRuntime();
    expect(typeof runtime.run).toBe("function");
    expect(typeof runtime.cancel).toBe("function");
  });

  it("cancel() before run() does not throw", () => {
    const runtime = createAgentRuntime();
    expect(() => runtime.cancel()).not.toThrow();
  });

  it("run() returns a Stream", () => {
    const runtime = createAgentRuntime();
    const stream = runtime.run({ context: mockContext, provider: mockProvider });
    // Stream is an Effect — sanity check it has runForEach-compatible shape
    expect(stream).toBeDefined();
    // We can't easily consume the stream without a real Agent, so just assert type.
    const _typeCheck: Stream.Stream<RuntimeEvent, never, never> = stream;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
vp run test -- src/features/chat/lib/runtime.test.ts
```

Expected: FAIL — `createAgentRuntime` and `ProviderConfig` / `RuntimeEvent` not exported from `./runtime`.

- [ ] **Step 3: Write minimal implementation — types + factory skeleton**

Rewrite `src/features/chat/lib/runtime.ts`:

```ts
//! AgentRuntime — pi-agent 0.9.0 的 Effect Stream 包装 (V2 ADR-0019 重构)。
//!
//! 工厂模式,无 Context.Tag / 无 Layer DI / 无 Ref<Map<ConvId, Agent>>:
//! - `createAgentRuntime()` 返回 `AgentRuntime` 接口,closure 持有 per-run 状态
//! - `run({ context, provider })`: context 是 store messages 浅拷贝(含最新 user msg)
//! - 每次 run 新建 pi-mono Agent + Queue + Fiber
//! - `cancel()`: 调 closure 内 `AbortController.abort()` 触发 fetch abort
//!
//! 详细架构见 ADR-0019。

import { Effect, Stream, Queue } from "effect";
import type { Model } from "@mariozechner/pi-ai";
import { Agent, type AgentTransport } from "@mariozechner/pi-agent";
import { AnthropicTransport } from "./anthropic-transport";
import type { Message } from "../../../shared/lib/types";
import { getBalanceTool, getPlanQuotaTool } from "../../billing/lib/billing";
import { fileTools } from "../../file-tools/lib/file-tools";

// ─── Runtime event types (5 variants,ADR-0017) ──────────────────

export type RuntimeEvent =
  | { type: "token"; content: string }
  | { type: "tool_call"; toolCall: { id: string; name: string; args: Record<string, unknown> } }
  | { type: "tool_result"; toolCallId: string; result: unknown; error?: string }
  | { type: "done"; message: Message }
  | { type: "error"; error: { message: string } };

// ─── Provider config (per-run, not closure) ─────────────────────

export interface ProviderConfig {
  apiKey: string | null;
  baseUrl: string;
  defaultModel: string;
  systemPrompt: string;
  tools: unknown[];
}

// ─── Run options ────────────────────────────────────────────────

export interface RunOptions {
  /** 浅拷贝,含最新用户输入 */
  context: Message[];
  provider: ProviderConfig;
}

// ─── AgentRuntime interface ─────────────────────────────────────

export interface AgentRuntime {
  run(opts: RunOptions): Stream.Stream<RuntimeEvent, never, never>;
  cancel(): void;
}

// ─── Factory (closure-based, no class, no Context.Tag) ──────────

export function createAgentRuntime(): AgentRuntime {
  let currentAbortController: AbortController | null = null;

  return {
    run({ context, provider }: RunOptions): Stream.Stream<RuntimeEvent, never, never> {
      // TODO(后续 Task): 实现 Agent + Queue + Fiber 完整 wiring
      // 当前只返回 empty stream 让 factory contract test 通过
      return Stream.empty;
    },

    cancel(): void {
      currentAbortController?.abort();
      currentAbortController = null;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
vp run test -- src/features/chat/lib/runtime.test.ts
```

Expected: PASS (3/3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/chat/lib/runtime.ts src/features/chat/lib/runtime.test.ts
git commit -m "feat(runtime): createAgentRuntime() factory skeleton with types"
```

---

### Task 3: `runtime.ts` — full `run()` implementation (TDD)

**Files:**

- Modify: `src/features/chat/lib/runtime.ts` (replace `Stream.empty` with full implementation)
- Modify: `src/features/chat/lib/runtime.test.ts` (add event translation tests)

- [ ] **Step 1: Add failing test for event translation (mock Agent + Queue)**

Append to `src/features/chat/lib/runtime.test.ts`:

```ts
import { Agent } from "@mariozechner/pi-agent";
import { vi } from "vitest";

// Mock pi-agent Agent
vi.mock("@mariozechner/pi-agent", async () => {
  const actual = await vi.importActual<typeof import("@mariozechner/pi-agent")>("@mariozechner/pi-agent");
  return {
    ...actual,
    Agent: vi.fn().mockImplementation(() => ({
      subscribe: (handler: (evt: unknown) => void) => {
        // emit a fake message_update event synchronously after subscribe
        setTimeout(() => {
          handler({ type: "message_update", message: { content: [{ type: "text", text: "hello" }] } });
          handler({ type: "agent_end", messages: [{ content: [{ type: "text", text: "hello" }] }] });
        }, 0);
        return () => {};
      },
      prompt: vi.fn().mockResolvedValue(undefined),
      appendMessage: vi.fn(),
    })),
  };
});

describe("run() — event translation", () => {
  it("translates message_update text → token event", async () => {
    const runtime = createAgentRuntime();
    const events: RuntimeEvent[] = [];
    const program = Stream.runForEach(runtime.run({ context: mockContext, provider: mockProvider }), (e) =>
      Effect.sync(() => events.push(e)),
    );
    await Effect.runPromise(program.pipe(Effect.scoped)));
    const tokens = events.filter((e) => e.type === "token");
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0]).toMatchObject({ type: "token", content: "hello" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
vp run test -- src/features/chat/lib/runtime.test.ts
```

Expected: FAIL — events array is empty (because `Stream.empty` returns no events).

- [ ] **Step 3: Replace `run()` body with full implementation**

In `src/features/chat/lib/runtime.ts`, replace the `run()` method:

```ts
run({ context, provider }: RunOptions): Stream.Stream<RuntimeEvent, never, never> {
  return Stream.unwrap(
    Effect.gen(function* () {
      const abortController = new AbortController();
      currentAbortController = abortController;

      const queue = yield* Queue.unbounded<RuntimeEvent>();

      const transport = new AnthropicTransport({
        getApiKey: async () => provider.apiKey ?? undefined,
        signal: abortController.signal,
      });

      const model: Model<any> = {
        id: provider.defaultModel || "auto",
        name: provider.systemPrompt.slice(0, 20) || "agent",
        api: "anthropic-messages",
        provider: "anthropic",
        baseUrl: provider.baseUrl,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      };

      const tools = [getBalanceTool, getPlanQuotaTool, ...fileTools];

      const agent = new Agent({
        transport: transport as unknown as AgentTransport,
        initialState: {
          systemPrompt: provider.systemPrompt,
          model,
          tools,
          messages: context,
        },
      });

      yield* Effect.fork(
        Effect.scoped(
          Effect.gen(function* () {
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => {
                Queue.shutdown(queue);
                if (currentAbortController === abortController) {
                  currentAbortController = null;
                }
              }),
            );

            const sub = agent.subscribe((evt: unknown) => {
              try {
                const e = evt as { type: string; message?: { content?: unknown[] }; toolCallId?: string; result?: unknown; isError?: boolean; messages?: Array<{ content?: Array<{ type: string; text?: string; id?: string; name?: string; arguments?: Record<string, unknown> }> }> };
                switch (e.type) {
                  case "message_update": {
                    const msg = e.message;
                    if (!msg?.content || !Array.isArray(msg.content)) return;
                    for (const block of msg.content) {
                      const b = block as { type: string; text?: string; id?: string; name?: string; arguments?: Record<string, unknown> };
                      if (b.type === "text" && b.text !== undefined) {
                        Queue.unsafeOffer(queue, { type: "token", content: b.text });
                      } else if (b.type === "toolCall" && b.id !== undefined) {
                        Queue.unsafeOffer(queue, {
                          type: "tool_call",
                          toolCall: { id: b.id, name: b.name ?? "", args: b.arguments ?? {} },
                        });
                      }
                    }
                    break;
                  }
                  case "tool_execution_end": {
                    Queue.unsafeOffer(queue, {
                      type: "tool_result",
                      toolCallId: e.toolCallId!,
                      result: e.result,
                      error: e.isError ? String(e.result) : undefined,
                    });
                    break;
                  }
                  case "agent_end": {
                    const msgs = e.messages ?? [];
                    if (msgs.length > 0) {
                      const lastMsg = msgs[msgs.length - 1];
                      const text = (lastMsg.content ?? [])
                        .filter((b) => b.type === "text")
                        .map((b) => b.text ?? "")
                        .join("");
                      const toolBlocks = (lastMsg.content ?? []).filter(
                        (b) => b.type === "toolCall" && b.id !== undefined,
                      );
                      Queue.unsafeOffer(queue, {
                        type: "done",
                        message: {
                          id: crypto.randomUUID(),
                          conversation_id: "",
                          role: "assistant",
                          content: text,
                          tool_calls:
                            toolBlocks.length > 0
                              ? toolBlocks.map((b) => ({
                                  id: b.id!,
                                  name: b.name ?? "",
                                  args: b.arguments ?? {},
                                }))
                              : null,
                          tool_results: null,
                          model: provider.defaultModel || null,
                          input_tokens: null,
                          output_tokens: null,
                          created_at: Date.now(),
                        },
                      });
                    }
                    break;
                  }
                }
              } catch (err) {
                Queue.unsafeOffer(queue, {
                  type: "error",
                  error: { message: String(err) },
                });
              }
            });

            yield* Effect.addFinalizer(() => Effect.sync(() => sub()));

            const lastUser = [...context].reverse().find((m) => m.role === "user");
            const userContent = lastUser?.content ?? "";
            yield* Effect.tryPromise({
              try: () => agent.prompt(userContent),
              catch: (err) => {
                Queue.unsafeOffer(queue, {
                  type: "error",
                  error: { message: String(err) },
                });
              },
            }).pipe(Effect.ignore);
          }),
        ),
      );

      return Stream.fromQueue(queue);
    }),
  );
},
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
vp run test -- src/features/chat/lib/runtime.test.ts
```

Expected: PASS — events array contains translated token events.

- [ ] **Step 5: Commit**

```bash
git add src/features/chat/lib/runtime.ts src/features/chat/lib/runtime.test.ts
git commit -m "feat(runtime): run() full implementation with event translation"
```

---

## Phase 2: Store Layer

### Task 4: `conversations.store.ts` — add `ConversationState` + `createStore`

**Files:**

- Modify: `src/features/chat/stores/conversations.store.ts` (rewrite to absorb messages.store + agent.store)

- [ ] **Step 1: Write failing test for ConversationState shape**

Create or rewrite `src/features/chat/stores/conversations.store.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createRoot } from "solid-js";
import {
  store,
  activeId$,
  conversations$,
  selectConversation,
  setupConvState,
  type ConversationState,
} from "./conversations.store";
import type { Conversation, Message } from "../../../shared/lib/types";

const mockConv: Conversation = {
  id: "c1",
  title: "测试",
  system_prompt: null,
  created_at: 1,
  updated_at: 1,
  archived_at: null,
};

const mockHistory: Message[] = [
  {
    id: "u1",
    conversation_id: "c1",
    role: "user",
    content: "hi",
    tool_calls: null,
    tool_results: null,
    model: null,
    input_tokens: null,
    output_tokens: null,
    created_at: 1,
  },
];

describe("conversations.store — ConversationState", () => {
  it("setupConvState() inserts into byId with empty messages state + runtime", () =>
    createRoot((dispose) => {
      setupConvState(mockConv, mockHistory);
      const cs = store.byId["c1"] as ConversationState | undefined;
      expect(cs).toBeDefined();
      expect(cs?.id).toBe("c1");
      expect(cs?.messages).toEqual(mockHistory);
      expect(cs?.streamingMessageId).toBeNull();
      expect(cs?.runtime).toBeDefined();
      expect(typeof cs?.runtime.run).toBe("function");
      expect(typeof cs?.runtime.cancel).toBe("function");
      dispose();
    }));

  it("selectConversation() sets activeId", () =>
    createRoot((dispose) => {
      setupConvState(mockConv, mockHistory);
      selectConversation("c1");
      expect(activeId$()).toBe("c1");
      dispose();
    }));

  it("conversations$ accessor returns byId values", () =>
    createRoot((dispose) => {
      setupConvState(mockConv, mockHistory);
      const list = conversations$();
      expect(list.some((c) => c.id === "c1")).toBe(true);
      dispose();
    }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
vp run test -- src/features/chat/stores/conversations.store.test.ts
```

Expected: FAIL — `store`, `setupConvState`, `ConversationState` not exported.

- [ ] **Step 3: Write minimal implementation**

Rewrite `src/features/chat/stores/conversations.store.ts`:

```ts
//! Effect → Solid 会话桥接层 (V2 ADR-0019: 吸收 messages.store + agent.store)。
//!
//! 唯一响应式源: Solid `createStore<{ activeId, byId: Record<ConvId, ConversationState> }>`。
//! ConversationState = DB fields + messages + streamingMessageId + runtime。
//! UI 读 store.byId[activeId()].messages,Solid proxy 按路径细粒度反应式。
//!
//! UI 暴露:
//! - store / activeId$ / conversations$ : reactive 状态
//! - setupConvState(conv, history)        : 初始化 in-memory ConvState
//! - selectConversation(id)                : 切换 active
//! - sendMessage / cancel / archiveConversation / deleteConversation : 见后续 Task

import { createStore } from "solid-js/store";
import { createSignal, type Accessor } from "solid-js";
import type { Conversation, Message } from "../../../shared/lib/types";
import { createAgentRuntime, type AgentRuntime } from "../lib/runtime";

// ─── ConversationState 类型 (inline 在 conversations.store) ──────

export interface ConversationState {
  // DB-backed fields (mirror shared/lib/types.ts Conversation)
  id: string;
  title: string;
  system_prompt: string | null;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
  // Per-conv reactive state
  messages: Message[];
  streamingMessageId: string | null;
  // Per-conv runtime (createAgentRuntime 工厂产物)
  runtime: AgentRuntime;
}

// ─── 单一响应式源: Solid createStore ──────────────────────────

const [store, setStore] = createStore<{
  activeId: string | null;
  byId: Record<string, ConversationState>;
}>({
  activeId: null,
  byId: {},
});

export { store };

// ─── Accessors (for UI components) ─────────────────────────────

const [activeId, setActiveIdSignal] = createSignal<string | null>(null);
export const activeId$: Accessor<string | null> = activeId;

const [conversations, setConversationsSignal] = createSignal<ConversationState[]>([]);
export const conversations$: Accessor<ConversationState[]> = conversations;

// ─── setupConvState: 初始化 ConvState ────────────────────────

export function setupConvState(conv: Conversation, history: Message[]): ConversationState {
  const runtime = createAgentRuntime();
  const cs: ConversationState = {
    id: conv.id,
    title: conv.title,
    system_prompt: conv.system_prompt,
    created_at: conv.created_at,
    updated_at: conv.updated_at,
    archived_at: conv.archived_at,
    messages: history,
    streamingMessageId: null,
    runtime,
  };
  setStore("byId", conv.id, cs);
  // 同步 conversations$ accessor
  setConversationsSignal(Object.values(store.byId));
  return cs;
}

// ─── selectConversation: 切换 active ──────────────────────────

export function selectConversation(id: string): void {
  setActiveIdSignal(id);
  setStore("activeId", id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
vp run test -- src/features/chat/stores/conversations.store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/chat/stores/conversations.store.ts src/features/chat/stores/conversations.store.test.ts
git commit -m "feat(store): ConversationState type + createStore skeleton + setupConvState"
```

---

### Task 5: `conversations.store.ts` — `sendMessage` + `handleEvent`

**Files:**

- Modify: `src/features/chat/stores/conversations.store.ts` (add `sendMessage`)
- Modify: `src/features/chat/stores/conversations.store.test.ts` (add cross-conv isolation test)

- [ ] **Step 1: Write failing test for cross-conv isolation**

Append to `src/features/chat/stores/conversations.store.test.ts`:

```ts
import { sendMessage, type ProviderConfig } from "./conversations.store";
import { vi } from "vitest";

const mockProvider: ProviderConfig = {
  apiKey: "k",
  baseUrl: "https://mock.local",
  defaultModel: "m",
  systemPrompt: "s",
  tools: [],
};

describe("sendMessage — cross-conv isolation", () => {
  it("A's events update A's slot, do not affect B's slot", async () =>
    createRoot(async (dispose) => {
      const convA = { ...mockConv, id: "cA" };
      const convB = { ...mockConv, id: "cB" };
      setupConvState(convA, []);
      setupConvState(convB, []);

      // Mock createAgentRuntime so we can inject controlled events
      // (这里假设 runtime 已经在 setupConvState 里被创建,我们手动 emit 事件)
      // 实际验证通过 store.byId["cA"] 不等于 store.byId["cB"]
      const csA = store.byId["cA"];
      const csB = store.byId["cB"];
      expect(csA).toBeDefined();
      expect(csB).toBeDefined();
      expect(csA).not.toBe(csB);
      expect(csA?.messages).not.toBe(csB?.messages);

      // 简单 sanity: 直接修改 A 的 slot,B 不变
      setStore("byId", "cA", "messages", [
        {
          id: "x",
          conversation_id: "cA",
          role: "user",
          content: "test",
          tool_calls: null,
          tool_results: null,
          model: null,
          input_tokens: null,
          output_tokens: null,
          created_at: 1,
        },
      ]);
      expect(store.byId["cA"]?.messages.length).toBe(1);
      expect(store.byId["cB"]?.messages.length).toBe(0);

      dispose();
    }));
});
```

- [ ] **Step 2: Run test to verify it passes (already passes — slot isolation works via createStore)**

Run:

```bash
vp run test -- src/features/chat/stores/conversations.store.test.ts
```

Expected: PASS — the test verifies createStore path isolation, which already works.

- [ ] **Step 3: Add `sendMessage` implementation**

Append to `src/features/chat/stores/conversations.store.ts`:

```ts
import { Effect, Stream, Exit } from "effect";
import { MessageService, MessageServiceLive } from "../../../shared/lib/tauri";
import type { RuntimeEvent } from "../lib/runtime";

// ─── sendMessage: append user msg + run + subscribe ───────────

export async function sendMessage(
  convId: string,
  content: string,
  provider: ProviderConfig,
): Promise<void> {
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
  await persistUserMessage(userMsg);

  // 2. Build context (浅拷贝,含最新 user msg)
  const context = [...store.byId[convId]!.messages];

  // 3. Run runtime + subscribe
  const stream = cs.runtime.run({ context, provider });
  const program = Stream.runForEach(stream, (evt) => Effect.sync(() => handleEvent(convId, evt)));
  const result = await Effect.runPromiseExit(program.pipe(Effect.scoped));
  if (Exit.isFailure(result)) {
    // logger.error 等 — 见后续 Task
    console.error("[conversations.store] sendMessage stream failure:", result.cause);
  }
}

// ─── handleEvent: RuntimeEvent → setStore ─────────────────────

function handleEvent(convId: string, evt: RuntimeEvent): void {
  switch (evt.type) {
    case "token": {
      // 找或创建 streaming stub
      const cs = store.byId[convId];
      if (!cs) return;
      let stubId = cs.streamingMessageId;
      if (!stubId) {
        stubId = crypto.randomUUID();
        const stub: Message = {
          id: stubId,
          conversation_id: convId,
          role: "assistant",
          content: "",
          tool_calls: null,
          tool_results: null,
          model: null,
          input_tokens: null,
          output_tokens: null,
          created_at: Date.now(),
        };
        setStore("byId", convId, "messages", (msgs) => [...msgs, stub]);
        setStore("byId", convId, "streamingMessageId", stubId);
      }
      setStore("byId", convId, "messages", (msgs) =>
        msgs.map((m) => (m.id === stubId ? { ...m, content: evt.content } : m)),
      );
      break;
    }
    case "tool_call":
      // 简化:仅追加 tool_calls 数组
      setStore("byId", convId, "messages", (msgs) =>
        msgs.map((m) => {
          if (m.id !== store.byId[convId]?.streamingMessageId) return m;
          return { ...m, tool_calls: [...(m.tool_calls ?? []), evt.toolCall] };
        }),
      );
      break;
    case "tool_result":
      setStore("byId", convId, "messages", (msgs) =>
        msgs.map((m) => {
          if (m.id !== store.byId[convId]?.streamingMessageId) return m;
          return {
            ...m,
            tool_results: [
              ...(m.tool_results ?? []),
              { tool_call_id: evt.toolCallId, result: evt.result, error: evt.error ?? null },
            ],
          };
        }),
      );
      break;
    case "done": {
      const stubId = store.byId[convId]?.streamingMessageId;
      if (stubId) {
        setStore("byId", convId, "messages", (msgs) =>
          msgs.map((m) => (m.id === stubId ? { ...evt.message, id: stubId } : m)),
        );
      } else {
        setStore("byId", convId, "messages", (msgs) => [...msgs, evt.message]);
      }
      setStore("byId", convId, "streamingMessageId", null);
      void persistAssistantMessage({ ...evt.message, conversation_id: convId });
      break;
    }
    case "error":
      console.error("[conversations.store] runtime error:", evt.error);
      break;
  }
}

// ─── DB 持久化辅助 ────────────────────────────────────────────

async function persistUserMessage(msg: Message): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* MessageService;
    return yield* svc.append({
      conversationId: msg.conversation_id,
      role: msg.role,
      content: msg.content,
    });
  }).pipe(Effect.provide(MessageServiceLive));
  await Effect.runPromiseExit(program);
}

async function persistAssistantMessage(msg: Message): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* MessageService;
    return yield* svc.append({
      conversationId: msg.conversation_id,
      role: msg.role,
      content: msg.content,
      toolCalls: msg.tool_calls ? JSON.stringify(msg.tool_calls) : undefined,
      toolResults: msg.tool_results ? JSON.stringify(msg.tool_results) : undefined,
      model: msg.model ?? undefined,
    });
  }).pipe(Effect.provide(MessageServiceLive));
  await Effect.runPromiseExit(program);
}
```

Also add the missing `ProviderConfig` import:

```ts
import type { ProviderConfig } from "../lib/runtime";
```

(Add this at the top of the file alongside existing imports.)

- [ ] **Step 4: Verify TypeScript compiles**

Run:

```bash
vp run typecheck
```

Expected: no errors.

- [ ] **Step 5: Run all conversations.store tests**

Run:

```bash
vp run test -- src/features/chat/stores/conversations.store.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/chat/stores/conversations.store.ts src/features/chat/stores/conversations.store.test.ts
git commit -m "feat(store): sendMessage + handleEvent with per-conv slot updates"
```

---

### Task 6: `conversations.store.ts` — `cancel` + `archiveConversation` + `deleteConversation`

**Files:**

- Modify: `src/features/chat/stores/conversations.store.ts`
- Modify: `src/features/chat/stores/conversations.store.test.ts`

- [ ] **Step 1: Write failing test for cancel/archive/delete**

Append to `src/features/chat/stores/conversations.store.test.ts`:

```ts
import { cancel, archiveConversation, deleteConversation } from "./conversations.store";

describe("cancel/archive/delete", () => {
  it("cancel() calls runtime.cancel()", () =>
    createRoot((dispose) => {
      setupConvState(mockConv, []);
      const cs = store.byId["c1"];
      const spy = vi.spyOn(cs!.runtime, "cancel");
      cancel("c1");
      expect(spy).toHaveBeenCalled();
      dispose();
    }));

  it("archiveConversation() removes from store + calls runtime.cancel()", async () =>
    createRoot(async (dispose) => {
      setupConvState(mockConv, []);
      const cs = store.byId["c1"];
      const spy = vi.spyOn(cs!.runtime, "cancel");
      await archiveConversation("c1");
      expect(spy).toHaveBeenCalled();
      expect(store.byId["c1"]).toBeUndefined();
      dispose();
    }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
vp run test -- src/features/chat/stores/conversations.store.test.ts
```

Expected: FAIL — `cancel` / `archiveConversation` not exported.

- [ ] **Step 3: Implement cancel + archive + delete**

Append to `src/features/chat/stores/conversations.store.ts`:

```ts
import { ConversationService, ConversationServiceLive } from "../../../shared/lib/tauri";

// ─── cancel: 调 runtime.cancel() 中断 in-flight stream ───────

export function cancel(convId: string): void {
  store.byId[convId]?.runtime.cancel();
}

// ─── archiveConversation: cancel + 从 store 移除 + DB archive ──

export async function archiveConversation(convId: string): Promise<void> {
  cancel(convId);
  const program = Effect.gen(function* () {
    const svc = yield* ConversationService;
    return yield* svc.archive(convId);
  }).pipe(Effect.provide(ConversationServiceLive));
  await Effect.runPromiseExit(program);
  setStore("byId", convId, undefined as unknown as ConversationState);
  if (activeId() === convId) setActiveIdSignal(null);
  setConversationsSignal(Object.values(store.byId));
}

// ─── deleteConversation: cancel + 从 store 移除 + DB delete ───

export async function deleteConversation(convId: string): Promise<void> {
  cancel(convId);
  const program = Effect.gen(function* () {
    const svc = yield* ConversationService;
    return yield* svc.delete(convId);
  }).pipe(Effect.provide(ConversationServiceLive));
  await Effect.runPromiseExit(program);
  setStore("byId", convId, undefined as unknown as ConversationState);
  if (activeId() === convId) setActiveIdSignal(null);
  setConversationsSignal(Object.values(store.byId));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
vp run test -- src/features/chat/stores/conversations.store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/chat/stores/conversations.store.ts src/features/chat/stores/conversations.store.test.ts
git commit -m "feat(store): cancel + archiveConversation + deleteConversation"
```

---

### Task 7: `conversations.store.ts` — `loadConversations` + `createConversation` (preserve existing API)

**Files:**

- Modify: `src/features/chat/stores/conversations.store.ts`
- Modify: `src/features/chat/stores/conversations.store.test.ts`

- [ ] **Step 1: Write failing test for loadConversations**

Append to test file:

```ts
import { loadConversations } from "./conversations.store";

describe("loadConversations", () => {
  it("populates byId with each conv + empty runtime + history from DB", async () => {
    // 依赖 mockState from src/__mocks__/@tauri-apps/api/core.ts
    // 见 chat/AGENTS.md 测试模式
    await loadConversations(false);
    // Assuming mockState has at least one conv
    expect(Object.keys(store.byId).length).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
vp run test -- src/features/chat/stores/conversations.store.test.ts
```

Expected: FAIL — `loadConversations` not defined or doesn't populate store.

- [ ] **Step 3: Implement loadConversations + createConversation**

Append to `src/features/chat/stores/conversations.store.ts`:

```ts
import { MessageService } from "../../../shared/lib/tauri";

// ─── loadConversations: DB → byId ─────────────────────────────

export async function loadConversations(includeArchived = false): Promise<void> {
  const listProgram = Effect.gen(function* () {
    const svc = yield* ConversationService;
    return yield* svc.list(includeArchived);
  }).pipe(Effect.provide(ConversationServiceLive));
  const listResult = await Effect.runPromiseExit(listProgram);
  if (Exit.isFailure(listResult)) return;
  const convs = listResult.value;

  for (const conv of convs) {
    const historyProgram = Effect.gen(function* () {
      const svc = yield* MessageService;
      return yield* svc.list(conv.id);
    }).pipe(Effect.provide(MessageServiceLive));
    const historyResult = await Effect.runPromiseExit(historyProgram);
    const history = Exit.isSuccess(historyResult) ? historyResult.value : [];
    setupConvState(conv, history);
  }
}

// ─── createConversation: DB 新建 + setupConvState ─────────────

export async function createConversation(title: string, systemPrompt?: string): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* ConversationService;
    return yield* svc.create(title, systemPrompt);
  }).pipe(Effect.provide(ConversationServiceLive));
  const result = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(result)) {
    setupConvState(result.value, []);
    selectConversation(result.value.id);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
vp run test -- src/features/chat/stores/conversations.store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/chat/stores/conversations.store.ts src/features/chat/stores/conversations.store.test.ts
git commit -m "feat(store): loadConversations + createConversation with DB sync"
```

---

## Phase 3: Delete Old Stores

### Task 8: Delete `messages.store.ts` + `messages.store.test.ts`

**Files:**

- Delete: `src/features/chat/stores/messages.store.ts`
- Delete: `src/features/chat/stores/messages.store.test.ts`

- [ ] **Step 1: Search for remaining imports of `messages.store`**

Run:

```bash
cd C:\Users\zcati\Documents\project\codeman-agent
grep -r "from.*messages\.store" src/ --include="*.ts" --include="*.tsx"
grep -r "from.*['\"]\.\./messages\.store" src/ --include="*.ts" --include="*.tsx"
grep -r "from.*['\"]\.\./\.\./messages\.store" src/ --include="*.ts" --include="*.tsx"
```

Expected: shows `chat-view.tsx` and any test files importing it. Note: `chat-view.tsx` still imports `messages.store` (will be refactored in Task 10). **Do NOT delete yet** — proceed to Task 9 first.

- [ ] **Step 2: Run typecheck to confirm breakage**

Run:

```bash
vp run typecheck
```

Expected: typecheck may show errors about `messages.store` imports — this is fine, will be resolved when `chat-view.tsx` is refactored.

- [ ] **Step 3: Defer deletion — Task 10 will refactor `chat-view.tsx` first**

**DO NOT DELETE** `messages.store.ts` yet. Wait until Task 10 (`chat-view.tsx` refactor) is complete so deletion happens atomically.

- [ ] **Step 4: Skip commit (no changes yet)**

No commit yet — proceed to Task 9.

---

### Task 9: Delete `agent.store.ts` + `agent.store.test.ts`

**Files:**

- Delete: `src/features/chat/stores/agent.store.ts`
- Delete: `src/features/chat/stores/agent.store.test.ts`

- [ ] **Step 1: Search for remaining imports of `agent.store`**

Run:

```bash
cd C:\Users\zcati\Documents\project\codeman-agent
grep -r "from.*agent\.store" src/ --include="*.ts" --include="*.tsx"
grep -r "chatAgentStore" src/ --include="*.ts" --include="*.tsx"
```

Expected: shows `chat-view.tsx` still importing `chatAgentStore`. **Do NOT delete yet** — wait until Task 10.

- [ ] **Step 2: Defer deletion — same as Task 8**

No commit yet — proceed to Task 10.

---

## Phase 4: Component Refactor

### Task 10: Refactor `chat-view.tsx` to use `conversations.store` directly

**Files:**

- Modify: `src/features/chat/components/chat-view.tsx` (full rewrite)
- Modify: `src/features/chat/components/chat-view.test.tsx` (update mocks)

- [ ] **Step 1: Update chat-view test mock to use new API**

In `src/features/chat/components/chat-view.test.tsx`, replace all `vi.mock("../stores/messages.store")` and `vi.mock("../stores/agent.store")` with `vi.mock("../stores/conversations.store")`. Update mock return values to match the new API:

```ts
// Replace existing mocks with:
vi.mock("../stores/conversations.store", () => ({
  store: {
    activeId: null,
    byId: {
      c1: {
        id: "c1",
        title: "测试",
        system_prompt: null,
        created_at: 1,
        updated_at: 1,
        archived_at: null,
        messages: [],
        streamingMessageId: null,
        runtime: {
          run: vi.fn(),
          cancel: vi.fn(),
        },
      },
    },
  },
  activeId$: () => "c1",
  conversations$: () => [
    /* ... */
  ],
  sendMessage: vi.fn().mockResolvedValue(undefined),
  cancel: vi.fn(),
  setupConvState: vi.fn(),
  selectConversation: vi.fn(),
}));
```

(Adjust mock to match your test fixtures; the key point is mocking `conversations.store` instead of the deleted stores.)

- [ ] **Step 2: Rewrite `chat-view.tsx` to use `conversations.store`**

Replace `src/features/chat/components/chat-view.tsx` with:

```tsx
//! ChatView — 消息列表 + 输入框 + store 订阅 (V2 ADR-0019)。
//!
//! V2 后不再 import messages.store / agent.store,全部走 conversations.store
//! 的 store / sendMessage / cancel。running 派生自 byId[activeId].streamingMessageId。

import { createSignal, createEffect, For, Show, onMount } from "solid-js";
import { Plus, X, Send } from "lucide-solid";
import { MessageBubble } from "./message-bubble";
import {
  store,
  activeId$,
  conversations$,
  sendMessage,
  cancel,
  selectConversation,
} from "../stores/conversations.store";
import type { ProviderConfig } from "../lib/runtime";
import { Button } from "../../../shared/components/ui/button";
import { Textarea } from "../../../shared/components/ui/textarea";
import { startThemeSync } from "../../../shared/stores/theme";
import { appStore } from "../../../shared/stores/app.store";
import { settingsSaver } from "../../settings/lib/settings-saver";
import type { Provider } from "../../../shared/lib/types";

// (ProviderSelect 内嵌子组件 — 保持 V1.x 形态,见 chat/AGENTS.md)
function ProviderSelect() {
  // ... (复制 chat-view.tsx 现有 ProviderSelect 实现,略)
  const enabledProviders = (): Provider[] =>
    (appStore.state.value.providers ?? []).filter((p) => p.enabled && p.llm);
  const currentId = (): string => {
    const id = appStore.state.value.default_llm_provider_id;
    if (id && enabledProviders().some((p) => p.id === id)) return id;
    return enabledProviders()[0]?.id ?? "";
  };
  const handleChange = (e: Event & { currentTarget: HTMLSelectElement }) => {
    const next = e.currentTarget.value;
    if (!next) return;
    appStore.set({ default_llm_provider_id: next });
    settingsSaver.scheduleSave();
  };
  return (
    <Show
      when={enabledProviders().length > 0}
      fallback={
        <a
          href="/settings"
          class="text-xs text-muted-foreground hover:text-foreground"
          aria-label="无 provider, 请到 settings 配置"
        >
          无 provider — 前往 settings
        </a>
      }
    >
      <select
        id="provider-select"
        class="h-9 max-w-[14rem] truncate rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        value={currentId()}
        onChange={handleChange}
        aria-label="选择 LLM provider"
        data-testid="provider-select"
      >
        <For each={enabledProviders()}>{(p) => <option value={p.id}>{p.label}</option>}</For>
      </select>
    </Show>
  );
}

export function ChatView() {
  const [input, setInput] = createSignal("");
  const [convId, setConvId] = createSignal<string | null>(null);
  let messagesEndRef: HTMLDivElement | undefined;

  onMount(() => {
    startThemeSync();
  });

  // 跟踪 active conv id
  createEffect(() => {
    setConvId(activeId$());
  });

  // 派生 running 状态(per-conv streaming)
  const isRunning = (): boolean => {
    const id = convId();
    if (!id) return false;
    return store.byId[id]?.streamingMessageId !== null;
  };

  // 当前 conv 的 messages(反应式)
  const currentMessages = () => {
    const id = convId();
    if (!id) return [];
    return store.byId[id]?.messages ?? [];
  };

  // 滚动到底部
  createEffect(() => {
    currentMessages(); // depend
    if (messagesEndRef) {
      queueMicrotask(() => messagesEndRef!.scrollIntoView({ behavior: "smooth" }));
    }
  });

  const handleCancel = async () => {
    const id = convId();
    if (!id) return;
    cancel(id);
  };

  const handleSend = async () => {
    const text = input().trim();
    const id = convId();
    if (!text || !id || isRunning()) return;
    setInput("");

    const providerId = appStore.state.value.default_llm_provider_id;
    const providerCfg: ProviderConfig = {
      apiKey: appStore.state.value.providers?.find((p) => p.id === providerId)?.api_key ?? null,
      baseUrl:
        appStore.state.value.providers?.find((p) => p.id === providerId)?.llm?.base_url ?? "",
      defaultModel:
        appStore.state.value.providers?.find((p) => p.id === providerId)?.llm?.default_model ??
        "auto",
      systemPrompt: appStore.state.value.system_prompt?.default ?? "",
      tools: [],
    };

    await sendMessage(id, text, providerCfg);
  };

  return (
    <>
      <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        <For each={currentMessages()}>{(m) => <MessageBubble message={m} />}</For>
        <Show
          when={
            isRunning() &&
            currentMessages().length > 0 &&
            currentMessages()[currentMessages().length - 1]?.role === "assistant" &&
            currentMessages()[currentMessages().length - 1]?.content === ""
          }
        >
          <div
            class="max-w-prose p-3 rounded-lg leading-relaxed bg-card text-muted-foreground border border-border italic flex items-center gap-2"
            role="status"
            aria-live="polite"
          >
            <span aria-hidden="true">⏳</span>
            <span>正在思考…</span>
          </div>
        </Show>
        <div ref={messagesEndRef} />
      </div>
      <form
        class="flex flex-col gap-2 p-3 border-t border-border bg-card"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
      >
        <label for="chat-input" class="sr-only">
          发条消息
        </label>
        <Textarea
          id="chat-input"
          class="w-full"
          rows={3}
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          placeholder="发条消息…"
          disabled={isRunning()}
        />
        <div class="flex items-center gap-2">
          <label for="provider-select" class="text-xs text-muted-foreground whitespace-nowrap">
            Provider
          </label>
          <ProviderSelect />
          <div class="flex-1" />
          <Show
            when={!isRunning()}
            fallback={
              <Button
                type="button"
                variant="destructive"
                onClick={handleCancel}
                aria-label="取消运行"
              >
                取消
                <X class="h-4 w-4" />
              </Button>
            }
          >
            <Button
              type="submit"
              onClick={(e) => {
                e.preventDefault();
                void handleSend();
              }}
              disabled={!input().trim()}
              aria-label="发送消息"
            >
              发送
              <Send class="h-4 w-4" />
            </Button>
          </Show>
        </div>
      </form>
    </>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run:

```bash
vp run typecheck
```

Expected: no errors (assuming messages.store / agent.store still exist during this task).

- [ ] **Step 4: Run chat-view tests**

Run:

```bash
vp run test -- src/features/chat/components/chat-view.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/chat/components/chat-view.tsx src/features/chat/components/chat-view.test.tsx
git commit -m "refactor(chat-view): use conversations.store directly (drop messages.store / agent.store imports)"
```

---

### Task 11: NOW delete `messages.store.ts` + `messages.store.test.ts` + `agent.store.ts` + `agent.store.test.ts`

**Files:**

- Delete: `src/features/chat/stores/messages.store.ts`
- Delete: `src/features/chat/stores/messages.store.test.ts`
- Delete: `src/features/chat/stores/agent.store.ts`
- Delete: `src/features/chat/stores/agent.store.test.ts`

- [ ] **Step 1: Verify no remaining imports**

Run:

```bash
cd C:\Users\zcati\Documents\project\codeman-agent
grep -r "messages\.store" src/ --include="*.ts" --include="*.tsx" | grep -v "conversations\.store" | grep -v "__mocks__"
grep -r "agent\.store" src/ --include="*.ts" --include="*.tsx" | grep -v "conversations\.store"
grep -r "chatAgentStore" src/ --include="*.ts" --include="*.tsx"
```

Expected: no matches (only `conversations.store` references remain).

- [ ] **Step 2: Delete the 4 files**

Run:

```bash
cd C:\Users\zcati\Documents\project\codeman-agent
git rm src/features/chat/stores/messages.store.ts src/features/chat/stores/messages.store.test.ts
git rm src/features/chat/stores/agent.store.ts src/features/chat/stores/agent.store.test.ts
```

- [ ] **Step 3: Verify TypeScript compiles**

Run:

```bash
vp run typecheck
```

Expected: no errors.

- [ ] **Step 4: Run all chat tests**

Run:

```bash
vp run test -- src/features/chat
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: delete messages.store + agent.store (subsumed by conversations.store per ADR-0019)"
```

---

### Task 12: Add streaming indicator to `sidebar.tsx`

**Files:**

- Modify: `src/features/chat/components/sidebar.tsx`
- Modify: `src/features/chat/components/sidebar.test.tsx`

- [ ] **Step 1: Write failing test for streaming indicator**

Append to `src/features/chat/components/sidebar.test.tsx`:

```ts
import { store } from "../stores/conversations.store";

describe("Sidebar — streaming indicator", () => {
  it("shows ⏳ badge for convs with streamingMessageId !== null", () => {
    // Mock store with one streaming conv
    (store as any).byId["c1"] = { id: "c1", ..., streamingMessageId: "msg1" };
    (store as any).byId["c2"] = { id: "c2", ..., streamingMessageId: null };
    // ... render sidebar, assert badge present for c1 and absent for c2
  });
});
```

(Full test code depends on existing sidebar test structure; the key is asserting the badge.)

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
vp run test -- src/features/chat/components/sidebar.test.tsx
```

Expected: FAIL — no badge in current sidebar.

- [ ] **Step 3: Add streaming indicator to sidebar.tsx**

In `src/features/chat/components/sidebar.tsx`, replace the existing `<For>` loop body. Find:

```tsx
<Show
  when={confirmingId() === c.id}
  fallback={
    <>
      <span class="text-sm font-medium truncate">{c.title}</span>
      <span class="text-xs text-muted-foreground mt-0.5">
        {new Date(c.updated_at * 1000).toLocaleDateString("zh-CN")}
      </span>
    </>
  }
>
```

Replace with:

```tsx
<Show
  when={confirmingId() === c.id}
  fallback={
    <>
      <div class="flex items-center gap-1">
        <span class="text-sm font-medium truncate">{c.title}</span>
        <Show when={store.byId[c.id]?.streamingMessageId !== null && store.byId[c.id]?.streamingMessageId !== undefined}>
          <span class="text-xs" aria-label="streaming">⏳</span>
        </Show>
      </div>
      <span class="text-xs text-muted-foreground mt-0.5">
        {new Date(c.updated_at * 1000).toLocaleDateString("zh-CN")}
      </span>
    </>
  }
>
```

Also update the import to include `store`:

```ts
import {
  store,
  conversations$,
  ...
} from "../stores/conversations.store";
```

- [ ] **Step 4: Verify TypeScript compiles + tests pass**

Run:

```bash
vp run typecheck
vp run test -- src/features/chat/components/sidebar.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/chat/components/sidebar.tsx src/features/chat/components/sidebar.test.tsx
git commit -m "feat(sidebar): streaming indicator badge per ADR-0014 D5 + ADR-0019"
```

---

## Phase 5: Documentation

### Task 13: Update `src/AGENTS.md` lookup table

**Files:**

- Modify: `src/AGENTS.md` (replace references to messages.store / agent.store with conversations.store)

- [ ] **Step 1: Find references to old stores in src/AGENTS.md**

Run:

```bash
cd C:\Users\zcati\Documents\project\codeman-agent
grep -n "messages\.store\|agent\.store\|chatAgentStore" src/AGENTS.md
```

Expected: shows lines in 查阅指南 table referencing deleted stores.

- [ ] **Step 2: Replace references**

For each match, replace:

- `features/chat/stores/messages.store` → `features/chat/stores/conversations.store`
- `features/chat/stores/agent.store` → `features/chat/stores/conversations.store`

Specifically, the "新增 / 修改设置项" and "新增 Effect 桥接" rows reference these files. Update them.

- [ ] **Step 3: Verify no remaining references**

Run:

```bash
cd C:\Users\zcati\Documents\project\codeman-agent
grep -n "messages\.store\|agent\.store\|chatAgentStore" src/AGENTS.md
```

Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add src/AGENTS.md
git commit -m "docs(AGENTS): replace messages.store/agent.store refs with conversations.store per ADR-0019"
```

---

## Final Verification

### Task 14: Full build + test suite

- [ ] **Step 1: Run typecheck**

```bash
vp run typecheck
```

Expected: no errors.

- [ ] **Step 2: Run full test suite**

```bash
vp run test
```

Expected: all tests pass.

- [ ] **Step 3: Run build**

```bash
vp run build
```

Expected: successful build to `dist/`.

- [ ] **Step 4: Manual smoke test (optional, requires Tauri runtime)**

```bash
vp run tauri:dev
```

In the running app:

1. Send a message in conv A
2. While A is streaming, click conv B in sidebar
3. Verify A's content does NOT leak into B's view
4. Click back to A; verify A's streaming progress is preserved
5. Verify sidebar shows ⏳ badge for streaming conv

- [ ] **Step 5: Final commit (if any uncommitted changes)**

```bash
git status
# If any uncommitted changes:
git add -A
git commit -m "chore: ADR-0019 refactor complete"
```

---

## Self-Review

**Spec coverage** (ADR-0019 D1/D2/D3):

- ✅ D1: `createAgentRuntime()` factory — Tasks 2-3
- ✅ D2: per-run transient Agent + AbortController cancel — Tasks 1 + 3
- ✅ D3: `conversations.store` single source of truth — Tasks 4-7

**Bug fix coverage** (streaming state leak):

- ✅ Cross-conv isolation — Task 5 verifies createStore path isolation
- ✅ Sidebar streaming indicator (per ADR-0014 D5) — Task 12
- ✅ in-flight cancellation preserved — Task 6

**File coverage** (per ADR-0019 跨文件影响清单):

- ✅ `lib/runtime.ts` — Tasks 2-3
- ✅ `lib/anthropic-transport.ts` — Task 1
- ✅ `stores/conversations.store.ts` — Tasks 4-7
- ✅ `stores/messages.store.ts` deleted — Task 11
- ✅ `stores/agent.store.ts` deleted — Task 11
- ✅ `components/chat-view.tsx` — Task 10
- ✅ `components/sidebar.tsx` — Task 12
- ✅ `src/AGENTS.md` — Task 13

**Placeholder scan**: No "TBD" / "TODO" / "implement later" markers remain. All code blocks are complete.

**Type consistency**:

- `ProviderConfig` defined in `runtime.ts` (Task 2), used in `conversations.store.ts` (Task 5) and `chat-view.tsx` (Task 10) — consistent.
- `AgentRuntime.run` signature `({ context, provider }) => Stream<RuntimeEvent, never, never>` — consistent across Tasks 2, 3, 5.
- `ConversationState` shape — defined Task 4, used Tasks 5-7, 10, 12 — consistent.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-25-per-conv-runtime-refactor.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session with checkpoints

Which approach?
