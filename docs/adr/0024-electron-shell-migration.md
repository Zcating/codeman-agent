# 0024 — Electron Shell Migration (V3)

**Status**: accepted · **Date**: 2026-07-01 · **Scope**: codeman-agent V3 客户端壳（桌面 runtime 层）
**Supersedes**: ADR-0001（Tauri 2 壳决策；其中 Solid.js 决策**保留**，因 Solid 仍为 UI 框架）
**Related**: ADR-0003（Effect-TS 逻辑层，不变）、ADR-0007（单窗口 + TanStack Router，不变）、ADR-0015（API Key 明文存 Settings JSON，路径不变）、ADR-0016（service-in-store，不变）、ADR-0017（Queue-based Runtime，不变）、ADR-0018（统一日志，不变）、ADR-0019（per-run transient Agent，不变）、ADR-0023（codeman-* + Ark UI + Workspace 治理，路径细节失效但决策保留）

## Context

V2 形态由 ADR-0001 锁定：桌面壳 = **Tauri 2 (Rust) + Solid.js + Vite**。当时拒绝 Electron 的核心理由（ADR-0001 §Why not Electron）：

> Electron — 每用户附带 Chromium，对单一小型 widget 来说安装体积和启动时间都受损。

该理由的隐含前提：codeman-agent V0/V1 是 ~280×100 always-on-top 浮动 widget（per ADR-0005），Chromium runtime 是不可接受的体积成本。

**V1.5（ADR-0007）已废弃该形态**：codeman-agent 转为单个普通任务栏主窗口（800×600 default，最小 600×400，OS 原生装饰）。widget 形态的「小体积优先」论据不再适用。V1.5 起 Electron 的体积 / 启动延迟劣势**已不是阻塞因素**。

V2 → V3 dogfooding 期间，**WebView2 + Tauri 2 的 Web API 兼容性**成为阻塞（具体表现为部分现代 Web API 在不同 Windows 环境的 WebView2 runtime 上行为不一致；细节属于 V2 内部 issue tracker，不在本 ADR 复述）。ADR-0001 拒绝 Electron 的论据在 V3 已不成立，且 Tauri 壳的边际收益（更小的 renderer runtime）已被上述阻塞覆盖。

需要决策：**壳是否从 Tauri 2 迁至 Electron？** 范围与代价必须明确——否则 ADR 不可逆，对未来维护者不可解释。

## Decisions

### D1 — 壳迁移范围：**仅换壳**（最小动作路径）

| 维度 | V2 (Tauri) | V3 (Electron) | 变化？ |
|---|---|---|---|
| UI 框架 | Solid.js + TS | Solid.js + TS | 不变 |
| 样式 | Tailwind v4 + cva | Tailwind v4 + cva | 不变 |
| 逻辑层 | Effect-TS | Effect-TS | 不变 |
| Agent runtime | pi-mono (`@mariozechner/pi-ai` + `pi-agent`) | pi-mono | 不变 |
| 路由 | TanStack Router (code-based) | TanStack Router | 不变 |
| 持久化 schema | SQLite + FTS5 (sqlx) | SQLite + FTS5（驱动层迁移） | **schema 不变，驱动层重写** |
| Settings schema | `src-tauri/src/settings.rs` + `src/shared/lib/types.ts` 镜像 | `electron/main/settings-schema.ts` + 同 TS 镜像 | **schema 不变，宿主语言从 Rust → TS** |
| File sandbox | Rust `std::fs::canonicalize` 检查 | Node `fs.realpath.native` 检查 | **同语义，宿主语言迁移** |
| 桌面壳 | Tauri 2 (Rust) | Electron (Node main + Chromium renderer) | **变** |
| 构建工具链 | `vite-plus` (vp) | `electron-vite` | **变** |
| 打包格式 | MSI + NSIS（Tauri bundler） | MSI + NSIS（electron-builder） | **变驱动，输出格式一致** |
| IPC 桥接文件 | `src/shared/lib/tauri.ts` | `src/shared/lib/ipc.ts` | **变文件名 + 内部实现** |

**拒绝**选项：(a) 顺带把 Solid.js 换成 React；(b) 顺带丢 Effect-TS 换成原生 async/await；(c) 重新评估 pi-mono 是否保留。以上三个选项**每一个都各自独立 200+ 文件改动**，违反"最小动作"。Solid.js / Effect-TS / pi-mono 在 V3 不在评估范围内。

