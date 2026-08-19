# 0031 — Skills System (V1: Prompt Augmentation, Local Directory + Ship-with-App)

**Status**: accepted · **Date**: 2026-07-21 · **Scope**: src/plugins/skills/ (新增) + src/main/skills-* (新增) + src/resources/skills/ (新增) + src/features/chat/lib/runtime.ts (改 — system prompt injection) + src/features/chat/components/chat-view.tsx (改 — SlashMenu) + src/features/chat/components/home.tsx (改 — SlashMenu) + src/features/settings/components/skills-tab.tsx (新增) + src/renderer/shared/lib/ipc.ts (改 — SkillsService) + src/main/index.ts (改 — first-launch skill seeding) + electron-builder.yml (改 — extraResources)

**Related**: (Effect-TS logic layer, 不变), (5+1 feature whitelist — 新增 skills feature 第 4 个), (per-run transient agent — Skills 在 run() 入口注入 system prompt), (effect/Schema default)

## Context

### 触发：用户/产品 2026-07-21 提出

> "实现 Skills 和 MCP 功能。"

`Skills` 在 codeman-agent 当前形态里**没有用户面含义**——`.agents/skills/`、`skills-lock.json`、`.claude/skills/` 全部是 **AI agent 自身**用的 skill 体系（我作为 Sisyphus 调用 `/work-work` / `/grill-with-docs` 用的就是这个）。codeman-agent 的**端用户**目前没有任何"加载额外能力"的入口——只能依赖 Settings 写 system prompt。

2026-07-21 grill-with-docs session 锁定本 ADR 内容。

### 设计张力（grill 已收齐）

1. **Skill 是 prompt-only 还是 prompt+tools？**
   grill 决议：**(α) prompt only**。Skill 不带 AgentTool、不带 UI 资源。原因：MCP 接管「给 agent 加新工具」职责，Skill 专注「给 agent 加新 prompt 上下文」。两者职责正交。
2. **Skill 怎么激活？**
   grill 决议：**双轨 = 描述驱动 + slash**。
   - 描述驱动：每个 Skill 的 YAML frontmatter (`name` + `description`) 在每次 `run()` 时被拼进 system prompt；LLM 读描述后主动用 meta-tool `_load_skill` 请求加载完整 SKILL.md → 内容拼进对话 context。
   - Slash：用户在 chat 输入框打 `/<skill-name>`，SlashMenu 弹补全；选中后该 Skill 立即被加载到 system prompt（不走 LLM 决策）。
3. **Skill 存哪？**
   grill 决议：`~/.agents/skills/<skill-name>/SKILL.md`。与现有 `.agents/skills/`（项目级，agent 自身用）**同根 + 同格式**——但**不同语义**：
   - `.agents/skills/` (项目级) = 给 AI agent 自己的 skill 集合（Sisyphus 用 `/work-work` 等）
   - `~/.agents/skills/` (用户级, `$HOME`) = 给 codeman-agent 端用户用的 Skill 集合

   两者 SKILL.md 格式完全一致（YAML frontmatter + Markdown body）。复用 SKILL.md 格式让 OpenCode / Claude Code / Cursor 等生态里已写的 skill 直接可用。
4. **Skill 来源？**
   grill 决议：**预装 + 本地目录**。无 marketplace、无网络安装、无 GitHub URL 流程。
   - 预装：app 启动时把 `src/resources/skills/<name>/SKILL.md` 拷贝到 `~/.agents/skills/<name>/SKILL.md`（idempotent：已存在不覆盖）
   - 本地目录：用户手动 git clone / 下载 zip / 写 SKILL.md 到 `~/.agents/skills/<name>/SKILL.md`

## Decision

### D1 — Skill 文件格式：复用 SKILL.md（YAML frontmatter + Markdown body）

```
~/.agents/skills/<skill-name>/SKILL.md
---
name: <skill-name>          # 必须与目录名一致
description: <one-line>     # 必须,会被嵌入 system prompt
---

# Markdown body — Skill 完整指令
Skill 的全部内容在 LLM 主动 `_load_skill` 或 slash 触发后被读入对话 context。
```

