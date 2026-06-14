# codeman-agent — Project Context

A standalone Windows desktop AI agent built on Tauri 2 (Rust) +
Solid.js + Effect-TS, with pi-mono as the agent runtime. V1 ships
a general LLM chat agent plus two billing tools (DeepSeek, MiniMax).
This document pins the vocabulary so plan, code, and commit messages
stay aligned.

## Glossary

### Domain

- **Agent** — the product. A general-purpose LLM-powered assistant
  running in a standalone Windows desktop window. Replaces the
  old "widget" framing entirely. _Avoid_: widget, app, client.
- **Conversation** — a persistent chat thread owned by the user.
  Linear sequence of messages; V1 has no branching.
- **Message** — a single turn in a conversation. One of `user`,
  `assistant`, `tool`, or `system` role. May carry tool calls and
  tool results inlined as JSON.
- **Tool** — a typed function the agent can invoke. V1 ships 2
  billing tools (`get_balance`, `get_plan_quota`); the registry
  is extensible.
- **Tool Call** — the LLM's request to invoke a tool. Carries tool
  name and JSON args.
- **Tool Result** — the return value of a tool invocation. May
  carry a typed error.
- **Snapshot** — a point-in-time view of a billing provider's
  state. Discriminated union of `Balance { amount, currency,
  auto_recharge }` and `PlanQuota { remaining, total, expires_at?,
  daily_avg? }`. Returned by billing tools.

### Providers

- **LLM Provider** — a service the agent uses to generate
  responses (OpenAI, Anthropic, OpenAI-compatible, local). The
  agent's "fuel". _Avoid_: model, AI provider.
- **Billing Provider** — a service whose billing state the agent
  can query (DeepSeek, MiniMax). The agent's first-class tools.
- **Provider** — overloaded term; avoid using standalone. Always
  qualify as LLM Provider or Billing Provider.
- **Adapter** — the per-billing-provider HTTP client and response
  parser that turns a secret into a `Snapshot`. Lives in Rust.
- **Balance** — a rechargeable credit pool held with the billing
  provider. Point-in-time, can be topped up.
- **Plan Quota** (`用量`) — a fixed, non-rechargeable allowance
  bundled with a plan. Decreases with usage, resets on cycle,
  cannot be topped up.

### Architecture

- **Runtime** — the Effect-TS layer that wraps pi-mono's agent
  loop. Owns the agent's lifecycle, tool registry, and stream
  subscriptions. _Avoid_: agent core, agent loop.
- **Bridge** — the layer that translates Effect services'
  `Effect` / `Stream` outputs into Solid signals. UI components
  never `import 'effect'`. _Avoid_: adapter (overloaded).
- **Effect Service** — a typed async module exposing
  `Effect<A, E, R>` or `Stream<A, E, R>`. Composed via Effect
  layers; tested via mock layers (`@effect/vitest`).
- **IPC** — Tauri command bridge. Rust owns `commands.rs`; TS
  wraps in `src/lib/tauri.ts`. Tool handlers invoke Rust adapters
  via IPC commands.

### Secrets

- **LLM API Key** — auth credential for an LLM provider. Stored
  in **Tauri store** under `llm_providers/<id>/api_key`. The
  webview reads it; lower-security tier than billing keys
  (acceptable threat model: LLM keys only let attackers burn
  tokens).
- **Billing API Key** — auth credential for a billing provider.
  Stored in **Windows Credential Manager** (via `keyring` crate)
  under `codeman-agent/<id>/api_key`. Never leaves the Rust
  process. Frontend only sees a `has_key: boolean` flag.
- **Secret** — `Secret<String>` newtype in Rust. `Debug` /
  `Display` print `Secret(***)`. Only the adapter layer calls
  `.expose()`. _Avoid_: raw `String` for any credential.

### Settings & state

- **Settings** — JSON document persisted via `tauri-plugin-store`
in the OS app-data directory. Holds ~17 fields across 7
categories. **No API keys** (those live in Tauri store or
  keyring, split by namespace).
- **Hotkeys** (removed in V1.5): V1 had no hotkeys; V1.5 ships
  with zero global hotkeys. `tauri-plugin-global-shortcut` is
  no longer a dependency.
- **Stale** — a `Snapshot` older than the billing provider's
  `stale_after_seconds`; the legacy "stale badge" semantics is
  preserved for tool results that get cached.

### Styling

- **Utility Class** — Tailwind v4 utility-first CSS class
  (e.g. `flex h-screen bg-zinc-50`). V1's sole visual layer; every
  component's appearance is expressed in utility classes. _Avoid_:
  BEM class, atomic CSS, scoped CSS.
- **Theme** — the three-state visual mode
  (`light` / `dark` / `system`) the user picks in Settings; switched
  via `<html class="dark">` (no `prefers-color-scheme` media query —
  `system` mode reads it via a Solid effect in `agent/store/theme.ts`).
  _Avoid_: color scheme, appearance, mode.
