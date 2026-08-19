# — Renderer-side Bridge Wrapper Contract

**Status**: proposed · 2026-08-12

## Context

### 1. The pattern problem

ADR-0060 established the preload bridge (`src/preload/index.ts`) as the single source of `window.codeman` on the renderer side. mandates that "renderer must not import `electron` directly", but stops short of prescribing _how_ renderer modules consume the bridge surface.

The `CodemanApi` interface (`src/renderer/src/shared/apis/invoke.api.ts:50-195`) declares two distinct call shapes:

1. **Request/response** — `invoke<T>(channel, args)` returns `Effect.Effect<R, AppError>`. Wrapped by per-domain `*.api.ts` modules (`MultiAgentsApi`, `CqApi`, `ProviderApi`, ...).
2. **Subscribe / fire-and-forget** — `automationsExecuteLlm(handler) => () => void` and `automationsSendLlmResult(payload) => void`. These mirror the request/response shape but require direct bridge access because they are _not_ request/response.

`invoke.api.ts` provides one typed wrapper for the subscribe pattern (`streamChunks: Stream.Stream<unknown, never, never>` for `onStreamChunk`, line 230-234), but does **not** wrap the automation bridge methods. This forces consumers to call `window.codeman.automationsExecuteLlm(...)` directly.

### 2. Current violation

`src/renderer/src/plugins/automations/lib/automation-llm.ts:131, 140` (pre-fix) directly invoked `window.codeman.automationsSendLlmResult(payload)` and `window.codeman.automationsExecuteLlm(handleAutomationLlm)`. This is the only remaining violation outside `invoke.api.ts:207` (`return window.codeman` inside `getApi()`).

### 3. partial coverage

ADR-0065 D1 fixed the `__appStore` escape hatch by routing `getProviderConfigForModel` through `ProviderApi.list()`, and D4 articulated the "interactive UI vs background IPC handler" seam split. But D1 only addressed ProviderApi; the automation bridge wrapper was out of scope. leaves a gap: "background async IPC handler" still has no contract for _how_ it consumes the bridge.

### 4. Test seam risk

`automation-llm.test.ts` (pre-fix) used `Object.defineProperty(window, "codeman", ...)` to mock the underlying bridge. This violated ADR-0065's "test seam = prod seam" principle because the consumer (`automation-llm.ts`) and the test mock operated at different layers.

## Decision

### D1. General principle

**Every non-`invoke` IPC method declared on `CodemanApi` (subscribe, fire-and-forget, push events) MUST have a typed wrapper exported from a sibling module under `src/renderer/src/shared/apis/`.**

The wrapper module:

- Lives next to `invoke.api.ts` in `src/renderer/src/shared/apis/`
- Is re-exported from `src/renderer/src/shared/apis/index.ts` (barrel)
- Uses `getApi()` (exported by `invoke.api.ts`,) for bridge access
- Exposes a typed `Stream` (for subscribe) or `Effect` (for fire-and-forget) per consumer need
- Carries an reference in its header comment

Consumer modules (`*.ts` outside `shared/apis/`) **MUST NOT** access `window.codeman.*` directly. The only legal `window.codeman` access in the renderer is inside `getApi()` in `invoke.api.ts`.

### D2. Export `getApi()` from `invoke.api.ts`

`getApi()` becomes a public helper so sibling bridge wrappers can compose it without re-implementing the `typeof window === "undefined"` guard. The contract is:

```typescript
// invoke.api.ts
export function getApi(): CodemanApi & StreamSubscription {
  if (typeof window === 'undefined') {
    throw new Error('[invoke.api.ts] not in browser context — preload bridge unreachable');
  }
  return window.codeman;
}
```

Use sites:

- `invoke()` itself (already present)
- `streamChunks` (already present, line 230-234)
- Sibling bridge wrappers (`automation-bridge.api.ts`, future modules)

### D3. Reference implementation: `automation-bridge.api.ts`

New file `src/renderer/src/shared/apis/automation-bridge.api.ts` wraps the two automation bridge methods:

```typescript
export const automationLlmRequests: Stream.Stream<LlmExecuteRequest, never, never> =
  Stream.async<LlmExecuteRequest>((emit) => {
    const unsubscribe = getApi().automationsExecuteLlm((request) => emit.single(request));
    return Effect.sync(() => unsubscribe());
  });

export const sendAutomationLlmResult = (
  payload: LlmResultPayload,
): Effect.Effect<void, never, never> =>
  Effect.sync(() => getApi().automationsSendLlmResult(payload));
```

The Stream mirrors `streamChunks`'s `Stream.async` pattern (D1 establishes this as the canonical subscribe wrapper shape).

### D4. Consumer refactor: keep imperative API, internals use Stream

`automation-llm.ts` keeps its imperative public API (`setupAutomationMainListener()` / `cleanupAutomationMainListener()`) so plugin `index.ts:13-14` callers don't change. Internally:

- `setupAutomationMainListener()` → `Effect.runFork(Stream.runForEach(automationLlmRequests, request => Effect.promise(() => handleAutomationLlm(request))))`; store the `Fiber.RuntimeFiber<void, never>` in a module-level ref
- `cleanupAutomationMainListener()` → `Effect.runSync(Fiber.interrupt(fiber))`; clear the ref
- `handleAutomationLlm` → replaces `window.codeman.automationsSendLlmResult(payload)` with `Effect.runSync(sendAutomationLlmResult(payload))`

This preserves the existing call sites (`plugins/automations/index.ts:13-14`) while routing all bridge access through the typed wrapper.

