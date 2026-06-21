//! chatAgentStore 单元测试 (V1.8+ ADR-0016 D6)
//!
//! 范围:
//! 1. **桥接契约** — chatAgentStore.startRun / cancel / destroy 是 AgentRuntime
//!    的薄包装,负责 bake Layer 并返回 caller 拿起来就能用的 Stream / Effect。
//! 2. **透传语义** — (conv, msg) 透传到 runtime.run,convId 透传到 cancel / destroy。
//! 3. **副作用隔离** — cancel 不会触发 destroy (反之亦然); destroy 不会跑 run。
//!
//! **不测的:**
//! - 业务行为 (token 流、tool dispatch、history feed、AbortController 集成):
//!   在 lib/runtime.test.ts 已经覆盖。
//! - Layer merge 的具体 shape: 这是 runtime.ts 的内部实现, store 关心的是
//!   "caller 不需要 provide 任何 service" 的结果。
//!
//! **测试策略:**
//! 用 vi.mock("../lib/runtime") + Context.GenericTag 替身 AgentRuntime,
//! Layer.succeed 绑到 mock 实现。这样 startRun 的 "Effect.runSync + Layer
//! provide" 路径真在跑, 但 pi-agent / SettingsService 等重依赖不进栈。

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Chunk, Effect, Stream, Layer, Context, Exit } from "effect";
import type { Conversation, Message } from "../../../shared/lib/types";
import { chatAgentStore } from "./agent.store";

// ——— Runtime test double (ADR-0016 D6 layer-baking pattern) ——————
//
// vi.hoisted 在 import 解析前跑, 这里只能放纯数据, 不能放需要顶层 import
// 的运行时构造 (e.g. Stream / Context.GenericTag)。所以 nextStream 的真实
// 构建放在 test body 里; 这里只跟踪调用, 加 reset 钩子。

interface RunCall {
  conv: Conversation;
  msg: Message;
}

const state = vi.hoisted(() => ({
  runCalls: [] as RunCall[],
  cancelCalls: [] as string[],
  destroyCalls: [] as string[],
  // 控制 run() 返回什么 stream; null = 默认空流 (不会 emit 任何 event,
  // 适合不消费 stream 的纯"调用已发生"断言)。
  nextStream: null as Stream.Stream<unknown, unknown, unknown> | null,
}));

// 全新 Context.Tag: store 烘穿 Layer 时拿的是被 mock 的 "AgentRuntime" 符号,
// 而 mock 返回的 AgentRuntime 指向这个 GenericTag, yield* AgentRuntime 在
// store 的 startRunEffect 里能 resolve 到这个 tag 的服务实现。
// **必须** 写在 vi.mock factory 内部 — factory 会被 hoist 到 import 之前,
// 模块级 const 还没初始化, 在 factory 里访问会 ReferenceError。
vi.mock("../lib/runtime", () => {
  const MockAgentRuntime = Context.GenericTag("MockAgentRuntime");
  return {
    AgentRuntime: MockAgentRuntime,
    AgentRuntimeLive: Layer.succeed(MockAgentRuntime, {
      run: (conv: Conversation, msg: Message) => {
        state.runCalls.push({ conv, msg });
        return (state.nextStream ?? Stream.empty) as Stream.Stream<unknown, unknown, unknown>;
      },
      cancel: (convId: string) => {
        state.cancelCalls.push(convId);
        return Effect.succeed(undefined);
      },
      destroy: (convId: string) => {
        state.destroyCalls.push(convId);
        return Effect.succeed(undefined);
      },
    } as never),
    RuntimeDeps: Layer.empty,
    RuntimeError: class RuntimeError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "RuntimeError";
      }
    },
  };
});

// ——— Fixtures ———————————————————————

const conv: Conversation = {
  id: "conv-1",
  title: "Test",
  system_prompt: null,
  created_at: 1000,
  updated_at: 1000,
  archived_at: null,
};

const userMsg: Message = {
  id: "msg-1",
  conversation_id: "conv-1",
  role: "user",
  content: "hello",
  tool_calls: null,
  tool_results: null,
  model: null,
  input_tokens: null,
  output_tokens: null,
  created_at: 1000,
};

// ——— Reset ———————————————————————

beforeEach(() => {
  state.runCalls = [];
  state.cancelCalls = [];
  state.destroyCalls = [];
  state.nextStream = null;
});

