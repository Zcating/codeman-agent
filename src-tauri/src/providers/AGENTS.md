# src-tauri/src/providers/ — 厂商适配器

每个计费源作为独立 `Provider` 实现存在。trait 是 async 的,这样调度器能把 `Arc<dyn Provider>` 放进 registry,切换厂商时不必重建 HTTP 客户端。

> **V1 任务上下文**：T13（billing 工具）让前端可经 IPC 调本目录的 `fetch`——前端 `BillingService.getSnapshot(providerId)` → `commands::get_provider_snapshot` → `state::fetch_provider` → **当前激活** provider 的 `fetch`。`registry()` 里的所有 provider 都暴露为可查询目标（**非激活**厂商在 IPC 路径里也允许调用，但只返回缓存）。

## 目录布局

```
providers/
├── mod.rs         # Provider trait + Adapter 类型别名 + registry()
├── deepseek.rs    # Balance 厂商(优先选 CNY 的聚合器)
└── minimax.rs     # PlanQuota 厂商(占位 URL,端点 TBD——升级前 fetch 返回 EndpointNotConfigured)
```

## Trait 契约

```rust
#[async_trait]
pub trait Provider: Send + Sync {
    fn id(&self) -> ProviderId;
    fn kind(&self) -> ProviderKind;
    fn label(&self) -> &'static str;
    async fn fetch(
        &self,
        client: &Client,
        secret: &Secret,
    ) -> Result<Snapshot, ProviderError>;
}
```

实现方必须:

- 当 `secret.is_empty()` 时,HTTP 之前就 return `ProviderError::MissingKey(id)`。设置 UI 靠这个信号显示"请先填 API key"的空状态。
- `Authorization: Bearer …` 头在**本函数内**用 `secret.expose()` 构造,secret 不准流出去。
- 上游非 2xx 映射成 `ProviderError::Upstream(format!("{status}: {body}"))`,**只带 body 不带 URL**。URL 泄漏是低风险的指纹但毫无意义。
- JSON / 解析失败映射成 `ProviderError::InvalidResponse(String)`。
- 永远不要对 `secret` 本身或任何从它派生的字符串用 `log::info!` / `log::debug!`。`Secret` 类型的 `Debug` 已经替换过了。

`fetch` 在两条路径上被调用：
1. **调度器轮询**（`scheduler.rs`）——只对**当前激活**的厂商调。非激活厂商保持冷态，见 `only_active_provider_is_polled` 测试。
2. **T13 IPC 显式查询**（`commands::get_provider_snapshot`）——前端 `BillingService.getSnapshot(providerId)` 直接调任意 provider 的 `fetch`，不依赖激活状态；走的是单次 fetch，不入轮询。

## 新增厂商流程

1. 在 `src-tauri/src/providers/<id>.rs` 写适配器结构 + `#[async_trait] impl Provider for <Id>Adapter`。
2. 在 `providers/mod.rs` 加 `pub mod <id>;`。
3. 把 `Arc::new(<id>::<Id>Adapter::new()) as Adapter` 追加到 `registry()`。**顺序有讲究**——`ProviderId::next()` 沿 registry 顺序走,决定切换器的循环方向。
4. 在 `types.rs` 加 `ProviderId` 变体(同步更新 `ProviderId::ALL`、`as_str`、`label`、`next` 以及相关测试)。
5. 在 TS 端镜像变体:改 `src/lib/types.ts` 的 `ProviderId` 联合和 `ALL_PROVIDERS` 数组。`nextProvider` 助手是两路硬编码,跟着改。
6. 更新 `src/lib/format.ts` 里的 `PROVIDER_LABEL`。
7. 只有当新厂商有专属设置项时才动 `settings-app.tsx` 的 `SECTIONS` 顺序。
8. **同一笔 commit** 里在 `CONTEXT.md` 记录端点(并把默认占位 URL 翻过来)。v1 契约:经核验的端点和翻默认必须在同一个变更里。

## 测试

- `wiremock` 在 `[dev-dependencies]`。启 `MockServer`、注册 `Mock::given(method + path + bearer_token).respond_with(...)`,然后 `adapter.fetch(&Client::new(), &Secret::new("tok"))`。
- **必须**测负路径:空 secret、非 2xx 状态、total=0、字段缺失、JSON 畸形。只测正路径的标准响应远远不够。
- 占位端点要断言结构化错误(`ProviderError::EndpointNotConfigured`)**在 HTTP 调用前**返回。这条分支不用 mock。
- 看 `minimax.rs::tests` 的完整模式:三个正例 + 一个反例 + 一个占位检查。

## Snapshot 变体

`Snapshot` 是带 tag 的 enum(`#[serde(tag = "kind", rename_all = "snake_case")]`)。每个变体用各自的模板渲染(见 `src/agent/components/`),**不要**合并——Balance 和 PlanQuota 信息密度不同。加第三个变体的步骤:

- 新增结构字段 → 同步 TS 联合变体(`src/lib/types.ts` 的 `Snapshot` 联合)。
- 新增视图组件(如 `<CustomCard>.tsx`)→ 放 `src/agent/components/`，被 `ProviderCard` 或 `ToolCallCard` 复用。
- 在 `src/agent/components/ProviderCard.tsx` 加 `Show` 分支（按 `kind` 判别）。

## 本目录硬性规则

- `Provider::fetch` 是**唯一**调 `secret.expose()` 的函数。
- 适配器的 `Default` impl 必须廉价:不允许 I/O,不允许构造 reqwest `Client`。
- 给 `state.rs` 里的 `ProviderDescriptor` 加字段**必须**同步 TS 形状——前端靠它渲染厂商切换器。
- `registry()` 顺序属于公开契约(决定循环方向)。重排 = UI 变更。如果要改,在函数的 doc 注释里说清楚。
- **新增/删除 provider 必动 `lib.rs::invoke_handler!`**（T13 命令 `list_billing_providers` / `get_provider_snapshot` 间接依赖 registry）和 `src/lib/tauri.ts` 的 `BillingService` 定义。**两边同步提交**。
