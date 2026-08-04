# 0051 — System Prompt Builder（分节组装器统一系统提示词构建）

**Status**: accepted · **Date**: 2026-08-05 · **Scope**: src/renderer/src/features/chat/lib/build-system-prompt.ts (新增) + workspace-project-instructions.ts (新增) + src/renderer/src/features/chat/stores/chat.store.ts (改 — 备料 + 调组装器) + src/renderer/src/features/chat/lib/runtime.ts (改 — 删 skills 拼接) + src/renderer/src/plugins/multi-agents/lib/sub-agent-factory.ts (改 — 接入组装器) + src/renderer/src/features/settings/lib/system-prompt.ts (改 — 删 resolveSystemPromptForConversation) + src/renderer/src/shared/stores/app.store.ts (改 — 默认串搬入内置节、统一空串)

**Related**: ADR-0019 (per-run transient agent — systemPrompt 在 run() 时构造), ADR-0031 (skills system — skills 段注入), ADR-0049 (multi-agents — 子代理独立 Agent), ADR-0047 (pi route migration — provider adapter)

## Context

系统提示词现由 3 处分散字符串拼接组装（`app.store.ts` 硬编码默认串 → `chat.store.ts` 内联 `[Workspace context]` → `runtime.ts` 拼 skills 段），子代理走另一条平坦字符串路径。且 renderer 的 `defaultSettings.systemPrompt.default` 硬编码串（身份 + 文件工具说明）被 main 侧 `DEFAULT_SETTINGS.systemPrompt.default = ""`（空串）在 `refresh()` 时覆盖——**该串实际基本未生效**，当前发出去的提示词 ≈ workspace 节 + skills 节。

2026-08-05 grill-with-docs session（18 轮决策）锁定本 ADR 内容。用户参考 pi 的 `buildSystemPrompt` 代码，要求增加可维护的分节组装能力。

## Decision

### D1 — 纯函数分节组装器 `buildSystemPrompt(sections)`

新建 `src/renderer/src/features/chat/lib/build-system-prompt.ts`：**调用方备料、纯函数拼装**，无 IO、无 Effect 依赖，完全可测。节构成与顺序固定：

```
身份段 → Available tools 列表 → guidelines → [Workspace context] → [project_instructions] → [skills] → 用户默认值 → [cwd 页脚]
```

- **身份段**：恒常串（"You are an AI assistant with access to file system tools."）
- **工具列表**：静态内置工具（5 文件工具 + webfetch + run_command + _load_skill）的 toolSnippets 写死 + 动态工具（MCP）description 截断追加（120 字符上限）
- **guidelines**：恒常行为指南硬编码（edit_file old_text 唯一匹配、10MB 限制、二进制/可执行文件拦截、workspace 边界），Set 去重
- **workspace 节**：`workspaceId` + 文件工具传参规则（自现有 `[Workspace context]` 内联段迁入）
- **project_instructions**：工作区 AGENTS.md 内容（读到的才注入）
- **skills 段**：复用 `formatSkillsManifestSection` 产物
- **用户默认值**：`systemPrompt.default`（子代理场景 = `config.systemPrompt`），最后追加——用户可编辑的是「补充指令」而非整体
- **cwd 页脚**：`Current working directory: <root_path>`，仅在有 workspace 时输出

空节静默跳过；节间 `\n\n` 分隔。

### D2 — 会话覆盖 = customPrompt

不暴露独立 `customPrompt` 参数。`conversation.systemPrompt` 有值时**整体替换**内置节（身份/工具列表/guidelines/用户默认值），workspace 节、AGENTS.md、skills 节仍追加在其后。保持现状「会话覆盖优先」语义（原 `resolveSystemPromptForConversation`）。

### D3 — AGENTS.md 项目指令：每会话缓存一次

新建 `src/renderer/src/features/chat/lib/workspace-project-instructions.ts`：经 `FileApi.readFile(workspaceId, "AGENTS.md")` 读取。规则：

- 不存在/读取失败 → `null`（静默跳过该节）
- 超 32KB → 截断 + 尾注 `[truncated]`
- **每会话缓存一次**：会话首次 sendMessage 读取，结果缓存于会话状态，后续 sendMessage 复用（会话是快照语义）

### D4 — 组装时机：chat.store 备料，runtime 纯接收

`chat.store.ts` sendMessage 内完成备料（workspace 信息、enabledSkills、projectInstructions、用户默认值、会话覆盖）并调用组装器产出 `finalSystemPrompt`。`runtime.ts` 删除自身 skills 拼接（L347-350），`provider.systemPrompt` 即完整组装结果。

### D5 — 子代理一并接入