**约束**：
- `name` 必须 = 目录名；不一致启动时 `console.warn` 并跳过。
- `description` 必填；为空则该 Skill 在 manifest 中不可见（description 缺失 = 不可能被自动发现）。
- 文件不存在或 frontmatter 解析失败 → 该 Skill 在 list 中省略，`~/.agents/skills/_corrupt/` 子目录保留原文件供用户排查。

### D2 — 启动时一次性扫描 + manifest 缓存

`src/main/skills-scanner.ts::scanSkillsDir()`：
- 入参：`~/.agents/skills/`
- 出参：`SkillManifest[] = [{ name, description, path, source: "preinstalled" | "user" | "corrupt" }]`
- 调用时机：Electron main `app.whenReady()` 内、IPC handler 首次被调时（lazy refresh on file change）
- **不**做文件 watcher（grill 决议 MVP 不含热加载）。用户改 SKILL.md 后需重启 app 或点 Settings → Skills → Refresh 按钮。

### D3 — System prompt 注入：每次 `run()` 拼一次 manifest

`src/plugins/skills/lib/skill-injector.ts::formatSkillsManifestSection(manifests: SkillManifest[]): string` 返回：

```xml
<available_skills>
You have access to the following skills. When a user's request matches a skill's purpose, call the `_load_skill` tool with the skill name to load its full instructions.

<skill>
<name>commit-helper</name>
<description>Generate a conventional commit message from staged changes.</description>
</skill>
<skill>
<name>code-review</name>
<description>Review a git diff for bugs, performance issues, and style problems.</description>
</skill>
...
</available_skills>
```

`src/features/chat/lib/runtime.ts` 改造：构造 `Agent.initialState.systemPrompt` 时 = `provider.systemPrompt + "\n\n" + formatSkillsManifestSection(enabledSkills)`。

**「启用」语义**：用户可在 Settings → Skills tab toggle 每个 Skill 的 enabled。disabled Skill 的 manifest **不**出现在该 section 里（不参与 LLM 自动发现 + 不响应 slash）。

### D4 — LLM 主动加载 Skill：meta-tool `_load_skill(name: string)`

Skill manifest 不告诉 LLM 怎么加载完整内容——LLM 必须能**主动拉**。决议：**meta-tool 模式**。

```ts
// src/plugins/skills/lib/skill-meta-tool.ts
const loadSkillTool: AgentTool = {
  name: "_load_skill",
  description: "Load the full instructions of a previously-listed skill into the conversation context.",
  parameters: Schema.Struct({ skillName: Schema.String }),
  execute: ({ skillName }) => Effect.sync(() => {
    const skill = readSkillFile(skillName); // throws SkillNotFound if missing
    return { content: skill.body }; // 会被注入到 tool_result
  }),
};
```

**流式语义**：
1. LLM 决定「我需要 skill X 的完整指令」→ emit `tool_call(_load_skill, { skillName: "x" })`
2. runtime 读 `~/.agents/skills/x/SKILL.md` body，return `{ content: body }`
3. tool_result 走标准 Anthropic `user` role message（与现有 tool 结果同语义）
4. **下个 turn** LLM 在 context 里看到 skill body，按 skill 内容行动

**关键点**：skill body 不走 system prompt 拼——LLM 在 tool_result 看到的 body 跟普通 tool result 同等待遇；不享受「系统指令永远在上下文」特权。下次 restart agent 后 body 不在——这是**预期**行为（避免 skill body 在 context 永久累积撑爆 window）。

### D5 — Slash 命令：用户显式触发

Chat 输入框 + Home 表单中：
- 输入 `/` → SlashMenu 弹出（基于 `enabledSkills`）
- 继续输入字符 → fuzzy-filter Skills by name + description
- Enter 选中 → 在 textarea 插入 `/<skill-name> `，并触发立即加载（等价于先发一条 `/<skill-name> ` 用户消息，**加上** runtime 在该 turn 入口预加载 skill body）

