# ADR 0008 — Provider Config and API Key in pi ModelRuntime

**Status**: accepted · **Date**: 2026-08-20 · **Scope**: codeman-agent V4 provider 配置 + 密钥存储
**Related**: ADR 0001 (V4 总纲 D8), ADR 0006 (feature mapping — settings)

## Context

V3 provider 配置与 API key 存储：

- **数据结构**：V3 `Provider = { id, label, comment?, apiKey, llm: { defaultModel, baseUrl, apiType, models, modelsEndpoint } }` 数组，存于 `electron-store settings.json`
- **API key 明文存盘**（per V3 ADR-0015）：`%LocalAppData%\codeman-agent\settings.json`（路径由 `app.setPath('userData', ...)` 锁定）
- **Provider Preset**：60+ 厂商硬编码清单（baseUrl + 默认 models），用户在 add-provider 对话框选预设
- **Provider 模型自动拉取**：通过 `modelsEndpoint` URL 调用 + 解析
- **刷新**：appStore.refreshProviderModels(id) → IPC → ProviderService.fetchModels
- **默认模型不变量**：`Provider.llm.defaultModel` ∈ `Provider.llm.models`（per V3 ADR-0016）

pi-coding-agent `ModelRuntime`：

- `ModelRuntime.create({ configPath })` 初始化，从 `auth.json` + `models.json` 读 provider + 模型目录
- `auth.json`：API key 存储
- `models.json`：模型目录（含每个 provider 的 models 列表）
- `ModelRuntime` 暴露给 extensions：sync API 查询 provider + 模型
- `SettingsManager` 独立：`SettingsManager.create({ configPath })` 管理全局 + project-local settings

V4 provider + API key 全部由 pi 的 ModelRuntime 接管。

### D1. 删 electron-store settings.json 中的 providers 字段

