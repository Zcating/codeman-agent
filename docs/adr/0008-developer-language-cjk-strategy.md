# ADR 0009 — 开发者语言中文化策略（V1.6+）

- Status: Accepted
- Date: 2026-06-14
- Scope: codeman-agent V1.6 全项目（`src/**` / `src-tauri/**` / `e2e/**` / 治理文档）
- Supersedes: 隐式约定（"全英文开发者语言"）
- Related: (Effect-TS 逻辑层), (Tailwind v4), (单 main 窗口), (Feature-Sliced), `CONTEXT.md` § Localization, `docs/translation-rules.md`, `CONTRIBUTING.md`

## Context

V1 落地时（Wave 1-7 + Wave 8 ADR-0008），开发者语言保持 100% 英文：

- 源码注释、log / panic / `Result::Err` 字符串、测试描述
- 治理文档（`CONTEXT.md` / `AGENTS.md` / 8 个 ADR）
- 标识符（类型 / 函数 / 变量 / 字段 / namespace）

`Settings.user_language: "zh" | "en" | "auto"` 在 V1 是**摆设**：Settings
schema 里存在该字段，但**没有 i18n runtime 下游**。UI 字符串（按钮 /
placeholder / 错误信息）全部 hardcoded 英文，与 `user_language` 解耦。

主要摩擦点：

1. 中文 first contributor 读英文注释需中英切换，认知开销持续存在。
2. `CONTEXT.md` / `AGENTS.md` 是项目核心知识库，全英文对中文读者门槛高。
3. 标识符中文化（把所有 type / function 名翻译成中文）会破坏
   Tauri / Solid / Effect-TS / pi-mono / Tailwind / Vite / Vitest /
   Playwright 的英文生态对齐，跟 linter 错误堆栈、Stack Overflow 检索、
   PR review 工具链冲突。
4. UI 字符串中文化需要 i18n 基础设施（i18n 库 + locale 文件 + key 抽取），
   是独立工程量，跟"注释中文化"是两个 PR。

权衡结果：采用**混合策略** —— 标识符 / UI 字符串 / 库专名保留英文，
其余（注释 / 治理文档 / 测试描述 / log / panic / Err）走中文。Going-
forward 政策是**新写默认中文**（convention shift，不是 one-time
cleanup）。

## Decision

### 1. 范围

**In scope**：

- `src/**/*.{ts,tsx}` 内的注释、JSDoc 描述、字符串字面量（log /
  fixture）
- `src-tauri/src/**/*.rs` 内的 doc comment（`///` `//!`）、行内注释
  （`//`）、`log::*!` / `tracing::*!` / `panic!` / `Result::Err("...")`
  字符串
- `e2e/**/*.spec.ts` 内的注释、`it("xxx")` / `test("xxx")` 描述、fixture
- `docs/adr/0001-0008-*.md` —— 8 个现有 ADR body 翻译
- `CONTEXT.md` —— 翻译为中文 body + 英文为主术语头
- `AGENTS.md`（根 + 7 个子 `AGENTS.md`）—— body 翻译
- 新建 `README.md`（项目自写，**覆盖** Tauri 模板默认占位）

**Out of scope**（明确不动）：

- **Tauri 模板默认 `README.md`** —— 在项目自写 README 落地后**整文件
  覆盖**；单独保留无意义
- **`.agents/skills/*`**（24+ 个 `SKILL.md`）—— 保留英文。AI agent
  skill 训练数据以英文为主，跨语言翻译会丢语气和约束
- **`.omo/*`**（agent working files / notepads / plans / evidence）——
  临时工作产物
- **`CHANGELOG.md`**（尚未存在，未来创建时走"新写默认中文"）
- **`pnpm-lock.yaml` / `Cargo.lock` / `*.json` 配置文件** —— 无注释
- **`scripts/*`** —— 脚本一般无注释

### 2. 标识符规则

**所有 identifier 保持英文**：

