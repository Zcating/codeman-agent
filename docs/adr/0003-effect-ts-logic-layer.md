# ADR 0003 — Effect-TS in the logic layer, UI consumes

- Status: Accepted
- Date: 2026-06-13
- Scope: codeman-agent V1 TypeScript layer
- Related: ADR 0002 (pi-mono runtime)

## Context

pi-mono's agent runtime, the IPC bridge, and the conversation
store all need structured async, typed errors, and dependency
injection. The UI layer is Solid.js and benefits from its own
fine-grained reactivity. We need to pick a sidekick for the
non-UI TS code that does not leak into the UI.

## Decision

Adopt **Effect-TS** (`effect` + `@effect/platform-browser` +
`@effect/vitest`) for everything in the "logic layer":
`src/agent/runtime.ts`, `src/agent/tools/*.ts`,
`src/agent/store/*.ts`, and the IPC wrapper in
`src/lib/tauri.ts`. UI components in `src/agent/components/`
and `src/agent/settings/` (UI portion) **do not** import
`effect` — they read plain values from the Solid store, which
is fed by an Effect → Solid bridge.

```
Effect Service (logic layer)
    ↓ emits Stream<value, error> or Effect<value, error>
Bridge (src/agent/store/*.ts)
    ↓ subscribe / runPromise → writes Solid signal
Solid components (UI layer)
    ↓ createMemo / signal getter
render
```

## Considered options

- **Raw `Promise` / `async-await`** — rejected. No typed
  errors, no DI, no structured concurrency, no retry/timeout
  primitives. We'd reinvent them badly.
- **fp-ts** — rejected. Tagged unions for errors, but no
  runtime, no stream support, no DI. Effect subsumes it.
- **Effect-TS (chosen)** — typed errors, structured concurrency,
  resource-safe scopes, streams, layers for DI, official
  `platform-browser` integration, official vitest adapter.

## Consequences

- The UI layer is a strict consumer. It cannot construct
  Effects, cannot subscribe to streams, and cannot catch
  Effect-typed errors. Errors that bubble out of Effect
  services land in the bridge as plain `Error` instances or
  as discriminated-union shapes documented on the bridge
  boundary.
- Tests for Effect services use `@effect/vitest` with
  `it.effect()` and mock `Layer`s. The bridge layer is tested
  with `it.effect()` plus a fake `Effect` service; the Solid
  store side is tested with `@solidjs/testing-library` in a
  jsdom env.
- `platform-browser` is the only `@effect/platform-*` package
  we pull in. `platform-node` is forbidden — the webview has
  no Node, and pulling it in would falsely advertise a
  capability that crashes on import.
- Library footprint: `effect` is mid-sized (~100KB gz). The
  webview's boot time impact is acceptable; the install size
  impact is offset by removing ad-hoc error-handling glue.

## References

- Effect-TS: https://effect.website/
- @effect/platform-browser: https://effect.website/docs/guides/platform/browser
- @effect/vitest: https://effect.website/docs/guides/testing