- **删除词汇表词条**：`Provider Preset`、`Provider (V3 schema)`、`ModelMeta`、`Models Endpoint`、`Default Model Invariant`（部分）
- **删除 src/main/features/settings/` 中的 providers schema 定义**（electron-store JSON schema）
- **删除 src/main/ipc.ts` 中 providers 相关的 IPC handlers**（V3 的 `get_providers` / `update_providers` / `delete_provider` / `refresh_models` 等）
- **删除 src/renderer/src/features/settings/` 中的 provider 配置 UI**（`ProviderCard` / `add-provider-dialog` / `preset-list`）

### D2. API key 迁 pi auth.json

V4 API key 存储在 `~/.pi/auth.json`（由 `ModelRuntime.create({ configPath })` 指定路径）。仍是明文——pi 无加密机制，与 V3 ADR-0015 的"V1 单机单用户威胁模型下接受明文"一致。

V3 ADR-0015 supersede：`settings.json providers[].apiKey` 删除，迁到 `auth.json`。

### D3. Provider Preset 整体删除

V3 60+ 厂商硬编码预设（`providerPresets.ts`，移植自 CC-Switch）删除。V4 由 pi `ModelRuntime` 自带的 provider 目录取代（pi 自带 30+ providers with auto-refreshed model catalogs）。

### D4. SettingsManager 接管非 provider settings

V3 electron-store 还存：theme / window / systemPrompt / conversations / userLanguage / startAtLogin 等。

V4 这些字段迁到 pi 的 `SettingsManager.create({ configPath })`：

- `theme`: light / dark / system
- `window`: rememberPosition / rememberSize / defaultSize / minSize
- `systemPrompt`: 用户默认 systemPrompt
- `userLanguage`: zh-CN / en-US
- `startAtLogin`: boolean
- `contextFiles`: glob 模式数组（per ADR 0007 DefaultResourceLoader）

V3 `electron-store` 库整体删除。

### D5. Settings UI 重写

V4 Settings 页面 UI：

- Provider 配置：通过 IPC 调用 `window.codeman.pi.listProviders()` + `addProvider()` + `deleteProvider()` + `refreshModels()`（这些 IPC handler 包装 ModelRuntime API）
- 通用设置（theme / window / systemPrompt / userLanguage / startAtLogin）：通过 IPC 调用 `window.codeman.pi.getSettings()` + `updateSettings()`（包装 SettingsManager API）
- 不再有 provider preset 选择 UI——pi 的 provider 目录自动加载

### D6. 词汇表清理与新增

V3 `CONTEXT.md` 词汇表删除：

- `Provider Preset`
- `Provider (V3 schema)` — 重新定义为 pi provider
- `ModelMeta (V3 schema)` — 重新定义为 pi ModelEntry
- `Models Endpoint` — 由 pi provider catalog 自动管理
- `Default Model Invariant` — 由 pi Runtime 内部保证
- `Settings (V3 electron-store schema)` — 重新定义为 pi SettingsManager
- `App Store (V3 renderer app store)` — 重写为 pi SettingsManager IPC 桥
- `API Key (V3 明文 settings.json 存储)` — 重新定义为 pi auth.json 存储
- `Secret` — pi 无 Secret 类型，删除

V4 新增：

- `Pi ModelRuntime`（provider + auth + model catalog）
- `Pi Auth.json`（API key 明文存储，路径 `~/.pi/auth.json`）
- `Pi SettingsManager`（全局 + project-local settings）
- `Pi Provider Catalog`（pi 自带 30+ providers with auto-refreshed model catalogs）

## Considered

#### 选 1（已选）：迁到 pi ModelRuntime
provider + API key 全部由 pi ModelRuntime 接管，settings 由 pi SettingsManager 接管。electron-store 删除。

#### 选 2：留 electron-store + 注入自定义 CredentialStore
API key 继续存 settings.json，但通过 pi `ModelRuntime.create({ credentialStore })` 注入自定义 store。问题：electron-store 与 ModelRuntime 双源，且无法用 pi 的 provider catalog 自动加载。**不选**。

#### 选 3：safeStorage 加密
API key 用 Electron `safeStorage` 加密（OS keychain）。安全最高但改动最大（迁移旧明文 key + pi ModelRuntime 仍需桥接）。**不选**。

## Consequences

### Positive

- **Provider 目录由 pi 维护**：30+ 内置 providers 自动支持，无需 V3 自建 providerPresets.ts
- **模型自动刷新**：pi ModelRuntime 自动从 provider endpoint 拉取最新模型列表
- **代码量减少**：V3 provider preset + provider schema + provider IPC handlers + add-provider-dialog 全部删除
- **API key 路径标准化**：从 `%LocalAppData%\codeman-agent\settings.json` 迁到 `~/.pi/auth.json`

### Negative

- **API key 仍是明文**：从 V3 settings.json 迁到 pi auth.json（位置变，安全性同）
- **V3 Provider schema 删除**：如有第三方依赖 V3 settings.json 中 providers 数组的代码（CI / 备份工具），需更新
- **electron-store 删除**：V3 中依赖 electron-store 的其它模块（如 V3 的 `update_settings` IPC handler）需改用 SettingsManager

### Neutral

- **API key 在 Settings UI 中仍可编辑**：UI 通过 IPC 桥接 pi ModelRuntime
- **Provider 切换逻辑保留**：用户在 Settings 选 defaultProvider，传给 `pi-runtime.createSession({ providerId })`

## Cross-file impact

| 路径 | 变化 |
|---|---|
| `src/main/features/settings/` | **整体重写**：删 providers schema；保留 schema 作 SettingsManager 包装 |
| `src/main/ipc.ts` | 删除 V3 `get_providers / update_providers / delete_provider / refresh_models / get_settings / update_settings` IPC handlers；新增 pi 包装 handlers |
| `src/renderer/src/features/settings/` | 重写：Provider 配置改走 pi ModelRuntime IPC；通用设置改走 pi SettingsManager IPC |
| `src/renderer/src/features/settings/components/provider-card.tsx` | 重写：调 `window.codeman.pi.updateProvider(...)` |
| `src/renderer/src/features/settings/components/add-provider-dialog.tsx` | **删除**（V4 改用 pi provider catalog 自动加载） |
| `src/renderer/src/features/settings/lib/provider-presets.ts` | **删除** |
| `package.json` | 移除 `electron-store`；新增 `@earendil-works/pi-coding-agent` |
| `electron-builder.yml` | 保留路径配置（settings.json 路径不再使用，但 userData 路径仍需设置） |
| `CONTEXT.md` 词汇表 | 删除：`Provider Preset / Provider (V3 schema) / ModelMeta / Models Endpoint / Default Model Invariant / Settings (V3 schema) / App Store / API Key / Secret`；新增：`Pi ModelRuntime / Pi Auth.json / Pi SettingsManager / Pi Provider Catalog` |

## Reversibility

低可逆：

- 恢复 electron-store settings.json + V3 provider schema 需重写 `src/main/features/settings/` + V3 provider UI
- 恢复 V3 Provider Preset 需重写 `provider-presets.ts`
- API key 回滚到 settings.json 需写迁移脚本（V4 已有 key 在 auth.json）

预计回滚耗时：2 周。

## References

- pi-coding-agent ModelRuntime：`create({ configPath })` + auth.json + models.json
- pi-coding-agent SettingsManager：`create({ configPath }) / inMemory()`
- pi-coding-agent ModelRegistry：sync facade 供 extensions 用
- pi 自带 30+ provider 目录
- V3 ADR-0015（API Key 明文 settings.json）：supersede
- V3 ADR-0013（unified provider schema）：不追溯，supersede
- V3 ADR-0016（app store and key simplification）：不追溯，supersede