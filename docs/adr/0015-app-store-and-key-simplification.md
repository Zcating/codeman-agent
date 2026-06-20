# ADR 0015 — Settings 全局 app-store + API Key 模型简化（明文进 Settings JSON）

**Status**: accepted (V1.7+, 2026-06-20)

## Context

ADR-0012 把 Provider schema 统一为 `Settings.providers[]`，但 LLM key 与 Billing key 仍分存 Tauri store 两个独立命名空间（`llm_providers/<id>/api_key` 与 `billing/<id>/api_key`），由 `LLMProviderService` 单独管理。grill-with-docs session (2026-06-20) 发现 3 个耦合问题：

### 触发 1：ProviderCard / WorkspaceCard 直接 invoke 违反 ADR-0003

`src/features/settings/components/provider-card.tsx` 在每个 onChange handler 里直接 `await invoke("update_settings", { new_settings: { providers: [updated] } })`，**绕过** `shared/lib/tauri.ts` 的 `SettingsService` 边界。`workspace-card.tsx` 同构。这违反 `src/AGENTS.md` 的硬性规则："`shared/lib/tauri.ts` 是唯一允许 `import { invoke } from "@tauri-apps/api"` 的地方。" 而且每次 onChange 一次 IPC（typing system_prompt 触发 N 次），与 ADR-0012 引入的 `ProviderService` 同构的桥接层缺位。

### 触发 2：双 key 概念 + 双 Tauri store 路径是单 user 单 provider 场景下的过度设计

V1 设计假设 provider 可能用不同公司的 LLM key 和 billing key。但实际：MiniMax 一家公司同时是 LLM 提供方和计费查询对象，两条 key 由同一用户在 Settings 配。`llm_providers/<id>/api_key` 与 `billing/<id>/api_key` 两个 Tauri store 路径、`set_llm_key` 与 `set_billing_key` 两个 IPC、`llm_api_key_ref` 与 `billing_api_key_ref` 两个 schema 字段、`LLMProviderService.setApiKey` 与（隐含的）BillingService 等价方法——单 user 场景下全部冗余。grill 时用户明确："LLM key 和 Billing key 是一样的。"

### 触发 3：per-row API Key Save 按钮是 UI 噪声

ProviderCard 内 LLM API Key 输入框旁有 Save 按钮，billing key 同构。设计上要求用户"输入完点 Save"，但 Settings 是单实例单 footer Save 心智模型，per-row Save 按钮与 footer Save 双轨反而让用户困惑（不点 per-row Save 是否丢？点完是否需要再点 footer Save？）。provider-card 的 `setLlmApiKey("")` 在 Save 后清空输入框，但其它字段（label、enabled、base_url 等）每次 onChange 直调 `invoke`——UI 不一致。

### 触发 4：dot-separated 文件名 vs 项目 kebab-case 约定

用户指定 `src/shared/stores/app.store.ts`（dot-separated），与 ADR-0010 的 kebab-case 约定（`llm_providers.ts` → `llm-providers.ts` 修复）冲突。这是 ADR-0010 后的**第二例命名例外**，需在 ADR-0010 的白名单里追加说明。

## Decision

### A. 引入 `src/shared/stores/app.store.ts`（createStore 全局桥接层）

```ts
// src/shared/stores/app.store.ts
import { createStore } from "solid-js/store";
import type { Settings } from "../lib/types";

// createStore 包装 settings 字段（不是包整个 Settings 对象，理由见 B）
const [settings, setSettings] = createStore<{ value: Settings | null }>({ value: null });

export const appStore = {
  state: settings,  // reactive read
  set: async (patch: Partial<Settings>): Promise<void> => {
    // merge into state.value
    // debounced 500ms auto-flush via updateSettingsBridge
  },
  forceFlush: async (): Promise<void> => {
    // 跳过 debounce，立即 IPC
  },
  refresh: async (): Promise<void> => {
    // 重新从后端读，覆盖 state.value
  },
};
```

API surface 只有 4 个：`state`（reactive read）/ `set(patch)` / `forceFlush()` / `refresh()`。

- `set(patch)` —— merge patch 到 `state.value`，debounce 500ms 后调 `updateSettingsBridge(patch)` IPC。
- `forceFlush()` —— footer Save 调用，**跳过 debounce** 立即 IPC。UI 表现为"我点 Save，状态立刻进磁盘"。
- `refresh()` —— 启动时 + 手动重新加载（init / focus 兜底）。
- `state` —— createStore proxy，组件 `appStore.state.value?.theme` 形式读，reactive。

