# ADR 0002 — pi-mono as the agent runtime

- Status: Accepted
- Date: 2026-06-13
- Scope: codeman-agent V1 agent layer
- Supersedes: none
- Related: ADR 0001 (Tauri 2 + Solid.js shell)

## Context

codeman-agent pivots from a passive billing widget to an active
desktop AI agent. V1 needs a real LLM agent loop with tool
calling, streaming, and provider abstraction. We evaluated
building the loop from scratch vs adopting an existing
TypeScript agent framework.

## Decision

Adopt **pi-mono** (https://github.com/badlogic/pi-mono) as the
agent runtime, with the agent loop and LLM provider abstraction
shipped from `@mariozechner/pi-agent` and `@mariozechner/pi-ai`.
Billing tools are registered in TypeScript as `@tool()` entries
whose handlers invoke Rust adapters via Tauri IPC commands
("T1" tool bridging).

## Considered options

- **T1 (chosen)** — TS-side tool registration. The agent loop
  lives in the Tauri webview; tools are defined next to the
  agent code; tool handlers call Rust via `invoke()`.
- **T2 — MCP server in Rust.** pi-agent acts as an MCP client.
  Rejected: extra process boundary, +50–200ms latency per tool
  call, more lifecycle code.
- **T3 — custom RPC bridge.** Rejected: no upside, all the
  complexity of T2 plus a non-standard protocol.

## Consequences

- The agent loop is bound to the Tauri webview (V8 / Chromium
  kernel). This is fine for `fetch`-based LLM calls; Node-only
  APIs (e.g. `fs`, `process`) are not available. We avoid any
  pi-mono code path that touches the filesystem directly —
  anything file-shaped goes through Tauri commands.
- Tool input/output schema is defined twice: once as a Zod
  schema in TS (for pi-agent), once as a `Deserialize` impl
  in Rust (for the adapter). Drift between the two is a
  silent-bug source. We accept this as V1 debt and add a
  comment in `src/agent/tools/billing.ts` flagging it. A
  `ts-rs` / `specta` codegen pass is on the V2 roadmap.
- Tool calls are synchronous from the agent's perspective:
  the LLM blocks until the tool returns. Long-running billing
  API calls (e.g. 30s timeout) freeze the agent. We accept
  this for V1; streaming tool results are V2.
- LLM provider support is whatever pi-mono ships with. When
  they add a provider, we get it. When they remove one, we
  lose it. No bespoke provider code in this repo.

## References

- pi-mono: https://github.com/badlogic/pi-mono
- @mariozechner/pi-ai: LLM provider abstraction
- @mariozechner/pi-agent: agent loop