**实现**：
- 独立组件 `src/plugins/skills/components/slash-menu.tsx`，使用 `@ark-ui/solid` Popover / Combobox（V1 用现成的 `codeman-select` 不合适——需 fuzzy filter + custom 渲染）
- hook 进 chat-view.tsx + home.tsx 的 textarea onKeyDown（检测 `/` 触发）
- 选中后处理：
  - 在 input value 里插入 `/<skill-name> ` 文本（带 trailing space）
  - **不**直接 send。user 看到 `/commit ` 在输入框里可继续追加参数，例如 `/commit amend` 或 `/commit fix login bug`
  - 当 user 最终按 Enter 提交时，chat.store 的 handleSend 在**调用 `runtime.run()` 前**先 resolve `/<skill-name>` → 读取对应 SKILL.md body → 把它**作为 assistant 上下文**通过一条 system/assistant message 注入到 `context: Message[]` 里（具体形态：append 一条 `{ role: "user", content: "<skill-name> skill loaded:\n\n" + skillBody }` 作为可引用的 in-context 信息）

**细节决定**：slash command **不**作为 user 消息内容发出（避免污染对话历史）。实现：在 send 时把 `/xxx ...` 替换为正常 user 消息（保留 `/xxx ...` 后面的内容），同时**提前**把 skill body 注入 context。

**简化 MVP**：V1 不做完整 slash command 解析参数。`/skill-name <rest>` 等价于：
- 解析 `/skill-name` 去掉前缀
- `<rest>` 作为 user 消息发出
- skill body 已注入 context

### D6 — Ship-with-app Skills：4 个预装

`src/resources/skills/<name>/SKILL.md` 包含：

| Skill 名 | 描述（system prompt 嵌入） |
|---|---|
| `commit-helper` | Generate a conventional commit message from staged git changes. Use when the user asks for help writing a commit message. |
| `code-review` | Review a git diff for bugs, performance regressions, and style problems. Use when the user asks to review changes or PRs. |
| `explain-error` | Diagnose an error message or stack trace and propose likely causes and fixes. Use when the user pastes an error and asks "what does this mean?" or "why is this happening?". |
| `summarize` | Summarize long content (files, articles, conversation history) into a concise structured summary. Use when the user asks for a summary or TL;DR. |

每个 SKILL.md body ≤ 2 KB，描述 LLM 何时该调用、调用时该做什么、输出格式约束。

### D7 — 启动时复制预装 Skills（idempotent）

`src/main/skills-host.ts::ensurePreinstalledSkills()`：
- 在 `app.whenReady()` 内、调 IPC handler 前执行一次
- 遍历 `process.resourcesPath/skills/<name>/SKILL.md`（electron-builder `extraResources` 路径）
- 对 `~/.agents/skills/<name>/SKILL.md`：已存在跳过；不存在复制
- **不**覆盖用户修改过的版本（idempotent skip on exists 是 MVP 简化——V2 加 hash 检测 + 更新提示）

### D8 — Skills 持久化状态 = `~/.agents/skills/` 目录 + Settings.enabledSkills

| 数据 | 存储 | 备注 |
|---|---|---|
| Skill 文件本身（content） | `~/.agents/skills/<name>/SKILL.md` | 用户/Git clone 写入 |
| 用户启用的 Skill 列表 | `Settings.enabledSkills: Set<string>` | 与现有 Settings JSON 同档 (per)；不引新存储 |
| Skill 来源标记（preinstalled/user） | 从 `~/.agents/skills/_meta.json` 或运行时扫描判断 | MVP：从 manifest 是否含 `~/.agents/skills/.preinstalled/` 标记判断 |

**不**新建 SQLite 表（与 Settings JSON 单档原则一致, per ADR-0015）。

### D9 — Settings UI：Skills tab

`src/features/settings/components/skills-tab.tsx`：
- 列表所有 scanned Skills（含 corrupt 在底部以红色灰标）
- 每条 Skill 显示：name + description + source badge (`Pre-installed` / `User`) + enabled toggle
- 顶部 Refresh 按钮重扫磁盘
- 「打开 Skill 文件夹」按钮调 `shell.openPath('~/.agents/skills/')`

挂到 `src/features/settings/routes/settings-layout.tsx`，新增 SidebarItem `Skills`。

> **迁移注记 (2026-07)**：D9 的 Settings sidebar 入口已被 2026-07 插件迁移 supersede。Skills 现归属 chat-sidebar 的「插件」分组，canonical route 为 `/plugins/skills`；旧 `/settings/skills` 路由保留重定向以兼容。文档不再反映 Settings 入口，仅反映当前实现。

