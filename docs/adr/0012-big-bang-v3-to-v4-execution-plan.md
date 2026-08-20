# ADR 0012 — Big-bang V3 to V4 Refactor Execution Plan

**Status**: accepted · **Date**: 2026-08-20 · **Scope**: codeman-agent V4 迁移执行策略
**Related**: ADR 0001 (V4 总纲 D12), ADR 0002–0011

## Context

V4 重构范围远超 V3 任何一次演进：

- **运行时底座切换**：pi-agent-core → pi-coding-agent（`@earendil-works/pi-coding-agent` ≥ 0.84.x）
- **进程边界重排**：runtime from renderer to main process
- **安全模型删除**：workspace sandbox + permission model 整体删除
- **数据模型简化**：SQLite 会话层整体删除，旧数据不迁移
- **配置存储迁移**：electron-store settings.json → pi ModelRuntime + SettingsManager
- **工具层替换**：自建 file-ops + run_command → pi 内置 + webfetch defineTool
- **扩展体系迁移**：Plugin Registry → pi ExtensionAPI
- **错误模型扩展**：7 个 AppError 子类 → 18 个子类

V3 项目历史先例（per V3 git log V3 ADR-0025 D9）：Tauri 2 → Electron 迁移采用 big-bang + 一周冻结窗口。该先例被反复验证为有效。

V4 启动采用 **big-bang 整体切换**——一条分支、一个冻结窗口、整体切到 V4 架构。

## Decision

### D1. 单分支 + 单冻结窗口

- **V4 分支**：`refactor/v4-pi-coding-agent-base`（命名约定：与 V3 历史上 `feat/omo-changelog-impl` / `feat/chat-compaction-rewrite` 一致）
- **冻结窗口**：V3 master 在分支创建时不再接收功能合并（仅接受 hotfix）
- **切换点**：V4 分支测试 + QA 通过后，merge V4 → master，V4 即正式 V4.0.0

### D2. 不并行维护 V3

拒绝"平行维护 V3 + V4 一段时间"——双份代码维护负担，且 V4 是产品定位改变（per ADR 0003 + ADR 0011），V3 master 在 V4 启动后即停止演进。

### D3. commit 节奏

V4 重构拆分为 12 个原子 commit，每个 commit 对应一个 ADR 的核心变更（per AGENTS.md "Atomic commits" 纪律）。commit 顺序按依赖关系：

```
C01. chore: bump pi-ai + pi-agent-core to 0.84.x + add pi-coding-agent dep
C02. refactor(pi-runtime): add PiRuntime + IPC handlers + event-bridge skeleton (per ADR 0002)
C03. refactor(chat): wire IPC events into existing Solid chat UI (per ADR 0002 D4)
C04. drop: core/llm/ sublayer (per ADR 0001 D1)
C05. drop: file-ops sandbox + PermissionService + permission-bar + permission.store (per ADR 0003)
C06. drop: workspaces + WorkspaceService + workspace-picker (per ADR 0004)
C07. drop: SQLite conversations + messages + FTS5 tables (per ADR 0005)
C08. drop: buildSystemPrompt + tool-snippets (per ADR 0007)
C09. migrate: providers + settings.json → pi ModelRuntime + SettingsManager (per ADR 0008)
C10. expand: AppError subclasses (per ADR 0009) + error-mapper.ts
C11. add: webfetch defineTool + SSRF (per ADR 0010) + Pi MCP extension (per ADR 0006 D3) + Pi subagent extension (per ADR 0006 D2) + Pi skills wrapper (per ADR 0006 D1) + Pi codeman-agent extension (per ADR 0007)
C12. drop: billing schema residue (per ADR 0011) + PRODUCT.md update + V4 CONTEXT.md
```

每个 commit 必须：
- 通过 `vp run typecheck`
- 通过 `vp run test`（vitest 单测全绿）
- 通过 `vp run lint`（oxlint 干净）
- `vp run e2e` 中该 commit 影响的 e2e spec 全绿（其他 e2e 可暂红——属于 V4 重构未完成的 spec）