### D2 — File Sandbox：保留同一语义，宿主语言迁移

File Tool（`read_file` / `write_file` / `edit_file` / `search_files` / `delete_file`）的 sandbox 边界 = workspace `root_path`。Agent 调工具 → IPC 到 Main process → Main process canonicalize path → 不在任何 workspace root 内则返回 `SandboxViolation` 错误。

V3 实现细节：

- `fs.realpath.native(path)` 替代 `std::fs::canonicalize`。语义对齐（解析符号链接 + 绝对路径）。
- Main process handler 必须在 `realpath` 之前**不**信任 renderer 传入的 `path`（renderer 是 Chromium，可被 DevTools 操纵）。
- 错误返回契约不变：`SandboxViolation` 作为 `AppError` 的判别联合体变体（与 V2 一致，per ADR-0023 D8-W）。
- 拒绝"信任 renderer"的简化（无 canonicalize 检查）——安全等级不可降。

### D3 — Tauri 插件等价物清单（8 → 8）

| V2 Tauri 插件 | V3 Electron 等价物 | 备注 |
|---|---|---|
| `tauri-plugin-store` | `electron-store` | Settings JSON 持久化；schema 与 `sanitize()` 不变 |
| `tauri-plugin-log` | `electron-log` | 日志轮转；统一日志架构 (per ADR-0018) 不变 |
| `tauri-plugin-notification` | Electron 内置 `Notification` | 系统通知，无新依赖 |
| `tauri-plugin-autostart` | `app.setLoginItemSettings` | 开机自启，无新依赖 |
| `tauri-plugin-window-state` | `electron-window-state` | 窗口位置/大小记忆 |
| `tauri-plugin-opener` | `shell.openExternal` | URL 在默认浏览器打开，无新依赖 |
| Tauri 核心（窗口/菜单） | Electron `BrowserWindow` + `Menu` + `Menu.setApplicationMenu` | `File → Quit (Ctrl+Q)` 行为不变 |
| ~~`tauri-plugin-global-shortcut`~~ | ~~不引入 Electron `globalShortcut`~~ | V1.5 已禁用热键（per ADR-0007）；不重新引入 |
| ~~`tray-icon`~~ | ~~不引入 `Tray`~~ | V1.5 已废弃托盘（per ADR-0007） |

每个等价物都是 Electron 生态**主流选择**；不做 all-in-one 三方库（如 electron-toolkit）以避免单一依赖风险。

### D4 — Settings JSON 路径：显式锁定到 V2 同路径

V2 路径：`%LocalAppData%\codeman-agent\settings.json`（`tauri-plugin-store` 默认）。

Electron 默认 `app.getPath('userData')` 在 Windows 返回 `%APPDATA%\<productName>\`（即 `%APPDATA%\Roaming\codeman-agent\`）——**与 V2 不同**。

V3 决策：Main process 启动时立即调用 `app.setPath('userData', '%LocalAppData%\\codeman-agent')`（Electron 提供路径替换 API；该调用必须在 `app.whenReady()` 之前完成以确保 electron-store 等库读到正确 cwd）。

**拒绝**：(a) 写一次性迁移代码将 V2 settings 复制到 V3 路径——增加 bug 表面、QA 负担；(b) 让老用户在 V3 重输 API key——V1.7+ 后 API key 明文存盘，重输是负面 UX。

拒绝 (a) 的原因：路径锁定后，V2 用户升级 V3 后 settings.json / SQLite 数据库都还在 `%LocalAppData%\codeman-agent\`，electron-store + better-sqlite3 直接打开即可，**无迁移代码路径**。这是最小动作 + 零数据丢失的最优解。

### D5 — 构建 / 打包工具链：`electron-vite` 取代 `vite-plus`

`vite-plus` (`vp`) 是 Vite 的封装，V2 期间承载 frontend 构建 + Tauri 启动脚本。V3 改为 `electron-vite`（`https://electron-vite.org`）：