- 类型名、trait 名、interface 名（`AgentRuntime`、`Bridge`、`Secret`、
  `Snapshot`、`Settings`、`Conversation`、`Message`）
- 函数名、方法名（`get_balance`、`sendMessage`、`update_settings`）
- 变量名、字段名（`llm_providers`、`refresh_interval_secs`、
  `api_key_ref`、`system_prompt`）
- 模块 / namespace（`tauri::command`、`keyring`、`store`）
- 配置 key（Tauri store path、env var、IPC 命令名）

注释 / 文档 prose 中**引用 identifier 用反引号包住**（markdown
`` `AgentRuntime` ``），不在 prose 中裸写 `camelCase` 与中文混排。

### 3. 治理文档语言

- **body 翻译为中文**（prose、章节说明、`_Avoid_` 段落）
- **术语头格式**：`**English Term (中文译名)**` —— 英文为主，中文括注
  - 例：`**Agent Runtime (代理运行时)**` / `**Bridge (桥接层)**` /
    `**Snapshot (快照)**`
- 跨文档引用时使用术语头中的英文部分，**保证 grep 一致性**（中英
  混排时以英文为锚点）

### 4. 注释 / log / panic / Err 字符串（开发者字符串）

| 元素                                                     | 规则 |
| -------------------------------------------------------- | ---- |
| TS / TSX `//` `/* */` `/** */` 注释                      | 中文 |
| Rust `///` `//!` `//` 注释                               | 中文 |
| `console.log` / `console.error` / `console.warn`         | 中文 |
| `log::*!` / `tracing::*!` / `println!`                   | 中文 |
| `panic!` / `unreachable!`                                | 中文 |
| `Result::Err("...")` / `AppError::Message("...")` 字符串 | 中文 |

判断标准：字符串字面量**写到哪里去**？去 log 文件 / console / panic
堆栈 → 开发者字符串 → 中文。**例外**：跟 i18n key 关联的 Err（V1 暂无
i18n runtime，本期不出现）。

### 5. 测试文件

| 元素                                                                       | 规则                                               |
| -------------------------------------------------------------------------- | -------------------------------------------------- |
| `it("xxx")` / `test("xxx")` 描述                                           | **中文**（test report 显示）                       |
| 文件内注释                                                                 | **中文**                                           |
| Fixture 中"用户消息"（模拟中文用户输入）                                   | **中文**                                           |
| Fixture 中"技术数据"（balance 数字、mock provider ID、API key 形式）       | 英文                                               |
| `expect().toBe('Settings')` / `toHaveTextContent('Save')` 等锚定 UI 字符串 | **英文**（runtime check 必须跟 UI 字符串完全匹配） |
| `expect().toHaveBeenCalledWith({ ... })` 内的 fixture                      | 中文 fixture 走中文，技术 fixture 走英文           |

> **术语消歧**：本项目**区分 Test Description / Assertion / UI
> String**（见 `CONTEXT.md` § Localization）。`it("xxx")` 中的
> `xxx` 是 Test Description，**不是** vitest 文档中的 Assertion。

### 6. UI 字符串（明确不在范围）

- UI 字符串（按钮 / placeholder / aria-label / 错误展示）V1 保持
  hardcoded 英文
- `Settings.user_language` 字段 V1 是**摆设**（无 i18n runtime 下游）
- 未来 i18n 基础设施另开 ADR 评估（候选栈：solid-i18n /
  @solid-primitives/i18n + `zh.json` / `en.json`）

### 7. Git 协作层

- **commit message 格式**：保留 conventional commits（`feat(ui):
xxx`），`type(scope):` 保持英文（机器可读 + 生态兼容），**subject 走
  中文**
  - 例：`feat(chat): 添加对话气泡组件` /
    `fix(provider-card): 处理空 API key 边界`
- **branch name**：英文 ASCII identifier 风格（`feature/chat-bubble`、
  `fix/api-key-empty`）
