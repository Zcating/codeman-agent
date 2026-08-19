# 0050 — Settings/Provider 页面优化:预设库 + 手风琴列表 + 显式保存

- **Status**: accepted
- **Date**: 2026-08-03
- **Scope**: `src/renderer/src/features/settings/**`(llm-section / provider-card / add-provider-dialog / schemas / settings-saver / mock-provider-template)+ `src/renderer/src/shared/{stores/app.store.ts, lib/types.ts}` + `src/main/features/settings/{schemas.ts, sanitize.ts}` + `docs/adr/0047-...md`(D1.5 预设方向落地)+ `CONTEXT.md`(Provider 词条)
- **Supersedes**: 中 "保留 Agent compat API、createProvider 仅作 Model 目录工厂" 方向不变;本 ADR 在此之上做 **UI/UX 层**优化,不逆转任何 runtime 决策
- **Related**:
  -  — `Provider.llm` shape
  -  — `Provider.apiKey` 明文落 settings.json
  -  — Default Model Invariant
  -  — ProviderCard 走 TanStack Form
  -  — schema 双实现设计债
  -  — setting/provider 走 PI createProvider()
  - [CONTEXT.md](../../CONTEXT.md) — `Provider` / `Provider.llm` / `Default Model Invariant` 词汇表

## Context

### 触发 1: 添加 provider 全靠手填,没有厂商预设

`add-provider-dialog.tsx` 现状:用户选 real/mock → 手填 label / baseUrl / defaultModel / apiKey / enabled。`baseUrl`、`modelsEndpoint`、模型清单都要手动输入,对不熟 API 形态的用户门槛高。业界(CC-Switch, `farion1231/cc-switch`, MIT)用**内置预设模板库**:精选 20 个主流厂商预设硬编码在前端 TS 常量,用户点选厂商后表单自动填充 `baseUrl`/模型清单等,只需补 apiKey。

### 触发 2: provider 列表是单列全宽卡片堆叠,无主从结构

`llm-section.tsx` 现状: `<For>` 循环渲染全宽 `ProviderCard`,每张卡同时是展示 + 编辑(6+ 字段平铺)。provider 多时页面冗长;默认 provider(`defaultLlmProviderId`)在 UI 上无任何可视化标记与切换入口;没有"浏览 → 定位 → 编辑"的主从层级。

### 触发 3: 保存语义混乱

现状:`settingsSaver.scheduleSave()`(500ms debounce)+ `LlmSection` 页面又有显式 "Save" 按钮,两套并存。改动即时进 store、debounce 落盘,用户无法"编辑完再统一提交",也没有未保存改动的视觉反馈。

### 触发 4: `enabled` 字段是死概念

`Provider.enabled`(schema + provider-card checkbox)存在,但产品语义上 provider 只有"存在即可用"——没有"禁用某 provider"的真实场景。`defaultLlmProviderId` 才是真正决定"用哪个"的字段。`enabled` 增加无意义的 UI 开关和状态组合("默认但禁用")。

### 触发 5: 模型元数据数据在但不可见

`ModelMeta` 有 `contextWindow` / `deprecated` / `thinking` 字段,但 UI 只暴露 defaultModel 下拉 + Refresh models 按钮。模型列表靠 `fetchModels`(GET modelsEndpoint)拉取,无法离线/无网络时使用,也无法展示 deprecated 标记。

## Decision

### D1: 预设库(移植 CC-Switch `claudeProviderPresets.ts`)

- **D1.1 数据来源**:移植 CC-Switch(`farion1231/cc-switch`, MIT)的 `src/config/claudeProviderPresets.ts`,精选 20 个主流厂商预设。保留 MIT 版权声明(单独 header 注释 + `docs/` 中注明来源)。
- **D1.2 适配转换**:移植时把 `settingsConfig.env` 形式转换为 codeman `Provider` 结构(`baseUrl` / `apiKey`(空)/ `defaultModel` / `models`(硬编码清单)/ `modelsEndpoint`)。存为 codeman 原生结构的 JSON/TS 常量文件,运行时零转换。
- **D1.3 模型清单预填**:每个预设直接带一份 `models: ModelMeta[]`(厂商已知模型),**不通过 models API 运行时拉取**。`defaultModel` 预设为清单中一个。
- **D1.4 modelsEndpoint**:已知厂商填标准 URL,其余留空。字段保留在 schema(现状已有),但不作为模型列表主要来源。
- **D1.5 交互**:`add-provider-dialog` 打开即 **tag 云**(精选 20 个主流厂商 tag 平铺,可滚动),点选 → 进入完整表单(已预填 baseUrl/models/modelsEndpoint,用户补 label + apiKey)→ 保存。底部保留"自定义 provider"入口(空表单)。
- **D1.6 无来源区别**:预设来的 provider 与自定义 provider 落盘后无区别,不新增 `source` 字段。
- **D1.7 设计依据**:用户在拷问阶段先选"精选 + 可扩展",后改为"全量移植 claudeProviderPresets.ts"(A),实施时落实为精选 20 个主流厂商(Claude/OpenAI/DeepSeek/MiniMax/Kimi/Gemini/通义/豆包/OpenRouter/SiliconFlow/智谱 等)+ 可扩展结构。数据源来自 CC-Switch 预设,只收录主流厂商,避免维护 60+ 条可能过期的 baseUrl;结构上纯数组加记录即可追加新厂商。

