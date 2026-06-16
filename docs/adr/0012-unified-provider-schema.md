# Unified Provider schema + Billing moved to TypeScript

**Status**: accepted (2026-06-16)

V1 用 `Settings.llm_providers[]` + `Settings.billing_providers[]` 两个独立数组表达同一家公司（典型如 MiniMax 同时是 LLM 供应商和计费查询对象），导致 `ProviderId` 在 5 处独立定义、Settings UI 出现 2 张卡、Service 路径分裂。V1.5+ 改为单条 `Settings.providers: Provider[]`，每条记录 `llm` 必选 + `billing` 可选 + `models_endpoint` 可配置。

**与此同时，V1 billing 工具实际从未被 runtime dispatch**（pi-ai 0.73.1 的 `Tool` 接口无 `execute` 字段，`runtime.ts` 的 switch case 没有调用 `invoke("get_provider_snapshot", ...)` 的 handler）。Rust 端 ~250 行 adapter + V0 scheduler **全是死代码**。V1.5+ 把 billing **全部迁到 TS**（webview），key 改存 Tauri store（同 LLM key 档），CORS 验证通过后无需 Tauri proxy（DeepSeek 已验证，MiniMax billing endpoint 落地时再验）。

## Context

### 触发 1：V1 双数组的痛

V1 schema 拆分为 `llm_providers[]` 和 `billing_providers[]` 的历史理由：

1. LLM 与 billing 的代码路径不同
2. LLM key 存 Tauri store，billing key 存 keyring（不同安全等级）
3. LLM 流式文本，billing 是 `Snapshot` enum

**这些理由都不要求 provider 概念本身分裂**——它们只要求"同一条 provider 记录可以承载不同的 capability 子对象"。

V1 的实际后果：

- MiniMax 在两个数组各一条，id 重复，key 独立存储
- `ProviderId` 在 5 处独立定义（TS tool schema, Rust enum, registry, etc.）
- Settings UI 同一家公司 2 张卡
- `BillingService` Live Layer 是 stub（症状 1）
- 加新 provider 要在 settings 数组 + Rust registry + TS enum + TS service 四处注册

### 触发 2：V1 billing 工具实际不可用

`runtime.ts` 的 `agent.subscribe` switch case：

- `message_update`: push token/tool_call 到 queue
- `tool_execution_start`: 空 case
- `tool_execution_end`: push tool_result 到 queue
- `agent_end`: resolve finish promise

**没有任何 handler 调 `invoke("get_provider_snapshot", ...)`**。billing.ts 注释说"handler 会调 invoke(...)"——**那个 handler 不存在**。

加上 pi-ai 0.73.1 的 `Tool` 接口没有 `execute` 字段，pi-mono transport 收到 `tool_call(get_balance)` 时没地方执行——LLM 调了但**永远拿不到结果**，工具调用**完全失效**。

**V1 chat 流程里，Rust billing adapter 是死代码。** Q3 症状 1（`BillingService` stub）只是表象——整条路径在 V1.5 之前就是断的。

### 触发 3：V0 widget 设计残留

V0 是"widget"形态（280×100 浮窗），**轮询** DeepSeek balance 实时显示。V0 设计直接驱动 V1 的 layout：

| 设计 | 目的 | V1 状态 |
|---|---|---|
| `scheduler.rs` 轮询当前激活 provider | widget 实时刷新 | **V1 死代码** |
| `providers/*.rs` HTTP + 解析 | widget 抓数据 | 还能用，但 chat 路径不调 |
| key 存 `keyring` | widget 不该持明文 | V1 仍合理（keyring 比 Tauri store 安全） |
| `Snapshot` 缓存 + `SnapshotEnvelope` | widget 显示过期态 | V1 on-demand 没意义 |
| `refresh_interval_secs` 字段 | 控制轮询频率 | 随 scheduler 一起死 |

V1 改成 chat agent 后，**这套设计大部分失效**。真正"还在工作"的只剩 key 隔离。

### 触发 4：CORS 验证

`https://api.deepseek.com/user/balance`：

- HTTP 200 on OPTIONS preflight
- `Access-Control-Allow-Origin: http://localhost:1420`
- `Access-Control-Allow-Methods: GET`
- ✅ **DeepSeek billing 可在 webview 直接 fetch**

`https://api.minimaxi.com/anthropic/v1/messages`：

- HTTP 200 on OPTIONS preflight
- `Access-Control-Allow-Origin: http://localhost:1420`
- `Access-Control-Allow-Methods: GET,POST,OPTIONS,PUT,DELETE`
- ✅ **MiniMax LLM 可在 webview 直接 fetch**（确认 V1 chat 实际工作）

`https://api.minimaxi.com/anthropic`（base）：

- HTTP 403 on OPTIONS，CORS header 空
- ⚠️ 但 `/v1/messages` 和 `/v1/models` 都通

`https://api.minimaxi.com/anthropic/v1/models`：

- HTTP 200 on OPTIONS preflight
- ✅ MiniMax models endpoint 可在 webview 直接 fetch

**结论**：所有已知 endpoint 都支持 webview fetch；MiniMax billing endpoint（TBD，未公开）落地时需再验 CORS。若 CORS 不通过，加 1 个 Tauri proxy 命令兜底。

## Decision

### A. 统一 Provider schema

`Settings.providers: Provider[]`，每条记录：