- **PR 描述 / CHANGELOG**：中文
- 不引入 commitlint / commit-msg hook（informal 约定）

### 8. 翻译工作流（5 路并行）

PR #1（本 PR）只动 policy + 工具链，不动源码 / 文档翻译。翻译工作
按 dependency 顺序分 5 路并行：

1. **`docs/adr/` + `CONTEXT.md`** —— 治理文档，policy 层
2. **`AGENTS.md`**（根 + 7 个子）—— 域规则，operational 层
3. **`src/shared/` + `src/features/`** —— 前端源码
4. **`src-tauri/`** —— Rust 后端源码
5. **`e2e/` + `**/\*.test.{ts,tsx}`\*\* —— 测试

每路开工前必读 `docs/translation-rules.md`，术语歧义以该文件为准。
5 路间术语一致性靠**统一规则文档**而非人工 review 抓。

## Operational enforcement

### 翻译规则手册

- **`docs/translation-rules.md`** —— 翻译操作手册，包含 8 节：
  1. 品牌名 / 库专名保留表
  2. 术语映射表（按词类，~80 项）
  3. 标点规则（全角 vs 半角）
  4. 注释格式（TS / Rust / 通用）
  5. 数字 / 单位
  6. 标识符引用规则
  7. 例外清单
  8. 更新本文件的流程

### PR 模板 checklist

提交 PR 前确认：

- [ ] **新增 identifier 已加 `CONTEXT.md` 术语条目**（详见 "Glossary
      增补"）
- [ ] **新注释遵守 `docs/translation-rules.md` 规则**
- [ ] `vp run typecheck` 通过
- [ ] `vp run test` 通过
- [ ] `cargo test` 通过
- [ ] `vp run e2e` 通过（新增 IPC 命令时同步加 e2e spec）
- [ ] commit message 格式：`type(scope): 中文 subject`
- [ ] branch name 英文 ASCII：`feature/xxx` / `fix/xxx` / `docs/xxx`

### Contributor 入门

- **`CONTRIBUTING.md`** —— Quick start + 必读文档顺序 + 上面 PR
  checklist 的镜像 + Glossary 增补门槛

### 验证手段

- **不引入 custom lint 脚本**（如 `scripts/check-chinese-comments.mjs`）
  —— 漏译靠 review 阶段发现，列入 follow-up
- 依赖现有 pipeline：`vp run typecheck` + `vp run test` + `cargo test` +
  `vp run e2e` 抓语法 / 类型 / 行为错误
- identifier 改动靠 `vp run typecheck` 强制（type 错误 → CI 红）

## Glossary 增补机制

新增 identifier 时按以下门槛决定是否在 `CONTEXT.md` 加术语条目：

| 情形                                                     | 是否需要加         |
| -------------------------------------------------------- | ------------------ |
| 跨 ≥ 2 文件的 public type / function / interface / trait | **必须**           |
| 引入新的 external dependency（npm / cargo）              | **必须**           |
| 1 个文件内 private helper（不出 module）                 | 不必               |
| 已有 glossary 条目但翻译 / 含义变化                      | 更新现有条目       |
| 与现有术语同义的新 identifier                            | 不必（用现有术语） |

`CONTRIBUTING.md` 详细文档化此机制 + PR template checklist 强制。

## Considered options

### Why not 全英文（status quo）

保持 100% 英文注释 + 文档。**优点**：英文 contributor pool 大、Stack
Overflow 检索方便、跨语言一致性零成本。**缺点**：中文 first contributor
门槛高、`CONTEXT.md` / `AGENTS.md` 知识库对中文读者不友好、与本项目
"中文 LLM 工具" 的产品定位（billing 工具 + DeepSeek / MiniMax）不匹配。

### Why not 双语并列（同一文件 / 上半中文 + 下半英文）

每个文件双语版本。**优点**：双语可读。**缺点**：维护成本 2×、每次
更新要同步两版、跨版本漂移风险高。