### B. 启动时 eager load

`src/index.tsx` 在 mount RouterProvider 前 `await appStore.refresh()`：

```tsx
const root = document.getElementById("root")!;
const initialSettings = await appStore.refresh();
render(() => <RouterProvider initialSettings={initialSettings} />, root);
```

chat feature 启动时即可读 `default_llm_provider_id`，无须"still loading" 占位状态。

### C. LLM API Key / Billing API Key 合并为单一 `Provider.api_key`

```ts
// src/shared/lib/types.ts
interface Provider {
  id: string;
  label: string;
  enabled: boolean;
  api_key: string;  // 明文，单字段，Settings JSON 一部分
  llm: {
    default_model: string;
    base_url: string;
    api_type: "anthropic-messages";
    models: ModelMeta[];
    models_endpoint: string;
  };
  billing?: {
    kind: "balance" | "plan_quota";
  };
}
```

- 删除 `Provider.llm.llm_api_key_ref` 字段
- 删除 `Provider.billing.billing_api_key_ref` 字段
- 新增顶层 `Provider.api_key: string` 字段
- billing adapter 复用同一 key（fetch 时 `Authorization: Bearer <Provider.api_key>`）
- `Settings::Default` 默认 `api_key: ""`
- `Settings::sanitized()` 不再过滤 api_key（反正就在里面）

### D. 完全删除 Tauri store key 路径与 IPC

- 删除 Tauri store 路径 `llm_providers/<id>/api_key` 和 `billing/<id>/api_key`
- 删除 IPC 命令：`set_llm_key` / `set_billing_key` / `has_llm_key` / `get_llm_key` / `delete_provider_keys`
- 删除 `src/features/settings/lib/llm-providers.ts` 整个文件（`LLMProviderService` + 3 bridge 函数 `setApiKeyForProvider` / `hasApiKeyForProvider` / `getApiKeyForProvider`）
- 删除 `LLMProvider` 类型别名（合并到 `Provider`）
- 删除 `src/shared/lib/tauri.ts` 里的 key bridge functions
- 删除 `provider-card.tsx` / `workspace-card.tsx` 里的直接 `invoke` 调用

### E. dot-separated 文件名例外

`app.store.ts` 沿用 Pinia / Vuex 风格的 dot-separated 命名，**不**改为项目 kebab-case `app-store.ts`。在 ADR-0010 的"5+1 子目录白名单"段追加"dot-separated 例外清单"：

> 已知例外：
> 1. `src/features/settings/lib/llm-providers.ts`（snake_case → kebab-case，V1.5 修复）
> 2. `src/shared/stores/app.store.ts`（dot-separated，V1.7+ 用户指定）

### F. UI 改造

- **ProviderCard** —— 删除 2 个 per-row API Key Save 按钮；删除 onChange 里的直接 `invoke`；input onInput → `appStore.set({ providers: [{ ...p, api_key: newKey }] })`；其它字段（label / enabled / base_url / models / billing.kind）同样走 `appStore.set()`。
- **WorkspaceCard** —— onInput / onChange → `appStore.set({ workspaces: [...] })`，不走直接 `invoke`。
- **SettingsPage** —— 删除 local `draft` signal；删 `save()` 函数；footer Save 按钮 → `appStore.forceFlush()`；其它 tab（app / window / billing / advanced）的 input 同样走 `appStore.set()`。
- **ProviderCard / WorkspaceCard** 内部不再持有 `setLlmApiKey` / `setBillingApiKey` 等本地 input signal（直接绑 `props.provider.api_key` + onInput 调 `appStore.set`，或保留本地 signal 仅作 controlled input 缓冲）。

## Considered Options

### A. 维持 Tauri store 双 key 路径 + per-row Save（拒绝）

拒绝理由：触发 1/2/3 全部不解决；架构债 + UI 噪声 + 单 user 过度设计 全部保留。

### B. 引入 app-store 但保留 Tauri store 双 key（拒绝）

拒绝理由：app-store 解决触发 1（invoke 违规），但触发 2/3 不解决；key 双写同步逻辑增加而无收益。

### C. 引入 app-store + 单一 api_key 进 Settings JSON（采纳）

触发 1/2/3 全部解决；接受明文 key 存盘的安全代价（见 Consequences 负面）。