### D10 — SlashMenu 组件契约

```tsx
// src/plugins/skills/components/slash-menu.tsx
export interface SlashMenuProps {
  /** 当 textarea 含 "/" 触发; null = 关闭 */
  trigger: { query: string; textareaRect: DOMRect } | null;
  /** 从 enabledSkills 派生的候选项 */
  candidates: SkillManifest[];
  /** 选中后插入 textarea + 立即加载 skill body */
  onSelect: (skill: SkillManifest) => void;
}
```

实现：fixed-position popup（基于 textareaRect 算 top/left），里面 `<For each={fuzzy(candidates, query)}>` 渲染候选项，↑↓ 选择，Enter 触发 onSelect，Esc 关闭。

## Considered Options

### Skill 是 prompt only vs prompt+tools（已决议 α）

**拒绝 (β) prompt+tools**：
- Skill 已可借 MCP 加 tools,职能重叠
- Skill 自带工具会让 runtime 同时面对两类扩展点 (Skill tools + MCP tools),路由/优先级复杂
- Skill 是"上下文知识",MCP 是"能力扩展"——两者职责正交

### 双轨 (描述驱动 + slash) vs 单选（已决议 (iii)）

**拒绝 (i) 仅描述驱动**：用户无法直接调 "我就要用 X skill"——必须依赖 LLM 决策;不直观
**拒绝 (ii) 仅 slash**：丧失自动发现能力——open-ended 对话无法让 LLM 主动用 skill
**拒绝 (iv) hook-based**：事件模型复杂、超出 V1 范围

### Skills 目录 `~/.agents/skills/` vs `~/.codeman/skills/` vs `~/.local/share/codeman/skills/`