### D2: 手风琴列表(主从式,内嵌展开)

- **D2.1 布局**:`llm-section` 改为手风琴列表。收起行 = label(厂商名)· 备注 + 默认星标 + 模型数 badge("N models")+ hover 删除按钮。**无搜索框**(provider 数量级 1~10,平铺可见)。
- **D2.2 单选展开**:同一时刻只有一行展开,点另一行时当前收起。展开区 = 编辑表单。
- **D2.3 展开区分区**(从上到下):
  - **基础配置**:备注(comment)/ baseUrl / apiKey / 测试连接按钮(分区底部独立按钮,非 apiKey 旁)
  - **模型**:defaultModel 下拉 + 模型表格编辑器(id / label / contextWindow / deprecated / thinking,可增删行)—— **无 Refresh models 按钮**(模型靠预设硬编码 + 手动编辑)
  - **危险区**:删除 provider(弱化样式)
  - 底部:**保存 / 取消** 按钮(显式提交)
- **D2.4 行内删除**:hover 删除按钮 + 展开区危险区删除按钮并存。

### D3: 默认 provider(星标)

- **D3.1 星标设默认**:点击星标设 `defaultLlmProviderId`。允许取消(取消后默认落到列表第一个 provider)。删除默认 provider 时默认自动转移到剩余第一个;删除光则置空(chat 走已有 `no_provider` CompactionFailed 降级路径)。
- **D3.2 聊天界面不改**:chat 无 provider 切换入口(现状即无),保持仅 settings 生效。聊天切换入口单独立项,不在本次范围。

### D4: 数据模型变化

- **D4.1 删 `enabled`**:主/渲染端 schema 删 `Provider.enabled` 字段,provider-card 的 checkbox 删除,相关测试同步更新。**存量数据**:sanitize 时丢弃该字段(不写迁移逻辑)。
- **D4.2 增 `comment`**:`Provider.comment?: string`(可选),主/渲染端 schema 同步。收起行显示 "label · comment",展开区"备注"输入框可编辑。预设预填时留空。
- **D4.3 删 real/mock 标签**:UI 不显示 real/mock 区分(靠 baseUrl 或 name 区分)。add-provider-dialog 的 real/mock radio 保留(决定 baseUrl 模板与 mock server 地址),但列表无标签。

### D5: 保存语义(全页面显式保存)

- **D5.1 去 debounce**:`llm-section` 移除 `settingsSaver.scheduleSave()` 自动保存;所有改动(星标/删除/展开区编辑)攒在本地,页面级 **Save 按钮统一提交**。
- **D5.2 脏标记**:有未保存改动时 Save 按钮显示未保存状态(视觉提示,如高亮/圆点)。切换分区不拦截(靠脏标记提示)。
- **D5.3 关窗口拦截**:检测到未保存改动时,窗口 close 拦截弹确认("有未保存的改动,关闭将丢失。关闭 / 取消?")。
- **D5.4 展开区保存/取消**:展开区表单有独立"保存/取消"按钮 —— 保存写本地 pending 状态(合并到未保存改动集),取消丢弃本次编辑。最终由页面级 Save 统一落盘。

### D6: 测试连接

- **D6.1 仅手动触发**:编辑面板"测试连接"按钮(基础配置分区底部),点击才对 baseUrl 发请求验证(baseUrl + apiKey 组合,复用 fetchModels 的请求路径或轻量 ping)。
- **D6.2 反馈**:成功 → 内联绿标 + "连接成功";失败 → 内联红标 + 错误信息。结果保持直到下次测试,不自动消失。

### D7: 其他不变量(沿用现状)

- `Default Model Invariant`:`defaultModel ∈ models[].id ∪ {""}` 保留,在所有写路径强制。
- label 允许重复(同厂商多 key 靠 comment 区分),id 唯一。
- 不做 per-场景多默认(CC-Switch 式 appType)—— codeman 无多工具语境,`defaultLlmProviderId` 全局唯一。

## Consequences

- **正面**:添加 provider 从"全手填"变为"选厂商 + 填 key";列表可快速浏览定位;保存语义统一(显式 + 脏标记);enabled 死概念清除。
- **负面**:移除 debounce 自动保存,用户忘记点 Save 时改动丢失(靠脏标记 + 关窗拦截缓解);预设库 精选 20 个主流厂商需维护(但独立文件,追加一条记录即可);模型清单不再自动同步最新(手动编辑 + 预留 modelsEndpoint)。
- **风险**:预设移植 精选 20 个主流厂商的 baseUrl 可能过期(CC-Switch 本身在维护,但本仓库不自动同步);模型硬编码清单会落后于厂商发布。缓解:模型表格可手动增删;modelsEndpoint 保留字段。

## Verification

- 主/渲染端 schema 无 `enabled`,有 `comment`。
- `add-provider-dialog` 打开显示 tag 云,点选厂商进入已预填表单。
- `llm-section` 手风琴列表:收起行(名称·备注 + 星标 + 模型数 badge)、单选展开、行内 hover 删除。
- 展开区:分区(基础/模型/危险区)+ 保存/取消 + 测试连接按钮。
- 页面 Save 统一提交;脏标记在未保存时可见;关窗口有未保存拦截。
- 存量 settings.json 含 enabled 的 provider 加载后 enabled 被丢弃,不报错。
- 测试连接成功/失败内联反馈正确。
- 全量 `vp run typecheck` + settings 相关测试通过。
