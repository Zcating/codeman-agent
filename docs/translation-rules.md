# 翻译规则（Translation Rules）

> **配套 ADR-0009**。本文件是 5 路并行翻译工作的**操作手册** —— 不是
> 政策本身（政策见 `docs/adr/0009-developer-language-cjk-strategy.md`），
> 而是把政策落地为可执行的规则。规则变化**不需走 ADR 流程**，直接 PR
> 修改本文件 + 在 PR description 引用即可。

## 1. 品牌名 / 库专名保留（不译）

以下名称保持原文，禁止翻译：

| 类别         | 名称                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------ |
| 桌面壳       | Tauri, WebView2, tauri-driver                                                              |
| UI 框架      | Solid.js, Solid, @solid-primitives                                                         |
| 样式         | Tailwind, Tailwind CSS, tailwind-merge, cva, class-variance-authority, clsx, lucide-solid  |
| 逻辑层       | Effect, Effect-TS, @effect/platform-browser, @effect/vitest, Layer, Stream, Effect Service |
| Agent 运行时 | pi-mono, pi-ai, pi-agent, @mariozechner/pi-ai, @mariozechner/pi-agent                      |
| 路由         | TanStack Router, TanStack                                                                  |
| 测试         | Vitest, Playwright, @solidjs/testing-library, jsdom, @testing-library                      |
| 持久化       | SQLite, FTS5, sqlx                                                                         |
| 密钥         | keyring (crate), Windows Credential Manager                                                |
| 构建         | Vite, vite-plugin-solid, vp, cargo, rustc                                                |
| 类型         | Rust `Secret<String>` newtype, `Result<T, E>`, `Option<T>`, `Result::Err`                  |
| 协议         | IPC, Tauri store, Tauri plugin                                                             |
| Web 标准     | HTML, CSS, JSX, TSX, TypeScript, ESM, CommonJS                                             |

**判断标准**：该名称在 GitHub Issue / Stack Overflow / 官方文档中是
brand-spelling 一致的形式 → 保留。

## 2. 术语映射表（canonical English 优先）

按词类排列。**首次出现**用 `<English> (<中文>)` 形式；后续出现可只用
中文或只用英文（视 prose 流畅度）。

### 2.1 领域核心

| 英文（canonical / code identifier） | 中文（首次出现用） | 备注                       |
| ----------------------------------- | ------------------ | -------------------------- |
| Agent                               | 代理               | 指"产品本身"               |
| Conversation                        | 会话               |                            |
| Message                             | 消息               |                            |
| Tool                                | 工具               | LLM 可调函数               |
| Tool Call                           | 工具调用           |                            |
| Tool Result                         | 工具结果           |                            |
| Snapshot                            | 快照               | 计费时点视图               |
| Balance                             | 余额               | 可充值                     |
| Plan Quota                          | 用量（套餐余量）   | 不可充值，固定             |
| Auto-recharge                       | 自动充值           |                            |
| Auto-archive                        | 自动归档           |                            |
| Stream                              | Stream             | Effect-TS 库专名，**不译** |

### 2.2 Provider 体系

| 英文             | 中文             | 备注                                     |
| ---------------- | ---------------- | ---------------------------------------- |
| LLM Provider     | 大语言模型提供商 | 首次出现用全名，后续可简称"LLM 提供商"   |
| Billing Provider | 计费提供商       |                                          |
| Provider         | （避免单用）     | 总是说"LLM Provider"或"Billing Provider" |
| Adapter          | 适配器           | per-billing-provider HTTP client         |

### 2.3 架构层

| 英文           | 中文          | 备注                                               |
| -------------- | ------------- | -------------------------------------------------- |
| Runtime        | 运行时        | Effect-TS 包装 pi-mono 的层                        |
| Bridge         | 桥接层        | Effect → Solid signal 翻译器                       |
| Effect Service | Effect 服务   | "Effect" 不译                                      |
| Layer          | Layer         | Effect-TS 库专名，不译                             |
| Stream         | Stream        | Effect-TS 库专名，不译                             |
| IPC            | IPC           | 协议名，不译                                       |
| Store          | 状态 / 存储   | **过载** —— Solid store = 状态，Tauri store = 存储 |
| Tag            | Tag           | Effect 数据类型，保留                              |
| Schedule       | Schedule      | Effect 数据类型，保留                              |
| Ref            | Ref           | Effect 数据类型，保留                              |
| Fiber          | Fiber         | Effect 运行时概念，保留                            |
| Service Tag    | Service Tag   | Effect 设计模式，保留                              |
| Effect Stream  | Effect Stream | 不译 "Effect" / "Stream"                           |
| Effect Layer   | Effect Layer  | 不译                                               |