### D4. 测试策略

#### 单测

`vitest --run` 全绿为门禁。V4 新增单测：

- `core/pi-runtime/error-mapper.test.ts`（18 个错误映射分支 fixture）
- `core/pi-runtime/tools/webfetch.test.ts`（webfetch + SSRF）
- `core/pi-runtime/session-manager.test.ts`（cwd-scoped session CRUD）
- `core/extensions/mcp-extension.test.ts`（MCP JSON-RPC 客户端）
- `core/extensions/subagent-extension.test.ts`（subagent 实例化与隔离）
- `core/extensions/skills-extension.test.ts`（preload skills + slash command）

V3 旧单测大量删除（对应删除的代码）。

#### e2e

V3 Playwright e2e（per V3 git log）大部分删除（依赖 V3 SQLite / V3 runtime / V3 IPC handlers）。V4 新增 e2e：

- `01-pi-session-create.spec.ts` — 创建新 session / 列 sessions / 打开 session
- `02-prompt-stream.spec.ts` — 用户 prompt → pi session → token 流 → done
- `03-tool-call-visualization.spec.ts` — pi 内置工具调用 UI 渲染
- `04-cwd-switch.spec.ts` — Change cwd 按钮 → 新 session
- `05-webfetch.spec.ts` — webfetch 工具调用 + SSRF 拦截测试
- `06-mcp-extension.spec.ts` — MCP server 启动 + 工具调用
- `07-subagent-extension.spec.ts` — delegate_task 子 agent
- `08-skills-extension.spec.ts` — `/skill:name` 调用
- `09-error-mapping.spec.ts` — 18 个 AppError 子类的 UI 渲染
- `10-automations-llm.spec.ts` — automations LLM action 走 pi session
- `11-settings-provider.spec.ts` — Settings UI 改 pi ModelRuntime

e2e 目标：V4 启动时 16 个 spec（V3 baseline）+ V4 新增 11 个 = 27 个总目标。

#### mock LLM server

V3 e2e 的 fake LLM provider（`src/main/mock-server.ts`）需调整：

- 路径不变（`http://127.0.0.1:50000/mock/anthropic`）
- 协议适配 pi 的 SSE 格式（pi 的 stream protocol 可能与 V3 AnthropicMessages 直接调用略有差异——按 pi 文档适配）

### D5. 回滚预案

V4 merge → master 后，若发现重大问题：

1. **热修 hotfix**：master 上直接修，不回滚 V4
2. **回滚 V4**：git revert V4 merge commit——恢复 V3（V3 git 历史保留）
3. **V4 数据迁移**：V4 已有的 pi JSONL session 文件需用户手动备份（无迁移回 V3 的路径——V3 SQLite 表已删除）

### D6. 文档同步

- **PRODUCT.md**：更新产品定位（per ADR 0011 + ADR 0001 D14）
- **AGENTS.md**：更新"核心栈" + 命令列表（新增 pi-coding-agent 依赖描述）
- **V4 CONTEXT.md**：按 ADR 0001–0011 词汇表更新
- **README.md**：更新开发命令与构建产物描述

### D7. 估算

| 阶段 | 时间估计 |
|---|---|
| C01 依赖升级 + 类型适配 | 1 天 |
| C02 PiRuntime 骨架 + IPC handlers | 2 天 |
| C03 IPC 事件桥接到 chat UI | 2 天 |
| C04–C08 删 V3 自建层（5 个 commit） | 3 天 |
| C09 Provider 迁 pi ModelRuntime | 2 天 |
| C10 错误映射扩展 | 1 天 |
| C11 extensions + webfetch | 3 天 |
| C12 billing 清理 + 文档 | 1 天 |
| QA / e2e 全量回归 / bug 修 | 4 天 |
| **总计** | **约 19 天（4 周）** |