- 一套配置同时构建 main + preload + renderer 三个 entry。
- `electron-vite dev` 启动 Vite renderer HMR + Main process 重建 + Electron 应用启动（单命令）。
- `electron-vite build` 产出三进程的 production bundle。
- 打包走 `electron-builder`（MSI + NSIS，与 V2 输出格式对齐）。

**package.json scripts 映射**：

| V2 (`vp run ...`) | V3 (`electron-vite ...` / `electron-builder ...`) |
|---|---|
| `vp run tauri:dev` | `electron-vite dev` |
| `vp run tauri:build` | `electron-vite build && electron-builder --win nsis --x64` |
| `vp run tauri:test` | `vitest run --project main`（vitest Node mode） |
| `vp run test` (frontend vitest) | `vitest run`（不变） |
| `vp run e2e` (Playwright) | `playwright test`（不变；launcher 改为 `_electron.launch`） |

`vite-plus` 与 `electron-vite` 不可共存；v3 移除 `vite-plus` 依赖。

### D6 — IPC 桥接：文件重命名 + 实现重写

**文件重命名**：`src/shared/lib/tauri.ts` → `src/shared/lib/ipc.ts`。

CONTEXT.md "IPC" 词条同步更新（已 inline 完成）：
- V2 描述：`Tauri 命令桥接。Rust 端命令注册在 src-tauri/src/lib.rs::invoke_handler!；TS 端包装在 src/shared/lib/tauri.ts（Service Tag + Live Layer）。invoke 在该文件之外不出现。`
- V3 描述：`Electron 跨进程命令桥接。Main 端 handler 注册在 electron/main/ipc.ts 的 ipcMain.handle(...)；preload 通过 contextBridge.exposeInMainWorld('codeman', api) 暴露类型化 API；renderer 端包装在 src/shared/lib/ipc.ts（Service Tag + Live Layer）。Renderer 直接 import window.codeman 不出现；所有调用走 Service Tag。`

**所有 import 同步更新**：50+ 个文件从 `@/shared/lib/tauri` 改为 `@/shared/lib/ipc`。tsc 一次性报错驱动修改（`vp run typecheck` 通过即完成）。

**拒绝**：保留文件名 `tauri.ts` 以减少 diff —— 文件名与实际语义不一致，引入认知负担、未来接手者困惑；CONTEXT.md 不得不加注"尽管叫 tauri.ts 但内部已走 Electron"，污染词汇表。

### D7 — 流式输出：Main → Renderer 通过 `webContents.send` 推送 chunk

V2 中 pi-agent 流式输出经 Tauri `Event::emit` 推到 renderer（单 invoke 内的 stream 是 V2 `Stream.fromQueue` 内的异步事件，per ADR-0017）。

V3 决策：流式 chunk 走 **Main → Renderer 的 `webContents.send(channel, payload)`**，renderer 通过 `window.codeman.onStreamChunk(handler)` 订阅（preload 暴露）。Abort 信号走单独 IPC handler `ipcRenderer.invoke('abort_request', requestId)`，Main 端维护 `Map<requestId, AbortController>`。

**不**引入 WebSocket、MessagePort、IPC Stream 等替代方案——`webContents.send` + abort IPC 是 Electron 文档主推的流式模式。

### D8 — 测试基础设施：三层各自适配

| 层 | V2 | V3 |
|---|---|---|
| Frontend 单测 (vitest + jsdom) | mock `invoke('cmd')` via `__mocks__/` | mock `window.codeman` via `__mocks__/`（同一 mock 路径） |
| Main process 单测 | `wiremock` + Rust integration test | vitest Node mode（`vitest run --project main`） |
| E2E (Playwright) | `_tauri.launch` | `_electron.launch`（Playwright `_electron` API） |

**Q→A Table 机制**：fake LLM provider 的 `base_url` 指向 Electron Main 启动的本地 HTTP server（默认 `http://127.0.0.1:50000/mock/anthropic`），server 读 `CODEMAN_TEST_QA_TABLE` 或 dev seed → emit SSE 字符串回复 client。transport 层不识别 mock 性质，所有 request 都走标准 fetch。加载位置从 Rust `src-tauri/src/lib.rs` 启动钩子 → Node `electron/main/index.ts` 启动钩子 + `electron/main/mock-server.ts`。V2 起的 `mock://` prefix + `mockStreamTurn` JS shim 路径整体移除。