### D5. Test seam alignment

`automation-llm.test.ts` mocks `automation-bridge.api` (the wrapper, not `window.codeman`) using `Stream.async<LlmExecuteRequest>((emit) => { streamEmitRef = emit; ... })` so tests can push requests via `streamEmitRef.single(request)`. `sendAutomationLlmResult` is mocked as `Effect.sync(() => mockSendResult(payload))`.

The previous `Object.defineProperty(window, "codeman", ...)` block is deleted. `MultiAgentsApi` and `ProviderApi` are mocked at their respective `*.api.ts` layers (same pattern as `ProviderApi` already used).

### D6. Documentation surface

Each `*.api.ts` bridge wrapper carries:

- A header comment naming the bridge methods it wraps
- An `ADR-0066` reference in the doc-block
- Per-export JSDoc describing consumer patterns (Stream.runForEach, Effect.runSync, etc.)

## Alternatives considered

### Single-file wrapper (path A — not selected)

Add `automationLlmRequests` and `sendAutomationLlmResult` directly to `invoke.api.ts` next to `streamChunks`. Pros: one file, no new module. Cons: `invoke.api.ts` mixes invoke semantics with subscribe/fire-and-forget semantics; the "wrapper per concern" boundary is muddied.

### Service Tag pattern (path B — not selected)

Wrap as `AutomationBridgeApi extends Context.Tag("AutomationBridgeApi", ...)` with `Live` layer. Pros: matches `MultiAgentsApi` / `CqApi` / `ProviderApi` pattern. Cons: `automation-llm.ts` would need `Effect.gen + yield* AutomationBridgeApi + Effect.provide(AutomationBridgeApiLive)` boilerplate; the imperative `setup/cleanup` lifecycle would have to be re-modeled (either drop it for `Effect.Scoped` or keep a thin wrapper). The use case is fundamentally a single subscription at startup, not a request-scoped service — Tag pattern is heavier than needed.

### Generalize to "Stream for everything subscribe" (path C — not selected)

Force every subscribe-shaped bridge method into a Stream wrapper. Pros: uniformity. Cons: `automationsSendLlmResult` is fire-and-forget (renderer → main, no return), wrapping as Stream is incoherent; mixing channels with different semantics into one shape erodes the interface signal.

## Consequences

### Positive

- `window.codeman` access points in renderer: from 2 (invoke.api.ts:207, automation-llm.ts:131/140) down to 1 (invoke.api.ts:207 only via `getApi()`)
- Test seam = prod seam for automation-bridge; same mock pattern applies to future bridge wrappers
- New pattern codified so future reviews don't re-suggest direct `window.codeman` access in plugins
- Type signature enforces contract: a renderer module that needs the automation bridge can only do so via the typed wrapper

### Negative

- One more module (`automation-bridge.api.ts`) and barrel entry; minor surface area growth
- `Effect.runSync(sendAutomationLlmResult(payload))` is slightly more verbose than `window.codeman.automationsSendLlmResult(payload)` (offset by typed safety + testability)
- Imperative internal Fiber state in `automation-llm.ts` (module-level `listenerFiber` ref) — same fragility as the pre-fix `subscription` ref, but with cleaner semantics (Fiber.interrupt vs raw unsubscribe function)

### Neutral

- No change to `CodemanApi` interface (`invoke.api.ts:50-195`)
- No change to preload (`src/preload/index.ts`)
- No change to main-process IPC handlers
- `CONTEXT.md` unchanged: the terminology ("IPC bridge", "automation LLM request/result") already exists

## Validation

- `pnpm run typecheck` passes — `automation-bridge.api.ts` re-exports `LlmExecuteRequest` / `LlmResultPayload` from `invoke.api.ts` (no type duplication)
- `pnpm run test` passes — `automation-llm.test.ts` mocks the wrapper (Stream layer), all 11 tests green
- `pnpm run lint` passes — no `eslint-disable` required
- `automation-llm.ts` consumers (`plugins/automations/index.ts:13-14`) unchanged
- `window.codeman` direct access grep: only `invoke.api.ts:207` (`return window.codeman` inside `getApi()`)

## Rollback

If the wrapper proves heavier than the violation:

1. Revert `automation-bridge.api.ts` (delete file)
2. Restore `automation-llm.ts:131, 140` to use `window.codeman.automationsSendLlmResult(payload)` / `window.codeman.automationsExecuteLlm(handler)` directly
3. Revert `automation-llm.test.ts` to `Object.defineProperty(window, "codeman", ...)` pattern
4. Mark this ADR "rejected — see Rollback section"

Do **not** delete — its ProviderApi migration stands regardless.

## Future work (out of scope for this ADR)

- Apply D1 to existing non-`invoke` CodemanApi methods without wrappers:
  - `on(channel, handler)` → could become `subscribeChannel(channel): Stream.Stream<unknown[], never, never>` (path C rejected above; could be revisited)
  - `send(channel, ...args)` → fire-and-forget, low reuse value, probably not worth wrapping
  - `removeAllListeners(channel)` → cleanup helper, paired with `subscribeChannel`
- Investigate whether `automationLlmRequests` should expose back-pressure (current `Stream.async` is unbounded queue)
- Generalize the `Effect.runSync(sendAutomationLlmResult(payload))` pattern into a `sendAndForget(payload): Effect.Effect<void>` helper if more fire-and-forget methods appear

These are recorded to guide future review sessions, not for this ADR to resolve.
