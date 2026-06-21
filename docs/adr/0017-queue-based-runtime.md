# 0017 — Queue-based Runtime Architecture (replacing Stream.unwrap + type-lie)

**Status**: accepted (V1.9+, 2026-06-21)
**Supersedes**: 部分 ADR-0014（runtime 形状与 inner Stream.unwrap pattern；保留 D1/D2/D4/D7 的 per-conv Agent Map）
**Related**: ADR-0003（Effect-TS 逻辑层）, ADR-0014（Per-Conversation Agent）, ADR-0016（chatAgentStore stream 形状）, runtime.ts, chatAgentStore.ts

## Context

V1.6+ per-conversation Agent runtime（ADR-0014）使用 `Stream.unwrap + Effect.gen + Stream.async` 三层 pattern：

```ts
return Stream.unwrap(
  Effect.gen(function* () {
    const settings = yield* settingsSvc.getSettings();   // ← service closed-over, R = never
    // ...
    const stream = Stream.async<RuntimeEvent, RuntimeError>((emit) => {
      // ...
      agent.subscribe(evt => emit.single(convertEvent(evt)))
      // ...
    });
    return stream;
  }),
);
```

这个 pattern 有一个结构性问题：**type-lie**。`AgentRuntime.run` 的 declared type signature 是 `R = SettingsService | MessageService`（runtime.ts:71），但实际实现用的是 closure-captured services，所以 actual R = `never`。runtime.ts:91-96 注释承认了这个 lie：

> 在 layer 内部 yield SettingsService + ... — 它们的 context 来自 layer 的 R，call site 提供这些 services 后 layer 才会成功 build。得到的 services 通过闭包传给 run()，inner Stream effect 不需要 yield\* 任何 service — 这避免了 "Service not found" 的 issue（之前 yield\* SettingsService 在 inner Stream effect 里找不到，因为 Stream.create 的 context 不从 outer Effect 继承）。

但现实证据（e2e run 2026-06-21 全量 16 spec，9 fail / 7 pass）显示 issue 仍然存在：

```
[page pageerror] (FiberFailure) Error: Service not found: SettingsService 
  (defined at http://localhost:1420/src/shared/lib/tauri.ts:41:68)
    at http://localhost:1420/node_modules/.vite/deps/effect.js?v=4bfb6399:45159:24
    at http://localhost:1420/node_modules/.vite/deps/effect.js?v=4bfb6399:45194:39
```

**关键观察**：

| Spec | 结果 | 模式 |
|---|---|---|
| 04-llm-stream | ✓ pass (8s) | 单 message + 单次 SSE 流，无 tool call |
| 04-theme, 05-bubble, 03-billing | ✓ pass | 不需要 LLM 完成 streaming |
| 05-file-tools ×4, 06-round-trip, 07-mock ×2, 08-mock-file ×2 | ✗ fail (60s timeout) | 多轮交互：tool call → tool result → 下一轮 LLM call |

`pageerror Service not found: SettingsService` 在 spec 02/03/05-bubble 都被抓到，但这些 spec 仍 pass — 说明这个错误**对单 message 流是 non-fatal**。失败的 spec 都是需要**多轮** tool call / round-trip 的，OP_MICRO 在多步路径才 fatal。

**根因假设**：`Stream.provideLayer`（chatAgentStore 1fc33e7 fix 加的）不会完全 propagate 进入 `Stream.unwrap` 的嵌套 effect。`Effect.runSync` 把 stream 在 store 层 material 化时只拿到 outer stream 句柄；当 chat-view 的 `Stream.runForEach` 在 empty context 里 pull 时，inner Effect.gen 试图 yield `SettingsService`（closure-captured 但 TypeScript 推断仍按 declared R = `SettingsService | MessageService`），OP_MICRO 报"Service not found"。

1fc33e7 commit 自己承认这是 partial fix：