**Per-worker Q→A Isolation 不变**（per ADR-0023 Q→A Entry 词条）：每个 worker 独立 SQLite + WebView2 state + Settings JSON + Q→A Table 的隔离模式保留。

### D9 — 迁移策略：Big-bang，一周冻结

**Big-bang**（已选）：
- `src-tauri/` 整体删除（含 `Cargo.toml`、`tauri.conf.json`、`capabilities/default.json`、`icons/`、`src/`）。
- `electron/` 目录从零建立（`electron/main/`、`electron/preload/`、`electron-builder.yml`）。
- 期间冻结功能发布（一周窗口；测试 + 修 bug + 验证 MSI 安装包）。
- `vp run tauri:*` 命令从 `package.json` 移除。

**拒绝**：(a) 平行维护（Tauri + Electron 共存）——双倍维护负担；(b) Strangler（一个 IPC 一个 IPC 替换）——Tauri 与 Electron 的 main process 启动模型互斥，无法平滑过渡。

### D10 — V3.1 amend: Settings JSON wire format snake_case → camelCase

**Context.** V2 (Rust/Tauri) 时期 settings schema 沿用 Rust 习惯全 snake_case (`api_key`/`default_model`/`base_url`/`default_llm_provider_id` 等)。V3 迁移（D1-D9）把 schema 原样搬到 TypeScript `electron/main/settings-schema.ts::SettingsV15`,加 `:5` 注释「Snake_case field names preserved per ADR-0024; existing users' settings.json load transparently」—— 但 ADR-0024 正文实际**未**对 snake_case 作显式决策,该注释是对 V2 继承事实的描述,非决策。V0→V15 migration 是另独立 concern,不属本节。

V3.1 期间 commit `b6ce135 refactor(types): snake_case → camelCase in shared types and consumers` 把 TS 域 (`src/shared/lib/types.ts`) 统一改为 camelCase,但**遗漏**了 `electron/main/settings-schema.ts::SettingsV15` —— 结果 TS 域 = camelCase,wire format `SettingsV15` (settings.json on disk + IPC payload) 仍 snake_case,**缺一个 snake↔camel bridge**,跟 DB row mappers (`toMessage`/`toConversation`/`toWorkspace`) 不对称。

实测后果:11 个 e2e 在 `b6ce135` 后变红（7 个 A 类 mock LLM 不出文本 + 4 个 B 类 per-conv runtime `waitFor` 超时),根因是 renderer 端 `settings.defaultLlmProviderId`、`provider.apiKey`、`provider.llm.baseUrl` 全 undefined,`getActiveLlmProvider()` 返回 null,mock LLM 未生效,真 LLM（无 key / 429)顶上 → `agent_end: msgs.length=0`。

**Decision.** Settings JSON wire format 改为 **camelCase**,与 TS 域统一。`migrateV15SnakeToCamel()` 一次性 load-time migration 保证 V3 既装（已写盘 snake）的用户自动升级;V3.1 起新写盘 / 新读盘全 camel。V0→V15 migration 不变（V0 是历史 snake,且已 deprecation 链路上游,与 V3.1 wire snake 是两个独立 concern）。

字段映射表:

| Wire (V3 snake, deprecated) | Wire (V3.1 camel, canonical) |
|---|---|
| `schema_version` | `schemaVersion` |
| `default_llm_provider_id` | `defaultLlmProviderId` |
| `user_language` | `userLanguage` |
| `start_at_login` | `startAtLogin` |
| `window.remember_position` | `window.rememberPosition` |
| `window.remember_size` | `window.rememberSize` |
| `window.default_size` | `window.defaultSize` |
| `window.min_size` | `window.minSize` |
| `system_prompt.user_can_edit` | `systemPrompt.userCanEdit` |
| `conversations.auto_archive_after_days` | `conversations.autoArchiveAfterDays` |
| `conversations.max_history` | `conversations.maxHistory` |
| `providers[].api_key` | `providers[].apiKey` |
| `providers[].llm.default_model` | `providers[].llm.defaultModel` |
| `providers[].llm.base_url` | `providers[].llm.baseUrl` |
| `providers[].llm.api_type` | `providers[].llm.apiType` |
| `providers[].llm.models_endpoint` | `providers[].llm.modelsEndpoint` |
| `providers[].llm.models[].context_window` | `providers[].llm.models[].contextWindow` |

