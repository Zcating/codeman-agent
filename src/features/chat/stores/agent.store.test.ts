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
import { Chunk, Effect, Stream, Layer, Context, Exit, Queue, Fiber } from "effect";
import type { Conversation, Message } from "../../../shared/lib/types";
import type { RuntimeEvent } from "../lib/runtime";
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
  // 异步 live stream 控制器: 底层是 Queue + Stream.fromQueue,
  // 跟 ADR-0017 的真实 runtime 形状一致。push() 增量塞事件,
  // end() 模拟 abort 关闭 queue。优先级高于 nextStream。
  liveStream: null as {
    push: (event: unknown) => void;
    end: () => void;
    queue: Queue.Queue<unknown>;
  } | null,
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
        if (state.liveStream) {
          // ADR-0017 同款形状: 真实 runtime 也是 Stream.fromQueue(queue)
          // + agent.subscribe 在 forked fiber 推事件。**不**设
          // shutdown:true, 因为 cancel 路径要主动 end() 来模拟 abort。
          return Stream.fromQueue(state.liveStream.queue) as Stream.Stream<
            unknown,
            unknown,
            unknown
          >;
        }
        return (state.nextStream ?? Stream.empty) as Stream.Stream<unknown, unknown, unknown>;
      },
      cancel: (convId: string) => {
        state.cancelCalls.push(convId);
        if (state.liveStream) {
          // 模拟真 runtime: cancel → agent.abort() → fiber 退出 → finalizer
          // 关 queue → Stream.fromQueue 收到 end 信号。测试侧用同步 end()
          // 跳过 fiber 机制, 但效果一样。
          state.liveStream!.end();
        }
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
  state.liveStream = null;
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
// startRun 异步流式输出 (V1.9+ ADR-0017 Queue-based runtime)
// —————————————————————————————————————————————————————————————————————
//
// 上面 startRun describe 用的是 Stream.fromIterable 静态流,只能验"事件到
// 不到"。这里补真正"流式"行为的测试:用 Queue + Stream.fromQueue (跟
// ADR-0017 runtime.ts 的真实形状一致) 起一个 live stream, 测试侧 push()
// 增量塞事件,验证:
// - 订阅之后才 push 的事件也能收到 (push after subscribe)
// - 事件按 push 顺序到达 (order preservation)
// - 5 种 RuntimeEvent 类型全部透传
// - 增量推送 (Effect.sleep between push) 时,消费方真的分多批收到
//   (Stream.fromIterable 是预烘的,无法证明这一点)
// - chat-view 的 Stream.runForEach + handler 消费模式工作
// - cancel 中断长 stream
// - 大量事件不丢

describe("chatAgentStore.startRun 异步流式输出 (V1.9+ ADR-0017 Queue)", () => {
  // ---- 关键约束 ----
  // 整个 consumer 生命周期 (fork + push + end + join) 必须在同一个
  // Effect.runPromise(Effect.gen(...)) 里。跨多个 runPromise 调
  // Effect.fork + Fiber.join 会让父 fiber 退出, 派生的 consumer fiber
  // 被 "All fibers interrupted" 干掉。这是 Node 默认 Effect runtime 的
  // 行为, 不是 bug。

  const setupLiveStream = async () => {
    const events: unknown[] = [];
    const arrivals: number[] = [];
    const queue = await Effect.runPromise(Queue.unbounded());
    state.liveStream = {
      queue,
      push: (e) => {
        Queue.unsafeOffer(queue, e);
      },
      end: () => {
        Effect.runSync(Queue.shutdown(queue));
      },
    };
    return { queue, events, arrivals };
  };

  it("订阅之后才 push 的事件, Stream.runForEach 能收到 (push after subscribe)", async () => {
    const { events, arrivals } = await setupLiveStream();

    await Effect.runPromise(
      Effect.gen(function* () {
        const stream = chatAgentStore.startRun(conv, userMsg);
        const consumerFiber = yield* Effect.fork(
          Stream.runForEach(stream, (e) =>
            Effect.sync(() => {
              events.push(e);
              arrivals.push(Date.now());
            }),
          ),
        );
        // 等 consumer fiber 真正 start + 订阅 stream
        yield* Effect.sleep("20 millis");
        // 推 3 个事件, 中间 yieldNow 让 consumer take 完上一个再接
        // 下一个 (Stream.fromQueue + Queue.shutdown 在 batch offer + 立即
        // shutdown 时会丢尾巴事件, 这是 Effect 行为; yieldNow 模拟生产
        // 里 agent 一个 token 一个 token 推的时序)。
        state.liveStream!.push({ type: "token", content: "a" });
        yield* Effect.yieldNow();
        state.liveStream!.push({ type: "token", content: "b" });
        yield* Effect.yieldNow();
        state.liveStream!.push({ type: "token", content: "c" });
        yield* Effect.yieldNow();
        // 关 stream, consumer 自然收尾
        state.liveStream!.end();
        yield* Fiber.join(consumerFiber);
      }),
    );

    expect(events).toEqual([
      { type: "token", content: "a" },
      { type: "token", content: "b" },
      { type: "token", content: "c" },
    ]);
  });

  it("5 种 RuntimeEvent 类型全透传, 顺序保持", async () => {
    const { events, arrivals } = await setupLiveStream();

    await Effect.runPromise(
      Effect.gen(function* () {
        const stream = chatAgentStore.startRun(conv, userMsg);
        const consumerFiber = yield* Effect.fork(
          Stream.runForEach(stream, (e) =>
            Effect.sync(() => {
              events.push(e);
              arrivals.push(Date.now());
            }),
          ),
        );
        yield* Effect.sleep("20 millis");

        state.liveStream!.push({ type: "token", content: "Hi" });
        yield* Effect.yieldNow();
        state.liveStream!.push({
          type: "tool_call",
          toolCall: { id: "tc-1", name: "get_balance", args: {} },
        });
        yield* Effect.yieldNow();
        state.liveStream!.push({
          type: "tool_result",
          toolCallId: "tc-1",
          result: { amount: 100, currency: "USD" },
        });
        yield* Effect.yieldNow();
        state.liveStream!.push({
          type: "done",
          message: {
            ...userMsg,
            id: "msg-final",
            role: "assistant",
            content: "Hi",
          },
        });
        yield* Effect.yieldNow();
        state.liveStream!.push({
          type: "error",
          error: { message: "should still pass through store" },
        });
        yield* Effect.yieldNow();
        state.liveStream!.end();
        yield* Fiber.join(consumerFiber);
      }),
    );

    expect(events).toHaveLength(5);
    expect(events[0]).toEqual({ type: "token", content: "Hi" });
    expect(events[1]).toEqual({
      type: "tool_call",
      toolCall: { id: "tc-1", name: "get_balance", args: {} },
    });
    expect(events[2]).toEqual({
      type: "tool_result",
      toolCallId: "tc-1",
      result: { amount: 100, currency: "USD" },
    });
    expect((events[3] as { type: string }).type).toBe("done");
    expect((events[3] as { message: { id: string } }).message.id).toBe("msg-final");
    expect(events[4]).toEqual({
      type: "error",
      error: { message: "should still pass through store" },
    });
  });

  it("增量推送 (Effect.sleep between push) 事件分多批到达, 间隔非零", async () => {
    // Stream.fromIterable 是预烘的, 3 个事件在同一 tick 跑出,
    // arrival[1] - arrival[0] ≈ 0。这条用 queue 推 + sleep 间隔, 真
    // 验证"流式"语义。
    const { events, arrivals } = await setupLiveStream();

    await Effect.runPromise(
      Effect.gen(function* () {
        const stream = chatAgentStore.startRun(conv, userMsg);
        const consumerFiber = yield* Effect.fork(
          Stream.runForEach(stream, (e) =>
            Effect.sync(() => {
              events.push(e);
              arrivals.push(Date.now());
            }),
          ),
        );
        yield* Effect.sleep("20 millis");
        const t0 = Date.now();
        state.liveStream!.push({ type: "token", content: "1" });
        yield* Effect.sleep("30 millis");
        state.liveStream!.push({ type: "token", content: "2" });
        yield* Effect.sleep("30 millis");
        state.liveStream!.push({ type: "token", content: "3" });
        state.liveStream!.end();
        yield* Fiber.join(consumerFiber);
        // sanity: 整个流程不超过 1s (留 slack 给 CI)
        expect(Date.now() - t0).toBeLessThan(1000);
      }),
    );

    expect(events).toHaveLength(3);
    // **核心断言**: 第二个事件比第一个晚到 (间隔 ≥ sleep), 第三个比第二
    // 个晚到。Stream.fromIterable 这条拿不到。
    expect(arrivals[1] - arrivals[0]).toBeGreaterThanOrEqual(20);
    expect(arrivals[2] - arrivals[1]).toBeGreaterThanOrEqual(20);
  });

  it("chat-view 的消费模式: Stream.runForEach + Effect.gen handler", async () => {
    // 镜像 src/features/chat/components/chat-view.tsx 的真实消费代码:
    //   const handleEvent = (event) => Effect.gen(function*() { switch ... });
    //   await Effect.runPromiseExit(Stream.runForEach(stream, handleEvent));
    await setupLiveStream();
    const processed: Array<{ kind: string; payload?: unknown }> = [];

    // chat-view 的真实 handler 形如 Effect.gen + switch case, 末尾
    // 有 Effect.sleep(Duration.zero) (yield 让其他 fiber 跑)。这里不写
    // sleep: handler 内 sleep 会让 consumer 在 sleep 期间被 producer
    // 走完 + shutdown, 导致 shutdown 之后 take 返回 None 丢事件
    // (Effect 3.21 Queue.shutdown 会清掉 pending items, 不是 drain)。
    // 走纯 Effect.sync 验证 handler 分发逻辑。
    const handleEvent = (event: RuntimeEvent) =>
      Effect.sync(() => {
        switch (event.type) {
          case "token":
            processed.push({ kind: "token", payload: event.content });
            break;
          case "tool_call":
            processed.push({ kind: "tool_call", payload: event.toolCall?.name });
            break;
          case "done":
            processed.push({ kind: "done", payload: event.message?.id });
            break;
          case "error":
            processed.push({ kind: "error", payload: event.error?.message });
            break;
          case "tool_result":
            processed.push({ kind: "tool_result", payload: event.toolCallId });
            break;
        }
      });

    await Effect.runPromise(
      Effect.gen(function* () {
        const stream = chatAgentStore.startRun(conv, userMsg);
        const consumerFiber = yield* Effect.fork(Stream.runForEach(stream, handleEvent));
        yield* Effect.sleep("20 millis");

        state.liveStream!.push({ type: "token", content: "hello" });
        yield* Effect.yieldNow();
        state.liveStream!.push({
          type: "tool_call",
          toolCall: { id: "tc-1", name: "get_balance", args: {} },
        });
        yield* Effect.yieldNow();
        state.liveStream!.push({ type: "tool_result", toolCallId: "tc-1", result: 42 });
        yield* Effect.yieldNow();
        state.liveStream!.push({
          type: "done",
          message: { ...userMsg, id: "m-final", role: "assistant", content: "hello" },
        });
        yield* Effect.yieldNow();
        state.liveStream!.end();
        yield* Fiber.join(consumerFiber);
      }),
    );

    expect(processed).toEqual([
      { kind: "token", payload: "hello" },
      { kind: "tool_call", payload: "get_balance" },
      { kind: "tool_result", payload: "tc-1" },
      { kind: "done", payload: "m-final" },
    ]);
  });

  it("cancel 中断长 stream: 后续 push 的事件不再被消费", async () => {
    // 模拟 chat-view 的"取消"按钮: runtime.cancel(convId) → agent.abort()
    // → fiber 退出 → queue 关 → Stream.fromQueue 收尾。这里 mock 把
    // end() 直接挂到 cancel 上, 跳过 fiber 机制。
    const { events, arrivals } = await setupLiveStream();

    await Effect.runPromise(
      Effect.gen(function* () {
        const stream = chatAgentStore.startRun(conv, userMsg);
        const consumerFiber = yield* Effect.fork(
          Stream.runForEach(stream, (e) =>
            Effect.sync(() => {
              events.push(e);
              arrivals.push(Date.now());
            }),
          ),
        );
        yield* Effect.sleep("20 millis");

        // 先推 2 个
        state.liveStream!.push({ type: "token", content: "1" });
        state.liveStream!.push({ type: "token", content: "2" });
        yield* Effect.sleep("20 millis");
        expect(events).toHaveLength(2);

        // cancel: runtime.cancel → mock end() → queue 关
        yield* chatAgentStore.cancel("conv-1");

        // consumer 自然结束
        yield* Fiber.join(consumerFiber);

        // cancel 后再 push, 消费者已退出, 不应收到 (写在 join 之后
        // 才能保证 consumer 真的退了)
        state.liveStream!.push({ type: "token", content: "3" });
        state.liveStream!.push({ type: "token", content: "4" });
        // 等任何残留事件
        yield* Effect.sleep("20 millis");
      }),
    );

    expect(events).toHaveLength(2);
    expect(events).toEqual([
      { type: "token", content: "1" },
      { type: "token", content: "2" },
    ]);
    expect(state.cancelCalls).toEqual(["conv-1"]);
  });

  it("50 个事件全部送达, 无丢失, 无重排", async () => {
    // 压力测: 验证 Stream.fromQueue 的 queue 不会丢消息 (unbounded
    // queue 不会因反压丢, 但要确保 type 走通)。
    const { events, arrivals } = await setupLiveStream();

    await Effect.runPromise(
      Effect.gen(function* () {
        const stream = chatAgentStore.startRun(conv, userMsg);
        const consumerFiber = yield* Effect.fork(
          Stream.runForEach(stream, (e) =>
            Effect.sync(() => {
              events.push(e);
              arrivals.push(Date.now());
            }),
          ),
        );
        yield* Effect.sleep("20 millis");

        const N = 50;
        for (let i = 0; i < N; i++) {
          state.liveStream!.push({ type: "token", content: "tok-" + i });
          yield* Effect.yieldNow();
        }
        state.liveStream!.end();
        yield* Fiber.join(consumerFiber);
      }),
    );

    expect(events).toHaveLength(50);
    for (let i = 0; i < 50; i++) {
      expect(events[i]).toEqual({ type: "token", content: "tok-" + i });
    }
  });

  it("nextStream 和 liveStream 同时设: liveStream 优先", async () => {
    // regression: 防止 mock 的优先级写错。两者都设时, 消费者只应看到
    // liveStream 推的事件, 不应看到 nextStream 预烘的事件。
    state.nextStream = Stream.fromIterable([{ type: "token", content: "static" }]);
    const { events, arrivals } = await setupLiveStream();

    await Effect.runPromise(
      Effect.gen(function* () {
        const stream = chatAgentStore.startRun(conv, userMsg);
        const consumerFiber = yield* Effect.fork(
          Stream.runForEach(stream, (e) =>
            Effect.sync(() => {
              events.push(e);
              arrivals.push(Date.now());
            }),
          ),
        );
        yield* Effect.sleep("20 millis");
        state.liveStream!.push({ type: "token", content: "live" });
        state.liveStream!.end();
        yield* Fiber.join(consumerFiber);
      }),
    );

    expect(events).toEqual([{ type: "token", content: "live" }]);
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