```ts
interface Provider {
  id: string;
  label: string;
  enabled: boolean;
  llm: {                              // 必选
    default_model: string;
    base_url: string;
    api_type: "anthropic-messages";
    llm_api_key_ref: string;
    models: ModelMeta[];              // 用户可编辑
    models_endpoint: string;          // per-provider 可配置
  };
  billing?: {                         // 可选
    kind: "balance" | "plan_quota";
    billing_api_key_ref: string;      // V1.5+ 指向 Tauri store（V0 是 keyring）
  };
}

interface ModelMeta {
  id: string;
  label: string;
  context_window?: number;
  deprecated?: boolean;
  thinking?: boolean;
}
```

**`llm` 必选，`billing` 可选**——每条 provider 必须能跑 LLM（chat 是产品核心），计费查询是额外能力。

**`api_type: "anthropic-messages"` 仍锁单值**（ADR-0011 不变）。DeepSeek 官方文档确认其 Anthropic 兼容端点 `https://api.deepseek.com/anthropic` 存在，**不放松字面量**。

**`models_endpoint` per-provider 可配置**。V1.5+ 预置：

- DeepSeek → `https://api.deepseek.com/models`
- MiniMax → `https://api.minimaxi.com/anthropic/v1/models`

`fetchModels()` 调此 URL（OpenAI-compatible `/v1/models` 格式，`Authorization: Bearer <key>`），返回 `ModelMeta[]`（`label` 默认 = `id`，用户可在 Settings 编辑）。

**`refresh_interval_secs` 字段删除**（V0 scheduler 死后无意义）。

### B. Billing 全部迁 TS

**删除**：

- `src-tauri/src/providers/`（deepseek.rs, minimax.rs, mod.rs，~250 行）
- `src-tauri/src/scheduler.rs`（V0 死代码）
- V0 IPC commands：`list_providers` / `get_active_provider` / `set_active_provider` / `force_refresh` / `set_api_key` / `has_api_key` / `test_provider` / `latest_snapshot`
- T13 IPC command：`get_provider_snapshot`（被 TS adapter 替代）
- `src-tauri/src/secrets.rs`（keyring 包装，V0 billing key 用）
- `src-tauri/src/state.rs::fetch_provider`（Rust adapter 调用点）

**保留**：

- T13 IPC commands 的最小子集：`list_billing_providers` / `has_billing_key` / `set_billing_key`（薄包装 Tauri store）
- `src-tauri/src/secrets_llm.rs`（LLM key 仍走 Tauri store）

**新增 TS**：

- `src/features/billing/lib/adapters/deepseek.ts` — fetch + 解析
- `src/features/billing/lib/adapters/minimax.ts` — fetch + 解析
- `src/features/billing/lib/adapters/types.ts` — `BillingAdapter` 接口
- `src/features/billing/lib/adapters/index.ts` — registry
- `src/features/billing/lib/billing.ts` — Tool schema + execute（升 pi-ai 到 0.9.4 后）

### C. 升级 pi-ai 到 0.9.4

`Tool` 接口加 `execute: (args) => Promise<result>` 字段（pi-ai 0.9.4 + pi-agent 0.9.0 配套）。Billing tool `execute` 调对应 TS adapter。**`runtime.ts` 的 200 行手摇 subscribe switch 大幅简化**——只需处理 token + done + error，tool_call / tool_result 由 pi-mono transport 自动 dispatch。

### D. Key 存储统一到 Tauri store

- LLM key: Tauri store `llm_providers/<id>/api_key`（不变）
- Billing key: Tauri store `billing/<id>/api_key`（**V0 是 keyring，V1.5+ 改**）
- 两套命名空间独立，**同档安全等级**——均经 IPC 跨到 webview
- V1 migration: keyring → Tauri store（迁移代码在 `Settings::sanitized()`）

## Considered Options

- **A. 维持 V1 双数组**：拒绝所有新症状——**拒绝**
- **B. 统一 schema 但 billing 留 Rust**：保留 keyring 隔离，但保留 V0 死代码——**拒绝**
- **C. 统一 schema + billing 移 TS**：采纳
- **D. 放松 `api_type` 为 union**：不必要——DeepSeek 已有 anthropic 兼容端点——**拒绝**
- **E. billing 进 Node sidecar（V1.6+）**：V1.5+ scope 不含，V1.6+ 评估

## Consequences

**正面**：

- 一家公司 = 一条记录，schema 反映现实
- 加新 provider 永远比"加新 LLM + 加新 billing"少一行
- Settings UI 一张卡对应一家公司
- Q3 5 个症状里至少 3 个直接消解
- `ProviderService.getModels(id)` 给 chat runtime 一个静态模型列表 getter
- `ProviderService.fetchModels(id)` 给 Settings 一个"刷新模型"按钮
- **V0 死代码 ~300 行 Rust 全删**（providers/ + scheduler.rs + V0 commands）
- **Billing tool 真正可用**（V1 至今没被 dispatch，V1.5+ 用 pi-ai 0.9.4 AgentTool 后）
- Tool dispatch 在同一进程（TS webview），不再跨 IPC

**代价**：

- 需 schema migration V1 → V1.5（自动，`Settings::sanitized()`）
- 需 keyring → Tauri store key 迁移（settings migration 一部分）
- **Billing key 安全等级从 keyring 降到 Tauri store**（同 LLM key 档）——同威胁模型：泄漏只能让攻击者查余额，不能直接转账
- 需升 pi-ai 到 0.9.4（消除 `as any` 桥 + AgentTool 工厂）
- MiniMax billing endpoint 落地时需验 CORS；不通则加 1 个 Tauri proxy 命令
- ~10 文件改动（scope b，~2 周）

**未变**：

- ADR-0011（anthropic-messages 单值）
- 单一持久化路径（Tauri store + SQLite）
- 单一 main 窗口 + TanStack Router
- pi-mono 仍在 webview（V1.5 不迁 sidecar）
- E2E 测试策略不变