**拒绝 `~/.codeman/skills/`**：与项目自带的 `.agents/skills/` (agent 自身用) 不直观区分;`codeman` 是 app 品牌,不该复制 agent 工具链习惯
**拒绝 XDG (`~/.local/share/...`)**：当前项目 Settings 走 `%LocalAppData%\codeman-agent\`,与 XDG 路径风格不一致;V2+ 再统一

**采用 `~/.agents/skills/`**：与现有 agent 生态的 skill 目录**字面一致**,用户从 Claude Code / Cursor 迁移认知零成本;`~/.agents/` 根目录作为「agent 生态配置根」承载 skills + skills-lock.json + mcp_servers.json(per),统一品牌感。

### Skill 加载机制：meta-tool vs system prompt 拼全文

**拒绝 system prompt 拼全文**：4 个 skill × 2 KB = 8 KB system prompt,每次 run() 都拼;多数对话用不到,严重浪费 token window
**拒绝 inline user message 拼**：污染 user 对话历史,UI 出现 "user message: <skill-body>" 的伪消息

**采用 meta-tool `_load_skill`**：LLM 主动拉、按需加载;与现有 tool result 路径一致;runtime 改造最小(新增 1 个 meta-tool,context 不被污染)。

## Consequences

### 正面
- **端用户有"加能力"入口**：从 0 → 1 跨越
- **与 MCP 职责正交**：Skill = 知识, MCP = 工具, 互不干扰
- **与现有 `.agents/skills/` 同格式**：可直接复用 OpenCode/Claude Code 生态的 SKILL.md
- **Settings 单档保持**：enabledSkills 走现有 Settings JSON, 不引新表 (per)
- **LLM 自动发现 + 用户显式触发双轨**：覆盖两种交互模式

### 代价
- 启动时多一次目录扫描 (~10ms, 可接受)
- meta-tool `_load_skill` 增加工具注册表 1 项（11 个 tool: 2 billing + 5 file + 1 meta + 3 future... ）
- 4 个 ship-with-app Skills 增加 ~6 KB 安装体积
- SlashMenu 需 fuzzy filter,新增 ~100 行 UI 代码
- runtime.ts 增加 system prompt 拼接逻辑 ~20 行

### 跨文件影响清单

| 文件 | 改动 |
|---|---|
| `src/plugins/skills/index.ts` | 新增 barrel |
| `src/plugins/skills/AGENTS.md` | 新增 |
| `src/plugins/skills/lib/skill-loader.ts` | 新增 — scan + parse YAML frontmatter |
| `src/plugins/skills/lib/skill-loader-schema.ts` | 新增 — SkillManifest / SkillFrontmatter schemas |
| `src/plugins/skills/lib/skill-loader.test.ts` | 新增 |
| `src/plugins/skills/lib/skill-injector.ts` | 新增 — formatSkillsManifestSection() |
| `src/plugins/skills/lib/skill-injector.test.ts` | 新增 |
| `src/plugins/skills/lib/skill-meta-tool.ts` | 新增 — `_load_skill` AgentTool wrapper |
| `src/plugins/skills/lib/skill-meta-tool.test.ts` | 新增 |
| `src/plugins/skills/stores/skills.store.ts` | 新增 — enabled skills signal + loadSkill() action |
| `src/plugins/skills/stores/skills.store.test.ts` | 新增 |
| `src/plugins/skills/components/slash-menu.tsx` | 新增 |
| `src/plugins/skills/components/slash-menu.test.tsx` | 新增 |
| `src/main/skills-host.ts` | 新增 — preinstalled skills seed + IPC handlers |
| `src/main/skills-host.test.ts` | 新增 |
| `src/main/index.ts` | 改 — `whenReady` 内调 `ensurePreinstalledSkills()` |
| `src/main/ipc.ts` | 改 — 加 `skills:scan` / `skills:load` / `skills:open-dir` IPC handlers |
| `src/resources/skills/commit-helper/SKILL.md` | 新增 |
| `src/resources/skills/code-review/SKILL.md` | 新增 |
| `src/resources/skills/explain-error/SKILL.md` | 新增 |
| `src/resources/skills/summarize/SKILL.md` | 新增 |
| `electron-builder.yml` | 改 — `extraResources: ["./resources/**/*"]` |
| `src/renderer/shared/lib/ipc.ts` | 改 — SkillsService Tag + Live Layer |
| `src/renderer/shared/lib/types.ts` | 改 — `Settings.enabledSkills: string[]` |
| `src/main/settings-schema.ts` | 改 — `enabledSkills: Schema.Array(Schema.String)` + sanitize 默认 `["commit-helper", "code-review", "explain-error", "summarize"]` |
| `src/features/settings/components/skills-tab.tsx` | 新增 — 列表 + toggle + Refresh |
| `src/features/settings/routes/settings-layout.tsx` | 改 — Sidebar 加 "Skills" item |
| `src/features/chat/lib/runtime.ts` | 改 — systemPrompt 拼接 + `_load_skill` 注册 |
| `src/features/chat/lib/runtime.test.ts` | 改 — 加 skills 注入测试 |
| `src/features/chat/components/chat-view.tsx` | 改 — 集成 SlashMenu |
| `src/features/chat/components/home.tsx` | 改 — 集成 SlashMenu |
| `src/features/chat/components/chat-view.test.tsx` | 改 — slash 行为测试 |
| `CONTEXT.md` | 改 — 加 Skill / Skill Manifest / Slash Command / Slash Menu / Pre-installed Skill 词条 |
| `docs/adr/0031-skills-system.md` | 本 ADR |

### 不可逆性
推翻本 ADR 需:
- 删 `src/plugins/skills/` 全树
- 回退 `runtime.ts` system prompt 拼接
- 回退 settings-schema enabledSkills 字段
- 删 4 个 ship-with-app Skills
- 删 chat-view / home.tsx SlashMenu 集成
- 撤回本 ADR + 重写

总改动 ≥ 20 文件 + 1 ADR。成本有意义 → 不可逆标记成立。

## References

- SKILL.md 格式来源: `.agents/skills/*/SKILL.md` (项目已有 agent 自身 skill)
- Anthropic tool use protocol: provider.tools 字段, AgentTool.execute 返回值走 tool_result
- (per-run transient agent): systemPrompt 在 run() 时构造
- (effect/Schema default): SkillManifest 走 Schema.Struct
- (Settings 单 JSON 档): enabledSkills 走 settings-schema
- (5+1 feature whitelist): skills 是第 4 个 feature (chat / settings / file-tools / skills)
- grill-with-docs session 2026-07-21 — 决议依据