> E2E impact: 03-billing-tool: x -> ok ... 05-file-tools / 07-mock-provider / 08-file-tools-mock: still x — these need the LLM to actually respond with text, and the OP_MICRO error still kills the LLM call. Full architectural fix still needed (likely changing runtime to not use Stream.unwrap + yield\* on services in the inner Effect.gen).

## Decision

用 **Queue-based mailbox architecture** 替换 `Stream.unwrap + Stream.async`。Queue 是纯数据（不需要 Context），`Stream.fromQueue` 是 leaf operator（不需要 R），`Stream<R=never>` 在结构上不可能产生 `Service not found` defect。

### D1. Queue 作为事件总线

替换 `Stream.async<RuntimeEvent, RuntimeError>(callback)` → `Stream.fromQueue(queue)`，queue 在 run() 调用时创建。

```ts
const run = (
  conversation: Conversation,
  userMessage: Message,
): Stream.Stream<RuntimeEvent, RuntimeError, never> => {
  return Stream.scoped(
    Effect.gen(function* () {
      const queue = yield* Queue.unbounded<RuntimeEvent>();

      // 获取 / 创建 agent（保留 ADR-0014 D1+D4 的 lazy-create + history feed 逻辑，不变）
      const convId = conversation.id;
      let agent = (yield* Ref.get(agentRef)).get(convId);
      if (!agent) {
        // ... existing lazy-create block, unchanged ...
      }
      agent.appendMessage({ role: "user", content: userMessage.content, timestamp: userMessage.created_at });

      // Fork agent 执行到子 fiber。子 fiber subscribe pi-agent → enqueue event；
      // consumer 从 Stream.fromQueue 拉。两者解耦，stream 不再依赖 agent 的完成。
      const fiber = yield* Effect.fork(
        Effect.gen(function* () {
          const handleAgentEvent = (evt: AgentEvent) => {
            try {
              switch (evt.type) {
                case "message_update": { /* token / tool_call enqueue */ break; }
                case "tool_execution_end": { /* tool_result enqueue */ break; }
                case "agent_end": {
                  // construct done message (existing logic, unchanged)
                  Queue.unsafeOffer(queue, { type: "done", message: doneMessage });
                  break;
                }
                case "agent_start":
                case "turn_start":
                case "turn_end":
                case "tool_execution_start":
                  break; // no equivalent RuntimeEvent
              }
            } catch (e) {
              Queue.unsafeOffer(queue, { type: "error", error: { message: String(e) } });
            }
          };
          const sub = agent.subscribe(handleAgentEvent);

          yield* Effect.tryPromise({
            try: () => agent.prompt(userMessage.content),
            catch: (e) => {
              Queue.unsafeOffer(queue, { type: "error", error: { message: String(e) } });
            },
          }).pipe(Effect.ignore);

          yield* Effect.sync(() => sub());
          yield* Effect.sync(() => Queue.shutdown(queue));  // close queue → Stream.fromQueue ends
        }),
      );

      // Finalizer：consumer cancel → fiber.interrupt()。fetch abort + sub release + queue shutdown。
      yield* Effect.addFinalizer(() => fiber.interrupt());

      return Stream.fromQueue(queue);
    }),
  );
};
```

**Queue 选择：unbounded**。Chat 场景下 agent emit rate < 10 events/s，远低于 backpressure 阈值；consumer 总在 microtask 拉。Unbounded 不会爆内存，代码最少。

### D2. 真实类型签名

`AgentRuntime.run` 的 declared R 从 `SettingsService | MessageService`（type-lie）改为 `never`（truthful）。

```ts
// Before (type-lie, runtime.ts:65-75)
readonly run: (
  conversation: Conversation,
  userMessage: Message,
) => Stream.Stream<RuntimeEvent, AppError | RuntimeError, SettingsService | MessageService>;

// After (truthful)
readonly run: (
  conversation: Conversation,
  userMessage: Message,
) => Stream.Stream<RuntimeEvent, AppError | RuntimeError, never>;
```

