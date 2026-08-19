# ADR 0003 — Effect-TS 逻辑层，UI 消费

- Status: Accepted
- Date: 2026-06-13
- Scope: codeman-agent V1 TypeScript 层
- Related: ADR 0002 (pi-mono 运行时)

## Context

pi-mono 的 agent 运行时、IPC 桥接和会话存储都需要结构化异步、类型化错误和依赖注入。UI 层是 Solid.js，自有其细粒度响应式。我们需要为非 UI 的 TS 代码选一个搭档，且不能泄漏到 UI 层。

## Decision

采用 **Effect-TS**（`effect` + `@effect/platform-browser` + `@effect/vitest`）处理"逻辑层"的所有代码：`src/agent/runtime.ts`、`src/agent/tools/*.ts`、`src/agent/store/*.ts` 以及 `src/lib/tauri.ts` 中的 IPC 包装器。`src/agent/components/` 和 `src/agent/settings/`（UI 部分）的 UI 组件**不导入** `effect`——它们从 Solid store 读取普通值，Solid store 由 Effect → Solid 桥接层填充。

```
Effect 服务（逻辑层）
    ↓ 发出 Stream<value, error> 或 Effect<value, error>
桥接层（src/agent/store/*.ts）
    ↓ subscribe / runPromise → 写入 Solid signal
Solid 组件（UI 层）
    ↓ createMemo / signal getter
渲染
```

## Considered options

- **原始 `Promise` / `async-await`** —— 拒绝。无类型化错误、无 DI、无结构化并发、无 retry/timeout 原语。我们会实现得很糟糕。
- **fp-ts** —— 拒绝。错误用 tagged union，但无运行时、无 stream 支持、无 DI。Effect 涵盖了它的全部能力。
- **Effect-TS（已选）** —— 类型化错误、结构化并发、资源安全作用域、Stream、Layer 用于 DI、官方 `platform-browser` 集成、官方 vitest 适配器。

## Consequences

- UI 层是严格消费者。它不能构造 Effect，不能订阅 Stream，也不能捕获 Effect 类型化错误。从 Effect 服务冒泡出来的错误在桥接层以普通 `Error` 实例或桥接层边界上记录的分叉联合类型形状落地。
- Effect 服务的测试使用 `@effect/vitest` 的 `it.effect()` 和 mock `Layer`。桥接层测试使用 `it.effect()` 加假 Effect 服务；Solid store 侧在 jsdom 环境下用 `@solidjs/testing-library` 测试。
- `platform-browser` 是我们引入的唯一 `@effect/platform-*` 包。禁止引入 `platform-node`——webview 没有 Node，引入它会虚假地宣传一种导入时就会崩溃的能力。
- 库体积：`effect` 属中等大小（~100KB gzip）。webview 的启动时间影响可接受；安装体积影响被移除临时错误处理粘合代码所抵消。

## References

- Effect-TS: https://effect.website/
- @effect/platform-browser: https://effect.website/docs/guides/platform/browser
- @effect/vitest: https://effect.website/docs/guides/testing