冻结窗口建议：**2 周**，含 buffer 时间。

### D8. 风险与缓解

| 风险 | 概率 | 缓解 |
|---|---|---|
| pi-coding-agent 0.84.x API 实际与文档不一致 | 中 | 早期 C01-C02 即暴露 API 差异，及时调整 |
| photon-node 原生模块 Electron 打包问题 | 中 | electron-builder 配置确认 + 测试 |
| Node ≥22.19 与 Electron 39 捆绑 Node 兼容性 | 低 | 已验证（本地 Node v24.19.0 满足） |
| V3 老用户升级数据丢失引发负面反馈 | 中 | 文档明确告知 + 在 release notes 强调 |
| V4 chat UI 与 pi 事件投影层的事件类型不匹配 | 中 | C03 早期验证 |
| Solid UI 状态管理与 V3 chat store 重写差异 | 中 | 保留 UI 组件，仅替换 store 层 |

## Considered

#### 选 1（已选）：Big-bang 整体切换
一条分支 + 冻结窗口 + 整体切到 V4。参考 V3 ADR-0025 D9（Tauri→Electron）先例。

#### 选 2：渐进 / Strangler
垂直切片：阶段 1 = 运行时迁 main + IPC 桥；阶段 2 = feature 逐块迁 pi 生态；阶段 3 = 删 V3 自建。每阶段可发布。

问题：中间态是"双运行时并行"（V3 core/llm/runtime + V4 PiRuntime），feature 边界复杂（用户在 V3 chat UI 看到的 session 走 V3 runtime 还是 V4 PiRuntime？），且中间态会持续多周——积累的技术债未必比 big-bang 少。**不选**。

#### 选 3：并行双轨
新架构在独立分支/目录并行开发，旧版继续维护。

问题：双份代码维护成本最高。**不选**。

## Consequences

### Positive

- **统一架构**：V4 一刀切到位，无中间态双运行时混乱
- **commit 历史清晰**：12 个原子 commit 对应 12 个 ADR，可逐 commit 回溯
- **冻结窗口集中风险**：2 周集中风险 vs 渐进式长期风险
- **V3 先例可借鉴**：V3 ADR-0025 D9 的 big-bang + 一周冻结已被验证有效

### Negative

- **冻结期间无新功能**：V4 启动的 2 周内 V3 master 不接收功能合并
- **回滚成本高**：V4 merge 后若发现问题，回滚成本中等（git revert + V4 数据迁移路径缺失）
- **风险集中**：所有变更在同一时间点引入，QA 必须覆盖完整 V4 流程
- **V3 旧用户升级数据丢失**：无法回退（per ADR 0005 D2）

### Neutral

- **V4 即 V4.0.0**：semver 主版本号跳变，反映产品定位改变
- **git history 保留 V3**：所有 V3 代码在 git log 中可追溯

## Cross-file impact

| 范畴 | 变化 |
|---|---|
| `package.json` | 新增 `@earendil-works/pi-coding-agent`；`@earendil-works/pi-ai` + `@earendil-works/pi-agent-core` 升 `0.84.x` |
| `electron.vite.config.ts` | main target `node22` |
| `pnpm-lock.yaml` | 大幅变动 |
| `docs/adr/0013-onwards` | V4 后续修订独立 ADR（不在本 big-bang 范围内） |

## Reversibility

中等可逆：

- git revert V4 merge commit → 恢复 V3（V3 git 历史完整保留）
- V4 创建的 pi JSONL session 文件无法迁移回 V3 SQLite
- 用户数据单向迁移（V3 SQLite → V4 JSONL）

预计回滚耗时：1 周（git revert + V4 用户提示数据丢失）。

## References

- V3 ADR-0025 D9（Tauri→Electron big-bang）：先例可借鉴
- pi-coding-agent 0.84.x release notes：依赖升级影响评估
- V4 ADR 0001–0011：12 个 commit 各对应 1 个 ADR