`sub-agent-factory.ts` 改用组装器。子代理生效节：身份段 + 工具列表（按 `allowedTools` 过滤对应 snippet）+ guidelines + skills 段（`baseProvider.enabledSkills`，**顺带修复子代理缺失 skills 注入的问题**）+ `config.systemPrompt` 追加。无 workspace / 无 AGENTS.md 节（子代理无 workspace 绑定）。

### D6 — 默认值统一为空串

`app.store.ts` 的硬编码默认串搬入内置节（身份段 + guidelines），两处默认值统一为 `systemPrompt: { default: "", userCanEdit: true }`（renderer + main 已一致）。settings schema 结构不变。

### D7 — 旧函数去留

`settings/lib/system-prompt.ts`：删 `resolveSystemPromptForConversation`（逻辑迁入 chat.store 备料），保留 `getDefaultSystemPrompt` / `getUserCanEdit` / `updateDefaultSystemPrompt`。

## Considered Options

- **用户默认值整体替换（旧语义）vs 内置节 + 追加（选定）**：选追加——用户编辑的是补充指令，产品恒常规则（文件工具边界）不因用户编辑丢失。接受行为变化（提示词从近乎空白升级为完整分节）。
- **组装器自备料（Effect）vs 调用方备料（选定）**：选调用方备料——组装器保持纯函数、测试零 mock；AGENTS.md 读取是唯一 IO 点，隔离在独立模块。
- **runtime 组装 vs chat.store 组装（选定）**：选 chat.store——备料所需上下文（workspaceId、用户默认值、enabledSkills、会话覆盖）全在 sendMessage，组装集中一处，runtime 回归纯执行。
- **子代理不接入 vs 接入（选定）**：选接入——统一提示词构建路径，顺带修复子代理缺 skills 段问题。

## Consequences

### 正面

- 系统提示词组装集中一处，新增节/调整顺序零成本
- 恒常产品规则（文件工具边界）不再依赖「用户恰好没编辑默认串」才生效
- 子代理获得与主对话一致的提示词结构（含 skills 注入）
- 组装器纯函数，行为可精确测试（节顺序/空节/覆盖/去重/截断）

### 代价

- 提示词长度显著增加（内置节 + 工具列表 + guidelines），token 成本上升；token 估算（chat-view/home 的 `Math.ceil(length/4)`）保持现状粗算，不含新节——**已知低估，不在本次范围**
- 行为变化影响现有会话的模型行为（已获用户确认接受）
- 子代理行为变化，sub-agent 相关测试需同步更新
- AGENTS.md 注入引入用户可控内容，32KB 截断为护栏

### 跨文件影响清单

| 文件 | 改动 |
|---|---|
| `src/renderer/src/features/chat/lib/build-system-prompt.ts` | 新增 — 分节组装器纯函数 |
| `src/renderer/src/features/chat/lib/build-system-prompt.test.ts` | 新增 |
| `src/renderer/src/features/chat/lib/workspace-project-instructions.ts` | 新增 — AGENTS.md 读取/截断/缓存 |
| `src/renderer/src/features/chat/lib/workspace-project-instructions.test.ts` | 新增 |
| `src/renderer/src/features/chat/stores/chat.store.ts` | 改 — 备料 + 调组装器，删内联 workspace 拼串 |
| `src/renderer/src/features/chat/lib/runtime.ts` | 改 — 删 L347-350 skills 拼接 |
| `src/renderer/src/plugins/multi-agents/lib/sub-agent-factory.ts` | 改 — 接入组装器 + skills 注入 |
| `src/renderer/src/plugins/multi-agents/lib/sub-agent-factory.test.ts` | 改 — 断言组装节 |
| `src/renderer/src/features/settings/lib/system-prompt.ts` | 改 — 删 resolveSystemPromptForConversation |
| `src/renderer/src/features/settings/lib/system-prompt.test.ts` | 改 — 删对应测试 |
| `src/renderer/src/shared/stores/app.store.ts` | 改 — 默认串 → 空串 |
| `CONTEXT.md` | 改 — 加 System Prompt 组装器词条 |
| `docs/adr/0051-system-prompt-builder.md` | 本 ADR |

### 不可逆性

推翻本 ADR 需回退组装器 + 3 处调用点 + 恢复默认串 + 撤 ADR。总改动 ≥ 12 文件。行为变化（提示词结构）无法通过单纯回滚代码恢复用户已观测到的模型行为 → 不可逆标记成立。

## References

- 参考实现: pi `buildSystemPrompt`（customPrompt/toolSnippets/guidelines/contextFiles/skills/cwd 模式）
- ADR-0019 D2: systemPrompt 在 run() 时构造
- ADR-0031 D3: skills 段注入 system prompt
- ADR-0049: 子代理独立 Agent（本 ADR 统一其提示词路径）
- grill-with-docs session 2026-08-05 — 18 轮决策依据