// —————————————————————————————————————————————————————————————————————
// API surface
// —————————————————————————————————————————————————————————————————————

describe("chatAgentStore API surface", () => {
  it("startRun / cancel / destroy 都是函数", () => {
    expect(typeof chatAgentStore.startRun).toBe("function");
    expect(typeof chatAgentStore.cancel).toBe("function");
    expect(typeof chatAgentStore.destroy).toBe("function");
  });

  it("startRun 接受 2 个参数 (conversation, userMessage), cancel / destroy 各 1 个", () => {
    // Function.length 反映声明形参个数, 守住"调用契约"—
    // 防止有人改成 startRun(conv) 漏传 msg, 或 cancel() 漏 convId。
    expect(chatAgentStore.startRun.length).toBe(2);
    expect(chatAgentStore.cancel.length).toBe(1);
    expect(chatAgentStore.destroy.length).toBe(1);
  });

  it("调用三个方法本身不抛 (Layer 烘穿成功, 不依赖 caller 的 context)", () => {
    // startRun 内部用 Effect.runSync; 烘穿失败会 throw "Service not found"。
    // 这条断言守的是"模块加载后, store 是 ready-to-use 的, 不需要再 provide"。
    expect(() => chatAgentStore.startRun(conv, userMsg)).not.toThrow();
    expect(() => chatAgentStore.cancel("conv-1")).not.toThrow();
    expect(() => chatAgentStore.destroy("conv-1")).not.toThrow();
  });
});

// —————————————————————————————————————————————————————————————————————
// startRun: 透传 + Layer 烘穿 + stream 透传
// —————————————————————————————————————————————————————————————————————