### D3. Fork lifecycle = consumer cancel（"我挂你也挂"）

chat-view 的 `Stream.runForEach` 被取消（用户点 Cancel、navigate away、stream fail）→ `Stream.scoped` finalizer 触发 `fiber.interrupt()`：

- 中断 `agent.prompt(...)` 的 Promise（AnthropicTransport 检查 `signal.aborted` 抛 AbortError，runtime.ts:231-233 + anthropic-transport.ts:493-494）
- 释放 `agent.subscribe(...)` subscription
- `Queue.shutdown(queue)` → `Stream.fromQueue` 完成 → consumer 端 Stream.runForEach 收到 Completion

**ADR-0014 D6（"切走 conv 保留 in-flight 流"）降级**：切换 conversation 会 cancel 当前 stream。per-conv Agent 实例和 message history 仍保留在 `agentRef` Map，但 live token 流停止。要恢复流，用户必须重发消息。这跟现有 `chatAgentStore.cancel(convId)` 语义一致（"Cancel 按钮 = 整个流终止"）。

### D4. chatAgentStore 简化

`chatAgentStore.startRun` 不再需要 `Stream.provideLayer` —— runtime.run() 已返回 `R = never`。

```ts
// Before (1fc33e7 fix)
const program = Effect.gen(function* () {
  const runtime = yield* AgentRuntime;
  return Stream.provideLayer(runtime.run(conversation, userMessage), RuntimeDeps);
}).pipe(Effect.provide(fullLayer));
return Effect.runSync(program as Effect.Effect<Stream.Stream<RuntimeEvent, AppError | RuntimeError, never>, never, never>) as Stream.Stream<RuntimeEvent, AppError>;

// After
const program = Effect.gen(function* () {
  const runtime = yield* AgentRuntime;
  return runtime.run(conversation, userMessage);  // R = never
}).pipe(Effect.provide(fullLayer));
return Effect.runSync(program as Effect.Effect<Stream.Stream<RuntimeEvent, AppError | RuntimeError, never>, never, never>) as Stream.Stream<RuntimeEvent, AppError>;
```

`Effect.runSync + fullLayer` 仍保留 —— 它把 stream 在 store 层 materialize（chat-view 不需要 provide AgentRuntime）。`Stream.provideLayer` 调用删除。

## Considered Options

### D1 (queue 类型) 3 选

| 选 | 描述 | 选 / 不选 |
|---|---|---|
| A | Queue.unbounded | 选 — chat 场景 event rate << 内存压力阈值 |
| B | Queue.bounded(1) + sliding | 不选 — 丢中间 token，破坏增量渲染 UX |
| C | Queue.bounded(N) + await-based backpressure | 不选 — agent.subscribe 是 callback 不是 Effect，wrap 复杂 |

### D3 (fork lifecycle) 3 选

| 选 | 描述 | 选 / 不选 |
|---|---|---|
| A | Fiber.interrupt on stream cancel | 选 — 资源确定释放，跟 Cancel 按钮语义契合 |
| B | Detached fiber (own lifecycle) | 不选 — 资源泄漏风险；当前无强需求 |
| C | Hybrid: detached + explicit Cancel hook | 不选 — 两路径维护，复杂度溢出收益 |

### D5 (declared R) 2 选

| 选 | 描述 | 选 / 不选 |
|---|---|---|
| A | `never`（truthful） | 选 — 消除 type-lie，去掉 Stream.provideLayer |
| B | 保留 `SettingsService \| MessageService` lie | 不选 — ADR-0014 doc lied；继续标 "known issue" 是技术债 |

## Consequences

### 正面

