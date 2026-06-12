# codeman-agent — Project Context

A small floating widget that surfaces LLM billing state at a glance. This
document pins the vocabulary used across the codebase so plan, code, and
commit messages stay aligned.

## Glossary

- **Balance** — a rechargeable credit pool held with the provider, e.g. an
  account pre-paid in fiat. Point-in-time; can be topped up. Typical fields:
  current amount, currency, auto-recharge flag.
- **Plan Quota** (`用量`) — a fixed, non-rechargeable allowance bundled with a
  plan, e.g. N tokens over the period. Decreases with usage, resets on the
  plan cycle, and cannot be topped up. Typical fields: remaining, total,
  optional expiry, optional daily-average spend.
- **Provider** — a billing service we surface. Concretely each Provider has a
  Rust **Adapter** that knows how to talk to its API.
- **Adapter** — the per-provider HTTP client + response parser that turns a
  secret into a `Snapshot`.
- **Snapshot** — the discriminated union of `Balance` and `PlanQuota`,
  emitted by the scheduler and rendered by the frontend.
- **Active Provider** — the single Provider the widget currently renders. V1
  is single-focus by design: only the active provider is polled.
- **Stale** — a `Snapshot` older than `stale_after_seconds`; the widget shows
  a `StaleBadge` and stops firing threshold-based notifications.
- **Secret** — `Secret<String>` newtype around the API key. Implements `Debug`
  and `Display` so the value never reaches logs.

## Domain shape

```
Provider
  ├── id        (stable string, used in settings + keyring lookup)
  ├── label     (human name, e.g. "DeepSeek", "MiniMax")
  ├── kind      (Balance | PlanQuota)
  └── adapter   (Box<dyn Provider>)

Snapshot
  ├── Balance { amount, currency, auto_recharge }
  └── PlanQuota { remaining, total, expires_at?, daily_avg? }
```

The two shapes are intentionally distinct. The widget renders them with
different templates and densities; do not collapse them into one card.

## Settings

Persisted via `tauri-plugin-store` (JSON file in app data dir):

```ts
interface Settings {
  activeProviderId: "deepseek" | "minimax";
  refreshIntervalSecs: number;       // default 60
  staleAfterSecs: number;            // default refresh * 3
  lowBalanceThreshold?: number;      // absolute amount in provider currency
  lowQuotaThresholdPct?: number;     // 0-100, fraction of total remaining
  hotkeys: { switch: string; toggle: string }; // e.g. "Ctrl+Alt+B"
  startAtLogin: boolean;
  notificationsEnabled: boolean;
  widgetPosition?: { x: number; y: number };
}
```

API keys never live in this file. They live in Windows Credential Manager
under `codeman-agent/<provider_id>/api_key` via the `keyring` crate.

## Display contract

- **DeepSeek (Balance)**: `¥ 87.42` (big) · `auto-recharge: 开/关/未知` ·
  `更新于 14:23`. Stale badge when older than `staleAfterSecs`.
- **MiniMax (Plan Quota)**: `1.2M` (big) · `/ 5.0M` (small) · horizontal
  progress bar · `到期 06-30` (if API exposes) · `日均 12k` (if API exposes) ·
  `更新于 14:23`. Bar fills with provider brand color.

## Auth convention

Both providers use `Authorization: Bearer <api_key>`. The header is built
inside the adapter using `Secret<String>` so the value never appears in
`log`/`tracing` payloads. The key never leaves the Rust process — the
frontend only ever sees a `hasKey: boolean` flag.

## MiniMax endpoint

The MiniMax plan-quota endpoint is **TBD** at planning time. The adapter
is wired against a configurable URL (defaulting to a placeholder that
returns a structured error) until a verified endpoint is documented in
this file. Once known, the verified URL + response schema is recorded here
in the same commit that flips the default.

## Logging

- Logs at `%LocalAppData%\codeman-agent\logs\`, rotated daily, capped.
- `log` + `tauri-plugin-log`; `info` default, `debug` via env var.
- API key material is wrapped in `Secret<String>` which redacts in
  `Debug`/`Display`; log statements also avoid formatting the full secret.

## Non-goals (V1)

- Multi-account per provider
- Historical charts
- Providers beyond DeepSeek + MiniMax
- Cross-platform packaging (Tauri stays portable; V1 ships Windows only)
- Auto-update, code signing
- Click-through transparent regions