**Implementation notes.**

- `electron/main/settings-schema.ts::migrateV15SnakeToCamel(raw: unknown): SettingsV15` 在 `loadSettings()` 入口自动调用,depth-traverse 写 camel keys;老 settings.json 一次升级,无 breaking UX。`SettingsV0 → SettingsV15` migration 在前（已存在）;`V15 snake → V15 camel` migration 在后（新增）。两端 pipeline: `migrationsV0ToV15 → migrateV15SnakeToCamel → sanitize → saveSettings`。
- `update_settings` IPC handler 续用 `Partial<SettingsV15>` 作为 patch 类型 —— V3.1 起 `SettingsV15` 本身已经是 camel,类型层与 wire 层合一;amend 前存在的「TS 域 camel / wire snake / 类型 Partial<SettingsV15> snake」三层错位修复。
- `e2e/mock-provider.ts` fixture 字段全部由 snake 改 camel,与 post-amend wire format 一致。
- `electron/main/ipc.ts::toMessage`/`toConversation`/`toWorkspace` 等 DB row → TS 域 mappers **不变**（DB 层 snake,TS 域 camel,经由 mappers 翻译,职责未动）。
- 添加 ADR 引用:本 D10 supersede `settings-schema.ts:5` 旧注释「Snake_case field names preserved per ADR-0024」—— `:5` 注释更新为「camelCase wire format per ADR-0024 D10」。

**Negative.**

- `settings-schema.ts:5` 旧注释 supersede;读老代码的开发者如果只读注释会困惑 —— 本 D10 是 authoritative。
- 新增 `migrateV15SnakeToCamel()` 是新代码 surface,需独立 vitest 覆盖（`settings-schema.test.ts` 加 case）。
- 已经 `b6ce135` 改完 camel 的 TS 消费者侧（`src/features/**` 32+ 文件）与本 amendment 同向;不引入 retro rename 工作量。
- DB row mappers 与 settings wire format 是两套独立 concern,在 `electron/main/ipc.ts` 内并列,职责清晰但要求新读者区分（settings 一处走 schema-level migration,DB rows 走 row-level mappers）。

**Rejected.**

- (a) **保持 wire snake + IPC 层 bridge**（Path A）:被拒;多 ~35 行 diff,持久层 vs TS 域分两套 truth,违反「wire format 即 source of truth」「reducing duplication」。
- (b) **回滚 `b6ce135` 整体翻 TS 域回 snake**（Path C）:被拒;b6ce135 已落定 32+ 文件,翻回去 ~30 minute 大量 diff 跟 ADR-0024 / ADR-0025 后续决策不一致。
- (c) **双世界 + 详细 boundary ADR(新建 0026)**:被拒;boundary 在本 D10「Implementation notes」+ 表中已记录充分,不需要另起 ADR-0026 增加 file 数量。

## Consequences

### Positive

- WebView2 / Tauri 2 在 Windows 上的 Web API 兼容性阻塞解除。
- Chromium 升级与 Edge WebView2 runtime 解耦——V3 决定 Chromium 版本（锁 minor），不再受用户机器 Edge 版本影响。
- Node 生态工具（dotenv、cosmiconfig、zod 等）可在 main process 直接使用，无需 Rust crate 等价物。
- `electron-store` / `electron-log` / `electron-window-state` 等库比 Tauri 插件更成熟、社区更大。
- **V3.1 amend (D10):** wire format 与 TS 域同形,降低认知负担;新增 settings 字段有「一处定义」原则;`update_settings` 类型 `Partial<SettingsV15>` 与 wire keys 对齐,无 shadow type 漂移;e2e + 单测 wire format 路径不再跨错。

### Negative