- **OP_MICRO service-not-found 结构上不可能**：`Stream<R=never>` 在 consumer context 不需要任何 service；`Queue`、`Ref`、`Effect.fork` 全是 data / leaf API，无 Context 依赖
- **类型系统更诚实**：去掉 runtime.ts:71 的 type-lie；agent.ts:50 的 `Stream.provideLayer` 删除
- **资源 cleanup 确定性**：`Stream.scoped` finalizer 保证 agent fiber 在 consumer cancel 时被 interrupt（fetch abort + sub release + queue shutdown 三步原子）
- **Cancel 单一路径**：chat-view 的 Cancel 按钮 → runtime.cancel → agent.abort（不变）；consumer cancel 自动传播到 agent fetch（via fiber.interrupt）
- **per-conv Agent Map 保留**：ADR-0014 D1+D2+D4+D7（agentRef、lazy create、history feed、archive/delete cleanup）不变
- **chatAgentStore API surface 不变**：3 个方法签名同 ADR-0016 D6

### 负面

- **ADR-0014 D6 弱化**："切 conv 保留 in-flight 流" 不再成立；切走 cancel 当前 stream。Per-conv Agent 实例和 history 仍在 `agentRef`，但 live token 停止。要 resume 用户必须重发。V1.9+ 这个语义跟 Cancel 按钮语义对齐（"显式终止流"），不是产品回归。
- **Queue.shutdown 时序**：如果 `agent.prompt` 在 subscribe 设置好之前 reject（实际不可能：subscribe 同步设，prompt 是 Promise 异步 settle），queue 可能不 shutdown clean。Mitigation：subscribe 总是先设，prompt rejection 路径也调用 `sub() + Queue.shutdown(queue)`。
- **Fiber 开销**：每次 run() fork 一个 fiber。stream 完成时 GC。可忽略。
- **agent.test.ts mock pattern 影响小**：测试用 `vi.mock("../lib/runtime")` mock `AgentRuntime` 整层。新 design 的 `runtime.run` 返回 `Stream<R=never>` 但 mock 是独立的（返回 `Stream.empty` / `Stream.fromIterable`），不影响。

### 不变

- Per-conversation Agent Map（ADR-0014 D1+D2+D4+D7）—— agentRef / lazy create / history feed 全保留
- `agent.cancel / agent.destroy` 语义不变
- chatAgentStore API surface 不变
- RuntimeEvent 5-variant shape 不变
- Tool registry（2 billing + 5 file）不变
- AnthropicTransport SSE 处理不变（line 231-233 的 signal.aborted 检查正好配合 fiber.interrupt 的 abort 链路）

## Timing

- **V1.9+ sprint**：supersede 部分 ADR-0014 的 runtime pattern
- 顺序：ADR + CONTEXT.md 更新 → runtime.ts 重写 → chatAgentStore.startRun 简化 → typecheck → unit tests → e2e 验证

## Verified E2E (post-merge evidence, 2026-06-21)

**实际结果**：`vp run e2e:single` 跑完 16 spec，**7 passed / 9 failed** — **跟 1fc33e7 baseline 完全一样**。

| Spec | baseline (1fc33e7) | Queue refactor (本次) |
|---|---|---|
| 01-app-launch | ✓ | ✓ |
| 02-settings-api-key | ✓ (有 pageerror) | ✓ (有 pageerror) |
| 03-billing-tool | ✓ (有 pageerror) | ✓ (有 pageerror) |
| 04-llm-stream | ✓ | ✓ |
| 04-theme-toggle | ✓ | ✓ |
| 05-chat-message-bubble | ✓ (有 pageerror) | ✓ (有 pageerror) |
| 05-chat-message-bubble-2 | ✓ (有 pageerror) | ✓ (有 pageerror) |
| **05-file-tools ×4** | ✗ timeout 60s | ✗ timeout 60s |
| **06-llm-round-trip** | ✗ waitFor 60s | ✗ waitFor 60s |
| **07-mock-provider ×2** | ✗ waitFor 10-15s | ✗ waitFor 10-15s |
| **08-file-tools-mock ×2** | ✗ 没 mock 响应 | ✗ 没 mock 响应 |