### 2.4 密钥与安全

| 英文              | 中文          | 备注                       |
| ----------------- | ------------- | -------------------------- |
| Secret            | 密钥          | Rust newtype 时保留 Secret |
| LLM API Key       | LLM API 密钥  |                            |
| Billing API Key   | 计费 API 密钥 |                            |
| API Key Reference | API Key 引用  | `api_key_ref` 字段         |
| Tauri Store       | Tauri Store   | 不译 "Tauri"               |
| Keyring           | Keyring       | crate 名，不译             |
| Expose (Secret)   | 暴露          | `.expose()` 方法           |

### 2.5 Settings 与状态

| 英文         | 中文       | 备注                               |
| ------------ | ---------- | ---------------------------------- |
| Settings     | 设置       |                                    |
| Theme        | 主题       |                                    |
| Stale        | 过期       | snapshot stale 语义                |
| Archive      | 归档       |                                    |
| Window       | 窗口       | UI 窗口（不是 Rust struct Window） |
| Tauri Window | Tauri 窗口 | Rust struct 时用全名               |
| Default      | 默认       |                                    |
| Enabled      | 启用       |                                    |

### 2.6 样式

| 英文          | 中文     | 备注         |
| ------------- | -------- | ------------ |
| Utility Class | 工具类   |              |
| Style Token   | 样式令牌 |              |
| cn            | cn       | 函数名，保留 |
| Variant       | 变体     | cva 变体     |
| Compound      | 复合     | cva 复合变体 |

### 2.7 测试

| 英文             | 中文         | 备注                            |
| ---------------- | ------------ | ------------------------------- |
| Test Description | 测试描述     | `it("xxx")` 里的字符串          |
| Assertion        | 断言         | `expect().toBe()` runtime check |
| UI String        | UI 字符串    | 浏览器展示文本                  |
| Developer String | 开发者字符串 | log / console / panic           |
| Fixture          | 测试数据     |                                 |
| Mock             | Mock         | 不译                            |
| Spy              | Spy          | 不译                            |
| Stub             | Stub         | 不译                            |
| E2E Test         | E2E 测试     | "E2E" 不译                      |
| Unit Test        | 单元测试     |                                 |
| Integration Test | 集成测试     |                                 |

### 2.8 Rust 专有

| 英文           | 中文           | 备注               |
| -------------- | -------------- | ------------------ |
| Trait          | Trait          | 不译               |
| Struct         | Struct         | 不译               |
| Enum           | Enum           | 不译               |
| Newtype        | Newtype        | 不译               |
| Borrow Checker | Borrow Checker | 不译               |
| Lifetime       | 生命周期       |                    |
| Ownership      | 所有权         |                    |
| Crate          | Crate          | 不译               |
| Module         | 模块           |                    |
| Workspace      | Workspace      | 不译（cargo 概念） |

### 2.9 pi-mono 专有

| 英文                | 中文        | 备注          |
| ------------------- | ----------- | ------------- |
| Agent Loop          | Agent 循环  | "Agent" 不译  |
| Tool Registry       | 工具注册表  |               |
| Stream Subscription | Stream 订阅 | "Stream" 不译 |
| Message Turn        | 消息轮次    |               |
| System Prompt       | 系统提示    |               |
| Token Usage         | Token 用量  | "Token" 不译  |
| Input Tokens        | 输入 Tokens |               |
| Output Tokens       | 输出 Tokens |               |

## 3. 标点规则