- 包体积：从 V2 ~30 MB (Tauri + WebView2) 涨到 V3 ~150 MB (Electron + Chromium)。V1.5 任务栏应用形态下可接受。
- 启动延迟：从 V2 ~150ms 涨到 V3 ~600ms（Electron 冷启动基线）。V1.5 任务栏应用形态下可接受。
- Rust 工具链移除：`cargo` 不再需要；CI 节省编译时间。**代价**：失去 Rust 静态分析 + 内存安全保证——Node main process 须靠 TypeScript strict mode + 测试覆盖保证正确性。
- 25+ IPC 命令的 `ipcMain.handle` 重写 + preload `contextBridge` 暴露 + 50+ import 同步更新 = 一次性 ~300+ 文件改动（机械但量大）。
- `tauri-plugin-store` 的 `Settings::sanitized()` 钳制逻辑需迁移为 TS `SettingsSchema.sanitize()`（语义不变；测试用例复用）。
- **V3.1 amend (D10):** V3 既装用户的 `settings.json` 自动 `migrateV15SnakeToCamel()` 一次,失败回退默认值（per `sanitize()`);`settings-schema.ts:5` 旧注释 supersede 造成「注释 vs ADR」不一致,需新读者先看 D10 才能读懂 schema;DB row mappers（`toMessage` 等）与 settings wire format 是两套独立 concern,在 `electron/main/ipc.ts` 内并列,职责清晰但要求新读者区分。

### Cross-file impact

| 文件 / 目录 | 变化 |
|---|---|
| `docs/adr/0024-...md` | 本 ADR |
| `src-tauri/` | **整体删除**（`Cargo.toml` / `tauri.conf.json` / `capabilities/` / `icons/` / `src/`） |
| `src-tauri/AGENTS.md` | 删除（随目录消失） |
| `electron/` | **新建**（`electron/main/index.ts` / `electron/main/ipc.ts` / `electron/main/settings-schema.ts` / `electron/main/file-sandbox.ts` / `electron/main/db/` / `electron/preload/index.ts` / `electron-builder.yml` / `package.json` 子包） |
| `src/shared/lib/tauri.ts` | **RENAME** → `src/shared/lib/ipc.ts`；内部实现从 `invoke()` wrapper 重写为 `window.codeman.methodName()` wrapper |
| `src/shared/lib/ipc.ts` | **新建**；继承原 Service Tag + Live Layer 结构，但底层调用换为 `window.codeman.*` |
| `src/shared/lib/types.ts` | Settings / Workspace / Conversation / Message schema **不变**（已与 Rust schema 同步；TS 镜像为权威） |
| `src/__mocks__/` | mock target 从 `invoke` → `window.codeman`（同一目录结构） |
| `src/shared/stores/app.store.ts` | Effect → Service 调用全部走 `ipc.ts`；公开 API 形状不变 |
| `src/features/chat/stores/chat.store.ts` | 同上 |
| `src/features/file-tools/` | file tool 调用走 `ipc.ts.file.{read,write,edit,search,delete}` |
| `src/features/billing/` | 计费 adapter 调 LLM 端点走 `fetch`（不变）；无 IPC 路径改动 |
| `package.json` | `scripts` 字段按 D5 映射重写；移除 `@tauri-apps/api` + `@tauri-apps/cli` + `tauri-plugin-*` + `vite-plus`；新增 `electron` + `electron-vite` + `electron-builder` + `electron-store` + `electron-log` + `electron-window-state` + `better-sqlite3`（替代 sqlx） |
| `pnpm-lock.yaml` | 大幅变动 |
| `vitest.config.ts` | 新增 `projects` 配置（frontend jsdom + main Node）；同 test 入口拆分 |
| `playwright.config.ts` | `webServer` 改用 `_electron.launch`；其他配置不变 |
| `tsconfig.json` | 不变（renderer 仍是 TS）；新增 `tsconfig.electron.json` 覆盖 main/preload（CommonJS target） |
| `CONTEXT.md` | 已 inline 更新（14 处 Tauri 引用替换为 Electron；语义保留） |
| `AGENTS.md` | "核心栈" 行 + 命令列表按 D5 重写；引用 `src-tauri/` 处改 `electron/main/` |
| `src/AGENTS.md` | 同上 |
| `src/features/*/AGENTS.md` | 命令 / IPC 路径引用更新 |
| `e2e/fixtures.ts` | launch 用 `_electron.launch`；其他 fixture（per-worker 路径）不变 |
| `e2e/09-per-conv-runtime.spec.ts` 等 | 不变（e2e 通过 UI 操作，不直接依赖 IPC 实现） |
| `src-tauri/src/db/migrations/` | 删除；新 SQLite 迁移用 `better-sqlite3` + `electron/main/db/migrations/` |
| `src/shared/lib/derive-label-from-path.ts` | 不变 |
| **V3.1 amend (D10):** `electron/main/settings-schema.ts` | snake → camel 重命名（`SettingsV15` / `Provider` / `ProviderLlm` / `ModelMeta` 等 18 处);新增 `migrateV15SnakeToCamel()`;`:5` 注释更新;`migrationsV0ToV15` + `v0ProviderToV15` 不变（V0 是历史 wire 格式）|
| **V3.1 amend (D10):** `electron/main/settings-schema.test.ts` | 同步 snake → camel rename;新增 `migrateV15SnakeToCamel` 测试 case |
| **V3.1 amend (D10):** `e2e/mock-provider.ts` | fixture 字段 `api_key` / `default_model` / `base_url` / `api_type` / `models_endpoint` / `models[].context_window` 全 camel;`llm_api_key_ref` 删除（V1.5 Provider schema 不再支持）|
| **V3.1 amend (D10):** `electron/main/ipc.ts` | `get_settings` / `update_settings` 内部使用的 `Partial<SettingsV15>` 类型不变,但字段 key 已 camel（amend 前存在「类型层 snake / wire snake / TS 域 camel」三层错位修复）;DB row mappers 不动 |
| **V3.1 amend (D10):** `e2e/05-file-tools.spec.ts` beforeEach (C 类一并修) | add_workspace 改 `pid + Date.now()` 拼出 unique `rootPath`,per 6a7922c 模式,避免 4 worker 并行撞 UNIQUE constraint |
| **V3.1 amend (D10):** 本 ADR | D10 + 上述 Positive/Negative/Cross-file impact 增补条目 |