**pageerror `(FiberFailure) Error: Service not found: SettingsService` 仍在 spec 02/03/05-bubble 出现**（出现在 effect.js:45159 — 不是 runtime.ts 的 yield）。

**结论修正**：

1. **Queue refactor 自身技术正确**：`vp run typecheck` 干净、`vp run test` 213 passed（1 skipped）、runtime.ts:71 declared R 从 `SettingsService | MessageService` 改为 `never`（type-lie 消除）、`Stream.provideLayer` 在 chatAgentStore 不再需要。这是结构性改进，独立于 e2e 结果有价值。

2. **OP_MICRO service-not-found 假设被推翻**：ADR 原文假设 root cause 是 `Stream.unwrap + inner Effect.gen` 的 type-lie + `Stream.provideLayer` 不穿透。E2E 证据**反驳**了这个假设 —— 即便 Stream<R=never> 的正确架构落地，pageerror 仍出现，且 9 个失败的 spec 完全不变。

3. **真正的 root cause 在别处**。最可疑的来源（按可能性排序）：
   - **`src/shared/stores/theme.ts:85` 的 `getSettingsBridge()`** —— chat-view `onMount` 调 `startThemeSync` → 每 5s 调一次 → `Effect.runPromise(Effect.gen(...).pipe(Effect.provide(SettingsServiceLive)))`。如果 `Effect.runPromise` 在某些情况不完整 propagate layer，OP_MICRO 可能从这触发。Spec 02 还没 mount chat-view 就报 pageerror，缩窄到 settings.tsx → appStore 路径。
   - **`src/shared/stores/app.store.ts` 早期调用** —— `Effect.runPromiseExit(appStore.refresh())` 在 `index.tsx` mount 时执行（ADR-0016 D4 #6），可能从这触发 OP_MICRO。
   - **其它 store method 的 Effect.runPromiseExit 调用** —— 7 个迁移点中可能有未 bake 完整 layer 的。

4. **下次诊断方向**（不是本次 ADR 的范围）：
   - 加 pageerror stack trace 捕获（在 `effect.js:45159` 处）打印完整 call stack 定位是哪条调用链触发
   - 在 `theme.ts:startThemeSync` 跟 `appStore.refresh` 加 diagnostic console.error
   - 找到真正的 source 后开新 ADR

## 后续 ADR 候选

- **ADR-0018 候选**：`getSettingsBridge` 跟 ADR-0015 的剩余迁移（theme.ts 是 ADR-0016 D4 #7 标记的最后一个 store），加上 `Effect.runPromise` 在 settings 加载阶段的 service-not-found 根因分析。
- 9 个 failing e2e spec 的真实 fix 不在本 ADR 范围，依赖 ADR-0018 / 后续 issue 解决。

## References

- ADR-0003（Effect-TS 逻辑层）—— bridge pattern 保留
- ADR-0014（Per-Conversation Agent）—— D1/D2/D4/D7 保留；D6（in-flight preservation）降级
- ADR-0016（chatAgentStore）—— D6 stream shape 保留；D4 layer baking 简化
- runtime.ts:91-96（type-lie 文档）—— 删除
- runtime.ts:112-358（Stream.unwrap + Stream.async 块）—— 替换为 Stream.scoped + Queue.unbounded + Effect.fork
- anthropic-transport.ts:231-233 / 493-494（signal.aborted 检查）—— 配合 fiber.interrupt 的 abort 链路
- commit 1fc33e7（partial fix）—— 其 `Stream.provideLayer + Effect.runSync` 简化

## CONTEXT.md 更新项

- 词汇表：删 `Runtime (运行时)` 段对 "Stream.unwrap + inner Effect.gen" 的引用；加 "Queue-based Mailbox (队列邮箱)" 段
- Domain shape：`Agent → runtime` 段说明 queue-based fork lifecycle
- Settings / App Store / Per-Conversation Agent 段落引用本 ADR 取代 type-lie 描述