describe("chatAgentStore.startRun", () => {
  it("调 runtime.run 并把 (conv, msg) 透传", () => {
    // startRun 同步烘穿 stream (Effect.runSync), 所以调用后 runCalls 立刻可读。
    chatAgentStore.startRun(conv, userMsg);

    expect(state.runCalls).toHaveLength(1);
    expect(state.runCalls[0].conv).toBe(conv);
    expect(state.runCalls[0].msg).toBe(userMsg);
  });

  it("多次 startRun 互不污染 (每次都新调 runtime.run)", () => {
    chatAgentStore.startRun(conv, userMsg);
    chatAgentStore.startRun(conv, userMsg);
    chatAgentStore.startRun(conv, userMsg);

    expect(state.runCalls).toHaveLength(3);
    for (const call of state.runCalls) {
      expect(call.conv).toBe(conv);
      expect(call.msg).toBe(userMsg);
    }
  });

  it("startRun 不触发 cancel / destroy (避免 store 误清 Agent 实例)", () => {
    chatAgentStore.startRun(conv, userMsg);
    expect(state.cancelCalls).toHaveLength(0);
    expect(state.destroyCalls).toHaveLength(0);
  });

  it("产出的 stream 透传 RuntimeEvent (token / tool_call / done)", async () => {
    // 模拟 pi-agent loop 真实产出的事件序列。
    state.nextStream = Stream.fromIterable([
      { type: "token", content: "Hello" },
      {
        type: "tool_call",
        toolCall: { id: "tc-1", name: "get_balance", args: { provider_id: "deepseek" } },
      },
      {
        type: "done",
        message: { ...userMsg, id: "msg-final", role: "assistant", content: "Hello world" },
      },
    ]);

    const stream = chatAgentStore.startRun(conv, userMsg);
    // Stream.toArray 收成数组, 这是 chat-view 用 Stream.runForEach + handler
    // 的等价物: 串行 emit 每个 event, 不丢不漏。
    const chunk = await Effect.runPromise(
      Stream.runCollect(stream as Stream.Stream<any, any, never>),
    );
    const events = Chunk.toArray(chunk);

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: "token", content: "Hello" });
    expect(events[1]).toEqual({
      type: "tool_call",
      toolCall: { id: "tc-1", name: "get_balance", args: { provider_id: "deepseek" } },
    });
    expect(events[2].type).toBe("done");
  });

  it("产出的 stream 不需要 caller 提供 R (Layer 烘穿成功 — 核心契约)", async () => {
    // **ADR-0016 D6 关键契约**:
    // 组件 (chat-view) 不 import AgentRuntime / SettingsService,
    // 它直接 Stream.runForEach(chatAgentStore.startRun(...), handler)。
    // 如果 store 没烘穿好 (e.g. 漏掉 Stream.provideLayer), stream 的 R
    // 仍含 SettingsService | MessageService, 消费时 R 缺失会 fail。
    //
    // 这里 Stream.toArray **不带任何 .provide**, 直接 runPromise;
    // 成功 = 烘穿成功。
    state.nextStream = Stream.fromIterable([{ type: "token", content: "ok" }]);

    const stream = chatAgentStore.startRun(conv, userMsg);
    const exit = await Effect.runPromiseExit(
      Stream.runCollect(stream as Stream.Stream<any, any, never>),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it("runtime.run 返回失败 stream 时, 错误透传出来 (store 不吞错)", async () => {
    // 上游 (e.g. 401 Unauthorized) 抛 AppError, store 必须让消费方看到。
    // 这是 chat-view 区分"网络挂了"和"流式完了"的依据。
    state.nextStream = Stream.fail({ kind: "Network", message: "upstream blew up" });

    const stream = chatAgentStore.startRun(conv, userMsg);
    const exit = await Effect.runPromiseExit(
      Stream.runCollect(stream as Stream.Stream<any, any, never>),
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });
});

// —————————————————————————————————————————————————————————————————————
// cancel: 透传 + 副作用隔离
// —————————————————————————————————————————————————————————————————————

describe("chatAgentStore.cancel", () => {
  it("用 convId 调 runtime.cancel", async () => {
    await Effect.runPromise(chatAgentStore.cancel("conv-42"));

    expect(state.cancelCalls).toEqual(["conv-42"]);
    // **不**应触发 destroy / run
    expect(state.destroyCalls).toHaveLength(0);
    expect(state.runCalls).toHaveLength(0);
  });

  it("多次 cancel 同一 convId 都能跑通 (幂等 — ADR-0014 D6 no-op 契约)", async () => {
    // runtime.cancel 对不存在的 convId 静默 no-op; store 这层不抦,
    // 调用方 (chat-view) 可能在没有 Agent 的 conv 上调 (race 窗口),
    // 不能 throw, 不能 crash。
    await Effect.runPromise(chatAgentStore.cancel("conv-1"));
    await Effect.runPromise(chatAgentStore.cancel("conv-1"));

    expect(state.cancelCalls).toEqual(["conv-1", "conv-1"]);
  });

  it("cancel 之后能再 destroy, 再 cancel 仍工作 (没有 state 副作用)", async () => {
    // 模拟 chat-view 的"取消"按钮 + sidebar 后续的"删除"动作。
    // store 内部不能用全局 state 跟踪 cancel 状态, 否则第二次 cancel
    // 会因为没有 Agent 实例而 crash。
    await Effect.runPromise(chatAgentStore.cancel("conv-1"));
    await Effect.runPromise(chatAgentStore.destroy("conv-1"));
    await Effect.runPromise(chatAgentStore.cancel("conv-1"));

    expect(state.cancelCalls).toEqual(["conv-1", "conv-1"]);
    expect(state.destroyCalls).toEqual(["conv-1"]);
  });
});

// —————————————————————————————————————————————————————————————————————
// destroy: 透传 + 跟 cancel 走不同 runtime 方法
// —————————————————————————————————————————————————————————————————————

describe("chatAgentStore.destroy", () => {
  it("用 convId 调 runtime.destroy", async () => {
    await Effect.runPromise(chatAgentStore.destroy("conv-99"));

    expect(state.destroyCalls).toEqual(["conv-99"]);
    expect(state.cancelCalls).toHaveLength(0);
    expect(state.runCalls).toHaveLength(0);
  });

  it("destroy 跟 cancel 走不同的 runtime 方法 (D7 调用顺序由 caller 负责, store 不预判)", async () => {
    // **D7 关键不变量**: archive / delete store 入口在 conversations.ts 里
    // 显式编排 cancel → destroy → svc.X。store 这里**不**自动 cancel,
    // 否则调用方再 cancel 一次 = abort 一个已 destroy 的 Agent 实例,
    // 行为不可预测, 也违反"store 是薄包装"的设计。
    await Effect.runPromise(chatAgentStore.destroy("conv-x"));

    expect(state.destroyCalls).toEqual(["conv-x"]);
    expect(state.cancelCalls).toEqual([]); // 没自动调 cancel
  });
});