### D. 单一 api_key 进 Tauri store 单路径（`providers/<id>/api_key`）（拒绝）

拒绝理由：保留 Tauri store 路径 → 保留 IPC 边界 → `set(patch)` 还是不能直接写 key（要单独 setLlmKey 通道），触发 1 部分回潮；security 与选项 C 等价（keyring 不再用），架构复杂度更高。

### E. Node sidecar 跑加密 key management（拒绝）

V1 范围外，与 ADR-0002 字面冲突（同 ADR-0013 选项 A 否决 Node sidecar 的同样理由）。

### F. 强制 flush only（无 debounce）（拒绝）

debounce 解决 typing 触发的 N 次 IPC；footer Save 跳过 debounce（forceFlush）提供显式 flush 入口。强制 flush only 让 typing 体验极差（每键一次 IPC）。

## Consequences

### 正面

- ProviderCard / WorkspaceCard 不再直接 `invoke`，符合 ADR-0003 的 UI ↔ Effect 边界
- `src/features/settings/lib/llm-providers.ts` 整个文件删除（~99 行 + 它的 test 文件）
- 4 个 IPC 命令删除（`set_llm_key` / `set_billing_key` / `has_llm_key` / `get_llm_key` / `delete_provider_keys` 共 5 个）
- Settings UI 单一 Save 心智模型（footer Save 唯一入口）
- typing system_prompt 等连续字段通过 500ms debounce 合并为 1 次 IPC
- chat feature 可读 `appStore.state.value?.default_llm_provider_id` 响应设置变化（V1.7+ 之前只能 init 时读一次）
- 单 api_key 字段 = 单 Tauri store 路径删除 + 单 schema 字段简化

### 代价

- **明文 key 存盘（安全回归）**：`Provider.api_key` 落在 `%LocalAppData%\codeman-agent\settings.json`，任何人能读该文件即可拿到 key。V1 是单机单 user 威胁模型，可接受；如未来需 OS 级密钥管理（keyring / Windows Credential Manager）需重做此 ADR。**这是 hard to reverse + surprising without context，必须 ADR 记录**。
- Settings 文件体积微增（每个 provider 多 ~50 字节 api_key），无性能影响。
- debounce 500ms 的可见延迟：用户改完字段 500ms 后才进磁盘。若 500ms 内断电，丢失。但 footer Save 跳过 debounce 兜底。
- dot-separated 文件名 `app.store.ts` 是 ADR-0010 后的第二例命名例外，需在 AGENTS.md 标记。
- 需更新现有 4 个 ADR 引用（ADR-0012 的"Provider.llm" / "Provider.billing" shape 描述，CONTEXT.md 的"LLM API Key" / "Billing API Key" 词汇表与 "API 密钥永不进入此文件" 段）。

### 未变

- ADR-0002（pi-mono agent runtime）—— runtime 不动
- ADR-0011（anthropic-messages-only）—— 协议层不动
- ADR-0012 的"统一 Provider schema" —— providers[] 数组 + llm 必选 + billing 可选 不变；本 ADR 是其延伸（简化 key 子结构），不是逆转
- ADR-0013（V2 file IO）—— file tool 不动；workspace 沙箱不动
- Settings 持久化路径（Tauri store + SQLite）—— 不变；只是 key 不再单独走 Tauri store
- pi-mono runtime 仍跑 webview（key 现在 webview 可读，无 IPC 跨进程）
- 单 main 窗口 + TanStack Router + Effect-TS 逻辑层

## Timing

- **V1.7+ sprint**：起 feature branch，落地本 ADR
- 顺序：先落 ADR + CONTEXT.md 词汇表 → 写 app.store.ts + 单测 → 改 settings/lib 与 components → 改 src-tauri → 改 E2E → commit
- 不影响 V2 file IO 路线（file tool 不接触 api_key，独立）

## References

- ADR-0003（Effect-TS 逻辑层）—— 本 ADR 修其 UI ↔ Effect 边界的违规
- ADR-0010（5+1 子目录白名单）—— 追加 dot-separated 例外
- ADR-0012（Unified Provider schema）—— 本 ADR 是其延伸（简化 key 子结构）
- ADR-0013（V2 file IO）—— 与本 ADR 独立
- CONTEXT.md 词汇表 —— 需更新 "LLM API Key" / "Billing API Key" / "Secret" / "Settings 与状态" / "Provider.llm" / "Provider.billing" / Settings schema
- grill-with-docs session 2026-06-20 —— 决议依据