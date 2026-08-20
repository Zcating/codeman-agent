# ADR 0007 — System Prompt via pi DefaultResourceLoader + Extension API

**Status**: accepted · **Date**: 2026-08-20 · **Scope**: codeman-agent V4 system prompt 组装机制
**Related**: ADR 0001 (V4 总纲 D9), ADR 0006 (extension mapping)

## Context

V3 自建 `buildSystemPrompt(sections)` 纯函数（`src/features/chat/lib/build-system-prompt.ts`）按固定节序组装：

1. 身份段（agent 是谁）
2. 工具列表（`AgentTool` 注册的工具说明）
3. guidelines（行为准则）
4. workspace 节（workspace_id + 文件工具传参规则）
5. 项目指令（cwd 下 `AGENTS.md` 内容）
6. skills 段（`<available_skills>` XML 块）
7. 用户默认值（用户在 settings 配置的 systemPrompt）
8. cwd 页脚（当前 cwd 路径）

调用方备料、组装器纯拼装，空节跳过。

V3 还有"会话提示词覆盖"机制：用户为某个 conversation 设置的 `systemPrompt` 整体替换组装器的内置节（身份/工具列表/guidelines/用户默认值），workspace / AGENTS.md / skills 段追加。

pi-coding-agent 提供：

- `DefaultResourceLoader`：自动加载 cwd 下的 context 文件（如 `AGENTS.md`）
- `ExtensionAPI.on('before_prompt')`：extension 钩子，system prompt 组装前注册 section
- `ExtensionAPI.registerTool`：工具列表自动从注册的工具生成
- Agent Skills standard：skills manifest 自动注入

V4 用 pi 机制替换 V3 自建组装器。

## Decision

### D1. 删 buildSystemPrompt 自建组装器

- **删除词汇表词条**：`System Prompt 组装器 (system prompt builder)`、`会话提示词覆盖 (conversation prompt override)`、`项目指令 (project instructions)`
- **删除 src/renderer/src/core/llm/build-system-prompt.ts**（V3 自建组装器）
- **删除 src/renderer/src/core/llm/build-tool-snippets.ts** + `deriveToolSnippets()`（工具说明派生）

### D2. 用 pi DefaultResourceLoader

V4 不再手动读 `AGENTS.md`。pi 的 `DefaultResourceLoader` 自动发现 cwd 下的 context 文件（包括 `AGENTS.md`），注入 system prompt。

用户可在 Settings 配置要加载哪些 context 文件路径（glob 模式），通过 `pi-runtime.config.json`（per ADR 0008 SettingsManager）。

### D3. 用 ExtensionAPI.on('before_prompt')

V4 自写 extension（`codeman-agent-extension`）注册 system prompt sections：

- 身份段："你是 codeman-agent，Windows 桌面 AI 助手..."（V3 身份段文本保留，迁到 extension）
- 用户默认值：从 `SettingsManager` 读取用户在 settings 配置的 systemPrompt，作为 `before_prompt` 钩子中的 section
- cwd 页脚：`当前工作目录：<cwd>`

这些 section 由 pi 在 system prompt 组装时按 extension 注册顺序拼接。

### D4. 工具列表自动生成

V4 工具列表由 pi 从 `ExtensionAPI.registerTool` 注册的工具自动生成说明文本（工具名 + 参数 schema + 描述）。无需 V3 的 `deriveToolSnippets` 派生逻辑。

### D5. 会话级别 system prompt 覆盖

V4 不再支持 V3 的"整个 conversation 覆盖 systemPrompt"。原因：

- pi session 的 system prompt 由 runtime + extensions 共同决定，conversation 级别覆盖与 pi 的多 session 抽象不一致
- 用户如需 per-session 行为差异，用 `/skill:name` 或 `before_prompt` extension 配置

V4 conversation schema 不再有 `systemPrompt` 字段。

### D6. 词汇表清理

