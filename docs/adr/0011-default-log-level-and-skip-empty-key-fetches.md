# ADR 0011 — tauri-plugin-log 默认 level + 静默无 key fetch + refresh 下限 60s

- Status: Accepted
- Date: 2026-06-15
- Scope: src-tauri/ 启动配置 + 调度器下限 + fetch 路径的"未配置"语义

## Context

`pnpm tauri:dev` 启动后终端持续刷日志，根因 3 层叠加：

1. **tauri-plugin-log 2.x 默认行为**：官方文档原话 "By default all logs are processed"，不调 `.level(...)` 时 `LevelFilter::Trace` 生效。`keyring 3.x` 等外部 crate 的 DEBUG 日志（"creating entry" / "get password from entry" / 等）被无差别输出到 stdout。
2. **默认 active provider = Deepseek**（`state.rs:42` 写死 `let active_id = ProviderId::Deepseek;`），用户未配 key 时 `secrets::get_api_key` 返回 `None`，`fetch_provider` 用 `Secret::empty()` 继续走 fetch → 必然失败 → 打 warn。
3. **`Settings::MIN_REFRESH_SECS = 5`**（`settings.rs:229`）— 调度器下限仅 5s，配合 #2 形成"每 5s 失败一次"的视觉刷屏。

一次 fetch 失败自然产生约 6 条日志（`state.rs:170-173` × 2 + `scheduler.rs:42` × 1 + `keyring` 3 条 DEBUG），叠加默认 level 不限 + 默认 active + 5s 下限 = 终端刷屏。

## Decision

### 1. tauri-plugin-log 默认 level = Info

`lib.rs::run` 的 plugin builder 加 `.level(log::LevelFilter::Info)`。

理由：项目内 `log::*!` 宏只用到 `info` / `warn` / `error` 三档，DEBUG 仅来自外部依赖（keyring / reqwest / sqlx 未开 query log），业务调试走前端 devtools / 日志文件（`LogDir` target）即可。

如需 DEBUG 走环境变量：`$env:RUST_LOG = "codeman_agent_lib=debug" pnpm tauri:dev`。项目范围内已被 `keyring` 等子模块 DEBUG 噪音淹没，不应自动开启。

### 2. fetch_provider 在 has_api_key=false 时跳过 fetch

`state.rs::fetch_provider` 在调 `secrets::get_api_key` **之前**先调 `secrets::has_api_key(id)`。`false` 时**不调** `adapter.fetch`，构造一个 `SnapshotEnvelope { snapshot: None, error: Some("API key not configured") }` 写入 snapshots 缓存，**不**打 `warn!`、**不** emit `refresh-failed` 事件。

静默原因：
- `refresh-failed` 事件本意是 "上游 fetch 异常"，不包含 "用户未配置" 这种稳定状态
- warn 日志刷屏即本次问题的主因
- 调度器每 60s 一次（见 #3），如需提示用户配置 key，**前端**是更合适的位置

前端 `latest_snapshot` 命令能正常返回 envelope，UI 渲染 "未配置 key" 占位的逻辑**不在本 ADR 范围**，留待后续前端 PR。

### 3. `Settings::MIN_REFRESH_SECS` 从 5 提到 60

`settings.rs::MIN_REFRESH_SECS = 60`。`refresh_interval()` 与 `sanitized()` 的钳制同步更新。

理由：刷新频率的语义是"用户查看账单余额/配额的最新延迟"。LLM 厂商页面的余额变化通常以分钟/小时计，5s 间隔是 over-engineering。60s 满足"用户切换/打开窗口后 1 分钟内看到数据"，且即便 #2 漏掉某些 case，失败日志密度也降低 12 倍。

如需更短间隔，留给用户在 settings UI 自行配置（钳制到 60 后不再向上），本 ADR 不动 UI 暴露范围。

## Why not...

### Why not 把 level 设成 `Warn` 或 `Error`

`info!` 包含启动期一次性事件（"codeman-agent 已启动" / "调度器启动" / "autostart set to true"），对开发者诊断"应用是否正常启动"很重要。`warn!` 级别会丢失这些信号。

### Why not 在 `fetch_provider` 返回 `Err(ProviderError::NoApiKey)` 变体

在 `types.rs::ProviderError` 加新枚举变体会扩散到所有 `match ProviderError` 的地方（`state.rs` 的 fetch + tests + provider 实现），且 `commands::get_provider_snapshot` 的错误处理需要新分支。直接返回 `Ok(envelope with error="API key not configured")` 利用现有 envelope 通路，零协议变更。

### Why not 在前端（Solid store）做"无 key 不轮询"

前端是按需触发（chat 调用工具时），**不是**定时轮询。持续轮询的唯一发起方是 Rust 调度器。在 Rust 端早 return 是单一收敛点。

### Why not 5 → 30s 而不是 5 → 60s

30s 在"刷新频率"语境下没有显著优势（用户等 30s 和 60s 体感相近），但 60s 是更符合行业惯例的"近实时"分界（30s 更接近"准实时" — 跟厂商 API 实际更新频率不匹配）。

## Consequences

**正面**：
- 终端无 key 状态下从"刷屏"降到"静默"
- keyring 等外部 crate 的 DEBUG 不再污染 stdout
- 调度器下限 60s 后，即便 #2 漏 case，失败日志密度降 12 倍

**负面 / 风险**：
- 配 key 之前 UI 看不到任何 "fetch 失败" 提示 — 需前端 `latest_snapshot` 渲染路径支持 "error == NoApiKey" 分支（**留待后续前端 PR**）
- 用户自定义 `refresh_interval_secs: 5` 会被静默 clamp 到 60，**无可见警告**（沿用现有钳制行为，不变）
- 改动后日志默认比之前安静 — 如果开发期间想看 keyring DEBUG，需手动 `$env:RUST_LOG = "keyring=debug"`

**回归验证**：
- `pnpm typecheck` 通过
- `cd src-tauri && cargo test` 全部通过（settings 11 + scheduler 4 + state 3 + providers 集成测试 + db 迁移测试）
- `pnpm tauri:dev` 启动后终端静默（不配 key 的情况下）

**文档同步**：
- `src-tauri/AGENTS.md` "日志" 章节：把"默认 info 级，要 debug 走环境变量"重写为"默认 Info 级（业务宏），外部 crate DEBUG 默认关（keyring / reqwest / sqlx），要全量 DEBUG 走 `$env:RUST_LOG` 环境变量"

## References

- ADR-0003 (Effect-TS 逻辑层)
- tauri-plugin-log 2.x 官方文档：<https://v2.tauri.app/plugin/logging/>
- `src-tauri/src/lib.rs` (plugin builder)
- `src-tauri/src/state.rs::fetch_provider` (本次修改点)
- `src-tauri/src/settings.rs::MIN_REFRESH_SECS` (本次修改点)
- `src-tauri/src/scheduler.rs::Scheduler::run` (轮询循环)
- `src-tauri/src/secrets.rs::has_api_key` (新增调用点)
- 顶层 `AGENTS.md` "反模式" 段