**估算**：~60 文件改动（删除 30+ / 新建 15+ / 修改 15+）；~10-15 atomic commits；~4-7 工作日（与 D9 的"一周冻结"一致）。

### Reversibility

**不可逆**（高代价）：重建 Rust 工具链、重新写 25+ `#[tauri::command]` handler、`tauri-plugin-*` 等价物回归。**预计**：单开发者全栈回归 3-4 周（含 e2e 重写）。

**可逆具体步骤**（如未来需回滚 Tauri）：

1. 恢复 `src-tauri/` 目录（git 历史保留，无需重建）。
2. `package.json` 回滚 `scripts` 字段到 V2 状态；deps 回滚 `vite-plus` + `tauri-plugin-*` + `@tauri-apps/*`。
3. `src/shared/lib/ipc.ts` → 重命名为 `tauri.ts`，内部 `window.codeman.methodName()` 改回 `invoke('method_name', args)`。
4. `electron/` 目录删除。
5. `CONTEXT.md` + AGENTS.md 全量回滚 V2 措辞（git revert 单 commit）。
6. Rust 编译 + e2e 回归测试。

**预计回滚耗时**：1-2 工作日（机械 revert + e2e 回归）。这是 ADR 唯一一个**接受不可逆代价**的决策——但 V3 是产品演进需要，接受风险。

## References

- ADR-0001（Tauri 2 + Solid.js）—— Tauri 决策被本 ADR supersede，Solid.js 决策保留
- ADR-0007（单窗口 + TanStack Router）—— V3 形态不变
- ADR-0015（API Key 明文存 Settings JSON）—— 路径不变
- ADR-0017（Queue-based Runtime）—— Effect Stream 抽象不变
- ADR-0018（统一日志）—— `electron-log` 承载
- ADR-0019（per-run transient Agent）—— pi-agent 实例化模式不变
- ADR-0023（codeman-* + Ark UI + Workspace 治理）—— 决策保留；`src-tauri/*` 路径引用需在本 ADR 视为已迁移
- https://electron-vite.org/ —— electron-vite 文档
- https://www.electronjs.org/docs/latest/api/ipc-main —— ipcMain.handle API
- https://github.com/sindresorhus/electron-store —— Settings 持久化
- https://github.com/marijnhahn/electron-window-state —— 窗口位置记忆
- Tauri 2 文档（已废弃参考）：https://v2.tauri.app/
- ADR-0001 §Why not Electron —— V3 起该论据不再适用（widget 形态已废止，per ADR-0007）