V3 `CONTEXT.md` 词汇表删除：

- `System Prompt 组装器 (system prompt builder)`
- `会话提示词覆盖 (conversation prompt override)`
- `项目指令 (project instructions)`

V4 新增：

- `Pi DefaultResourceLoader`（自动发现 cwd 下 context 文件）
- `Pi Extension Before Prompt Hook`（`ExtensionAPI.on('before_prompt')` 钩子）
- `Pi Auto Tool Description`（从 `registerTool` 自动生成工具说明）

## Considered

#### 选 1（已选）：全部走 pi 机制
删 V3 buildSystemPrompt，用 pi DefaultResourceLoader + ExtensionAPI.on('before_prompt') + 自动工具列表生成。

#### 选 2：保留 buildSystemPrompt 作为 pi 上层的覆盖层
保留 V3 buildSystemPrompt 作为 wrapper，传入 pi session 的 `systemPrompt` 参数。问题：与 pi 自动机制重复，且无法用 pi 的 extension 钩子扩展。**不选**。

#### 选 3：保留 buildSystemPrompt 不动，作为 agent.systemPrompt 参数
最小变动，但与 I1 "逐 feature 映射到 pi 生态" 矛盾。**不选**。

## Consequences

### Positive

- **system prompt 组装由 pi 上游维护**：V4 不维护平行组装器
- **用户可写 extension 注入 section**：扩展点开放
- **工具列表自动同步**：新增/修改 `defineTool()` 后工具说明自动更新
- **项目指令通过 ResourceLoader**：用户可直接在 cwd 写 `AGENTS.md`

### Negative

- **system prompt 节序不可定制**：V4 不能像 V3 那样精细控制 identity / tools / guidelines / workspace / AGENTS.md / skills / user-default / cwd 页脚 的顺序（由 pi 决定）
- **per-conversation systemPrompt 删除**：V3 的"覆盖 systemPrompt" 功能删除
- **身份段文本需要迁到 extension**：V3 的身份段文案需重写为 extension 代码
- **与 pi 上游耦合加深**：pi 的 system prompt 组装行为变更需跟进

### Neutral

- **用户默认值保留**：用户在 settings 仍可配置 systemPrompt，作为 extension 的 before_prompt 钩子中的 section 注入
- **AGENTS.md 保留**：用户可在 cwd 写 `AGENTS.md`，pi 自动发现并注入

## Cross-file impact

| 路径 | 变化 |
|---|---|
| `src/renderer/src/core/llm/build-system-prompt.ts` | **删除** |
| `src/renderer/src/core/llm/build-tool-snippets.ts` | **删除** |
| `src/main/pi-runtime/extensions/codeman-agent-extension/` | **新建**：extension 注册 before_prompt hook（身份段 / 用户默认 / cwd 页脚） |
| `src/main/pi-runtime/resource-loader.ts` | **新建**：配置 `DefaultResourceLoader`（context 文件 glob） |
| `src/shared/lib/types.ts` | `Conversation` 删 `systemPrompt` 字段 |
| `src/renderer/src/features/settings/` | systemPrompt 配置 UI 保留，保存到 SettingsManager |
| `CONTEXT.md` 词汇表 | 删除：`System Prompt 组装器`、`会话提示词覆盖`、`项目指令`；新增：`Pi DefaultResourceLoader`、`Pi Extension Before Prompt Hook`、`Pi Auto Tool Description` |

## Reversibility

低可逆：

- 恢复 buildSystemPrompt 需重写组装器 + 工具说明派生
- per-conversation systemPrompt 恢复需 conversation schema 加回字段

预计回滚耗时：1 周。

## References

- pi-coding-agent DefaultResourceLoader：自动发现 cwd 下 context 文件
- pi-coding-agent ExtensionAPI.on('before_prompt')：system prompt 组装前钩子
- pi-coding-agent registerTool 自动工具说明生成
- V3 buildSystemPrompt（per git log）：不追溯