- **Style Token** — semantic names defined in the `@theme` block
  (e.g. `primary-500`, `zinc-900`) that components reference instead
  of raw hex. _Avoid_: design token (overloaded with Material / Apple
  / IBM vocab), CSS variable (implementation detail).

## Domain shape

```
Agent
  ├── runtime          (Effect-TS layer wrapping pi-mono)
  ├── bridge           (Effect → Solid signal translator)
  └── tools[]          (typed functions; billing tools backed by Rust adapters)
        ├── get_balance(billing_provider_id)  → Snapshot
        └── get_plan_quota(billing_provider_id) → Snapshot

Conversation
  ├── id, title, system_prompt?, created_at, updated_at, archived_at?
  └── messages[]       (linear)
        ├── id, role, content
        ├── tool_calls[]    (when assistant invokes a tool)
        ├── tool_results[]  (results returned to the LLM)
        ├── model, input_tokens, output_tokens
        └── created_at

LLM Provider             Billing Provider
  ├── id                  ├── id
  ├── label               ├── label
  ├── enabled             ├── enabled
  ├── default_model       ├── adapter (Rust trait impl)
  ├── base_url?           └── refresh_interval_secs
  └── api_key_ref
        (Tauri store)              (keyring)
```

The two Provider kinds are intentionally distinct — they are
addressed by different code paths and store layers. Do not
collapse them into one type.

## Settings (V1 shape)

Persisted via `tauri-plugin-store` (JSON file in app data dir).
Full schema lives in `src-tauri/src/settings.rs`; the canonical
TS mirror is in `src/lib/types.ts`.

```ts
interface Settings {
  // A. LLM providers
  llm_providers: Array<{
    id: string;             // stable id (e.g. "openai", "anthropic")
    label: string;          // human name
    enabled: boolean;
    default_model?: string; // per-provider default
    base_url?: string;      // for OpenAI-compatible
    api_key_ref: string;    // path into Tauri store
  }>;

  // B. Default behavior
  default_llm_provider_id?: string;
  user_language: "zh" | "en" | "auto";
  theme: "light" | "dark" | "system";

  // C. App
  start_at_login: boolean;

  // D. Window
  window: {
    remember_position: boolean;
    remember_size: boolean;
    default_size: { width: number; height: number };
    min_size: { width: number; height: number };
  };

  // E. System prompt
  system_prompt: {
    default: string;             // multi-line
    user_can_edit: boolean;
  };

  // F. Billing
  billing_providers: Array<{
    id: string;                  // "deepseek" | "minimax"
    enabled: boolean;
    refresh_interval_secs: number;
    api_key_ref: string;         // path into keyring
  }>;

  // G. Conversations
  conversations: {
    auto_archive_after_days: number;   // default 30
    max_history: number;               // default 1000
  };
}
```

API keys never live in this file. LLM keys go in Tauri store,
billing keys go in keyring, and the two namespaces never collide.

## Auth convention

- **LLM providers** authenticate via pi-mono's standard mechanism
  (varies by provider: OpenAI Bearer, Anthropic `x-api-key`,
  OpenAI-compatible custom header). pi-ai handles header
  construction; the key value comes from Tauri store.
- **Billing providers** use `Authorization: Bearer <key>`. The
  header is built inside the Rust adapter using `Secret<String>`;
  the key value comes from keyring. The key never leaves the Rust
  process; the frontend only ever sees a `has_key: boolean` flag.

## MiniMax endpoint

The MiniMax plan-quota endpoint is **TBD** at planning time. The
adapter is wired against a configurable URL (defaulting to a
placeholder that returns a structured error) until a verified
endpoint is documented in this file. Once known, the verified
URL + response schema is recorded here in the same commit that
flips the default.

## Logging

- Logs at `%LocalAppData%\codeman-agent\logs\`, rotated daily,
  capped.
- `log` + `tauri-plugin-log`; `info` default, `debug` via env var.
- API key material is wrapped in `Secret<String>` (Rust) or
  Effect-TS `Secret` (TS) which redact in `Debug`/`Display`;
  log statements avoid formatting the full secret in either
  language.
- LLM API keys (Tauri store) and billing API keys (keyring) are
  treated differently in logs: LLM keys are referenced by
  `api_key_ref` only, never by value.

## Non-goals (V1)

- Multi-account per provider
- Historical charts / time-series data
- Branching conversations
- Auto-memory / cross-session user facts (M2 conversations only)
- General-purpose tools beyond billing (no shell, no file system,
  no IDE integration)
- Mouse-free operation (no hotkeys, no keyboard shortcuts in V1)
- Cross-platform packaging (Tauri stays portable; V1 ships
  Windows only)
- Auto-update, code signing
- Click-through transparent regions