### Why not 中文 identifier（类型 / 函数 / 变量名也翻译）

`AgentRuntime` → `代理运行时`，`Snapshot` → `快照`。**优点**：彻底
中文。**缺点**：破坏 Tauri / Solid / Effect-TS / pi-mono / Tailwind /
Vite / Vitest / Playwright 生态对齐；linter 错误堆栈（"Type 'X' is not
assignable to type 'Y'"）跨语言断链；Stack Overflow / GitHub Issue 检索
失效；Tauri 工具链、Tauri store key、IPC 命令名同步要改，blast radius
极大。**不推荐**。

### Why not 仅文档中文化（注释保持英文）

只翻 8 个 ADR + `CONTEXT.md` + `AGENTS.md`，注释保持英文。**优点**：
scope 最小。**缺点**：prose 跟 code 之间的语言断层最大（文档说
"代理运行时"，代码注释说 "AgentRuntime layer"），与"中文 first
reader" 的核心目标弱相关。

### Why not 把 UI 字符串也翻（override Q6）

UI 字符串中文 + i18n 基础设施。**优点**：全栈中文一致。**缺点**：
是独立工程量（i18n 库 + locale 文件 + 字符串抽取），应独立 ADR /
独立 PR 评估，不该跟"注释 + 治理文档"混淆。

## Consequences

### 正向

- **中文 first reader 友好**：`CONTEXT.md` / `AGENTS.md` / ADR /
  runtime.ts 注释 / test description 全部中文，跟产品目标受众对齐
- **grep 一致性**：identifier 始终英文，跨 `.ts` / `.rs` / `.md` 可用
  同一 keyword 检索
- **生态兼容**：Tauri / Solid / Effect-TS / pi-mono / Tailwind / Vite
  / Vitest / Playwright 工具链零破坏
- **UI / runtime 字符串分层清晰**：UI 字符串 = i18n 范畴，开发者字符串
  = developer-language 范畴

### 负向

- **英文 contributor pool 缩小**：未来招募英文 first 协作者时，初始
  阅读成本上升。**Mitigation**：术语头英文为主 + identifier 英文 +
  `.agents/skills/*` 保留英文；关键 README 未来可加英文版
- **`CONTEXT.md` / `AGENTS.md` / ADR 体量约 1.3-1.5x**：中文表达比
  英文略冗长。**Mitigation**：不在 prose 中展开细节，链接到代码
- **glossary 增补门槛**：未来新增 identifier 时需同步加 `CONTEXT.md`
  条目。**Mitigation**：PR checklist + `CONTRIBUTING.md` 文档化门槛
- **i18n 仍未落地**：`user_language` 设置是摆设，UI 字符串全英文。
  **Mitigation**：未来独立 ADR 评估 i18n 基础设施

### 与现有 ADR 的关系

- **ADR-0003 (Effect-TS)**：本 ADR 不变更"UI 不导入 effect"约束
- **ADR-0006 (Tailwind v4 utility-only)**：本 ADR 不引入 class name
  中文化（class 仍是英文）
- **ADR-0007 (单 main 窗口 + TanStack Router)**：本 ADR 不变更
  webview 架构
- **ADR-0008 (Feature-Sliced + UI 原子)**：本 ADR 在其基础上补充
  developer-language 维度

## References

- `CONTEXT.md` § Localization（本 ADR 同步新增）
- `docs/translation-rules.md`（本 PR 同步新建）
- `CONTRIBUTING.md`（本 PR 同步新建）
- 顶层 `AGENTS.md` "ADR 索引" 段（同步新增 0009 行）
- 现有 8 个 ADR（0001-0008，本 PR 翻译为中文 body）
- Tauri / Solid.js / Effect-TS / pi-mono / Tailwind v4 官方文档（生态
  对齐依据）
- conventional commits 规范（commit message type 保留英文）