- **中文 prose** 用全角标点：`，。：；！？（）《》"" ''`
- **代码 / identifier / file path / URL** 用半角：`, . : ; ! ? ( ) [ ] < > { } " '`
- **混合段落**：中文句子中嵌入 `` `identifier` `` 用半角反引号 + 半角
  标点收尾

**正确**：

> 设置 `llm_providers` 字段，调用 `update_settings` 命令。

**错误**：

> 设置 `llm_providers` 字段，調用 `update_settings` 命令。

**正确**：

> 注释首句以中文结束（用全角句号"。"），括号内引用 identifier 保持
> 半角：`Agent Runtime (代理运行时)`。

**错误**：

> 注释首句以中文结束（用半角句号"."），括号内引用 identifier 保持
> 半角: `Agent Runtime (代理运行时)`。

## 4. 注释格式

### 4.1 TypeScript / TSX

```ts
// 单行注释：中文 + 半角空格 + 内容。
// 顶头不留空格。

/**
 * 多行 JSDoc 注释。
 * @param x 参数说明（中文）
 * @returns 返回值说明（中文）
 * @example
 *   example code（保留英文）
 */
function foo(x: string): number { ... }
```

### 4.2 Rust

```rust
/// 公开 API doc comment：中文首句，后接详细说明。
///
/// 详细说明跨多行时每行用句号收尾，标识符反引号包住。

// 行内注释：中文 + 半角空格 + 内容。

// panic! 字符串：开发者字符串走中文。
panic!("余额查询失败");
```

### 4.3 通用

- 注释行首**不留**前置空格（除非缩进嵌套）
- 注释和代码之间**留一空格**：`x = 1 // 中文注释`
- 多行注释**首尾空行**（除非贴紧函数签名）

## 5. 数字 / 单位

- 时间单位用中文："5 秒"、"30 分钟"、"2 小时" —— **不**用 "5s"、"30m"
- 字节单位用二进制前缀："4 KiB"、"1 MiB"（技术上下文保持英文单位）
- 千分位用半角逗号："1,000 条消息"
- ISO 8601 时间戳保留原文："2026-06-14T10:30:00Z"
- 文件大小 / 行数等技术度量用阿拉伯数字 + 英文单位："65 MB"、
  "200 LOC"

## 6. 标识符引用规则

- 代码块中引用 identifier 用反引号：`` `AgentRuntime` ``
- 不在 prose 中混用 `camelCase` 与中文（避免 "调用 agentRuntime 拿
  到结果" 这种）

**正确**：

> 调用 `agentRuntime` 拿到结果。

**错误**：

> 调用 agentRuntime 拿到结果。

## 7. 例外清单

以下情况**保持英文**，不走中文规则：

| 例外                                                      | 原因                                                 |
| --------------------------------------------------------- | ---------------------------------------------------- |
| 锚定 UI 字符串的 `expect().toBe('Settings')` runtime 断言 | runtime check 必须跟 UI 完全匹配，UI 英文 → 断言英文 |
| Tauri store key / env var / IPC 命令名                    | 配置层 identifier，跨语言检索锚点                    |
| `user_language: "zh" \| "en" \| "auto"` 字段值            | 字段值是 enum 标识符                                 |
| `.agents/skills/*` 内部 prompt                            | AI agent skill 训练数据语言对齐                      |
| commit message `type(scope):` 前缀                        | 机器可读 + 生态兼容                                  |
| branch name                                               | git URL 编码 + 工具链兼容                            |
| npm / cargo 包名                                          | 不可译                                               |
| 外部 URL / 文档链接                                       | 原文                                                 |
| 错误码（`AppError.Variant`）                              | 标识符                                               |
| Log 文件路径（`%LocalAppData%\codeman-agent\logs\`）      | 平台路径，保留原文                                   |
| 协议 / 标准名（WebView2、CDP、CRUD、REST、JSON、YAML）    | 行业标准名                                           |

## 8. 更新本文件

- 翻译过程中发现新歧义术语 → 提 PR 改本文件 § 2 对应章节
- 库版本升级 / 引入新库 → 在 § 1 品牌名表追加
- ADR-0009 政策变化 → 同步更新本文件对应章节
- 标点 / 注释格式争议 → 在 PR review 阶段引用本文件对应节
