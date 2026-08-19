# — Cancel `Provider.billing` and 计费工具 domain capability

**Status**: accepted · 2026-08-12

## Context

### 1. `Provider.billing` was a domain-level capability that proved low-leverage

The V3.1 design (per CONTEXT.md + +) baked a billing capability into the `Provider` aggregate:

- `Provider.billing: { kind: "balance" | "plan_quota" }` — a sub-record on every Provider
- Two registered AgentTools: `get_balance` (DeepSeek), `get_plan_quota` (MiniMax)
- Two HTTP adapters (`src/features/billing/lib/adapters/{deepseek,minimax}.ts`) parsing upstream responses into `Snapshot` discriminated unions (`Balance { amount, currency, auto_recharge }` | `PlanQuota { remaining, total, expires_at?, daily_avg? }`)
- Two CONTEXT.md vocabulary entries: **Balance** + **Plan Quota** + **Snapshot** + **Adapter**

The intent was: any agent run could opportunistically check the user's API-key balance or plan quota via two specialized tools, surfacing cost/quota context to the LLM.

### 2. Field drift proves the capability was load-shedding, not load-bearing

`Provider.billing` was defined in `src/main/features/settings/schemas.ts` (Schema-derived type) but **omitted** from `src/shared/lib/types.ts:Provider` (the canonical IPC-facing interface) and `src/renderer/src/features/settings/lib/schemas.ts:Provider` (the renderer's settings form schema). This drift is structural evidence that:

- Renderer-side form code never surfaced `billing` (no UI editor)
- The IPC contract did not actually carry `billing` to the renderer (or carried it as an untyped extra)
- No consumer-side test referenced the field
- The Adapter code under `src/features/billing/lib/adapters/` was effectively the only place the shape lived coherently

A domain capability whose schema drifts across its own type sources is not a capability — it is dead code with persistence.

### 3. Usage frequency and product value did not justify the surface area

After review:

- `get_balance` and `get_plan_quota` are **not** first-class user needs — users check their balance via the provider's own dashboard
- The adapters add ~300 lines of HTTP client + parser code + 2 adapter-specific tests + drift-prone schema edges
- The vocabulary burden (Balance / Plan Quota / Snapshot / Adapter + Provider.billing sub-record) bloats CONTEXT.md and makes Provider shape more complex than its peers
- Migration churn during the C1–C6 refactor series repeatedly bumped into `Provider.billing` ambiguity (e.g., renderer schemas omitting it, ipc-mock.ts omitting it)

### 4. It blocks C1 (Provider canonicalization)

The C1 candidate's deletion test depends on collapsing `Provider` to a single canonical Schema. `billing` is the only field with a 3-place drift problem (main-only); eliminating it removes the drift and lets the canonical shape be a clean 5-field record (`id / label / comment? / apiKey / llm`).

## Decision

### D1. Cancel the billing domain capability entirely

- `Provider.billing` field: **removed** from canonical `Provider` shape
- AgentTools `get_balance` + `get_plan_quota`: **unregistered**
- Adapters `src/features/billing/lib/adapters/{deepseek,minimax}.ts`: **deleted**
- Adapter tests: **deleted**
- IPC channels: removed if no other consumer (`billing:*` commands — to be verified during Step 1)
- Settings persistence: `Provider.billing` field, if any persisted JSON contains it, will be ignored on next read (forward-compat tolerant) but no new schema field is written

### D2. Drop the corresponding CONTEXT.md vocabulary entries

- Remove: **Provider.billing (计费能力)** entry
- Remove: **Balance (余额)** entry
- Remove: **Plan Quota (用量)** entry
- Remove: **Snapshot (快照)** entry
- Remove: **Adapter (适配器)** entry (specifically the billing-adapter sense — `find-skills` / `grill-with-docs` "Adapter" usages unrelated to billing remain unaffected)
- Keep: **Provider (提供商)**, **Provider Preset (厂商预设)**, **Provider.llm (LLM 能力)**, **ModelMeta**, **Models Endpoint**, **Protocol** — these are unaffected

### D3. ADR-0068's `core/agent-factory.ts` candidate (C3) is unaffected

C3's plugin→core reach remains a real issue independent of billing. The `ProviderConfig` factory + facade work continues.

### D4. No "billing plugin" replacement is created

If a user later needs balance / quota surfacing, they can install a third-party plugin via the existing Plugin Registry. We do **not** pre-build a billing plugin shape.

### D5. Forward compatibility with persisted settings JSON

If a user's settings.json (on disk) contains a `billing` field from a prior version, it stays on disk. The next `getSettings` read will simply not surface it (canonical schema drops it). No migration script is needed — settings schema is tolerant of extra fields by design (per ADR-0025's `Schema.optional` semantics for unknown keys).

## Consequences

### Positive

- `Provider` canonical schema drops to a clean 5-field record; field-drift detection (openai-chat vs anthropic-messages, billing yes/no) collapses to a single source
- ~300 lines of adapter code deleted; ~2 test files deleted
- CONTEXT.md vocabulary simpler — four entries gone, no domain-concept bookkeeping for a capability that proved load-shedding
- Step 1 of C1 refactor unblocked — ProviderLlm + Provider can canonicalize without `billing` ambiguity

### Negative

- Any future user who **did** rely on `get_balance` / `get_plan_quota` tool calls loses that capability — acceptable per D4 (third-party plugin path remains)
- If billing capability is reintroduced later (e.g., for cost-controlled automations), the vocabulary + adapters + schema field must be re-added — estimated 1-2 days of work, mostly mechanical
- CONTEXT.md must be edited in lockstep with code (already in the Step 1 commit)

### Neutral

- No IPC contract change visible to renderer (renderer never received `billing` anyway due to drift)
- No main-process handler change visible to renderer (renderer never called billing IPC channels — to be verified)
- ADR-0068's `core/agent-factory.ts` (C3) work continues independently

## Alternatives considered

### Alt-1: Keep `billing` but unify Schema/interface drift

- Rejected: the field is genuinely unused, drift is a symptom not the disease. Unifying without removing perpetuates the load.
- If user telemetry later shows billing-tool calls, we re-introduce via ADR (per ADR template).

### Alt-2: Move `billing` to a sibling entity (e.g., `WorkspaceBilling`)

- Rejected: requires inventing a new aggregate + persistence shape + IPC channels for the same capability. Same surface area, different home — no leverage gain.
- If billing ever returns, this is a viable architecture.

### Alt-3: Keep billing tools but remove `Provider.billing` field

- Rejected: tools without provider-level config have nothing to do at runtime. They would need their own config source, which is exactly the problem D1 avoids.

## References

- CONTEXT.md vocabulary entries removed: **Provider.billing (计费能力)**, **Balance (余额)**, **Plan Quota (用量)**, **Snapshot (快照)**, **Adapter (适配器)**
- (Electron migration): original definition of billing sub-record
- (system prompt builder): referenced billing context
- (renderer core/ layer): C3's `core/agent-factory.ts` continues independently
- C1 candidate (architecture review): `Provider/ProviderConfig` multi-source-of-truth

## Implementation note

This ADR is the **decision record**. The C1 Step 1 commit (Provider canonicalization) implements D1–D2 atomically. is committed in the same change set.
