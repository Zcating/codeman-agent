# codeman-agent — 项目语境

独立 Windows 桌面 AI 智能体，基于 Tauri 2 (Rust) + Solid.js + Effect-TS，
运行时采用 pi-mono。V1 版本发布通用 LLM 聊天代理 + 两个计费工具
（DeepSeek、MiniMax）。本文档固定词汇表，确保 plan、code 与 commit
message 保持一致。

## 词汇表

### 领域

- **Agent (代理)** — 产品本体。通用 LLM 驱动的助手，运行在独立
  Windows 桌面窗口中。完全替代旧的"widget"框架。_避免_：widget、
  app、client。
- **Conversation (会话)** — 用户拥有的持久聊天线程。线性消息
  序列；V1 不支持分支。
- **Message (消息)** — 会话中的单轮消息。角色为 `user`、`assistant`、
  `tool` 或 `system` 之一。可能内联携带 tool call 与 tool result
  （JSON 形式）。
- **Tool (工具)** — Agent 可调用的类型化函数。V1 内置 2 个计费
  工具（`get_balance`、`get_plan_quota`）；注册表可扩展。
- **Tool Call (工具调用)** — LLM 请求调用工具的指令。携带工具
  名与 JSON 参数。
- **Tool Result (工具结果)** — 工具调用的返回值。可能携带类型化
  错误。
- **Snapshot (快照)** — 计费提供方状态的时点视图。判别联合
  类型：`Balance { amount, currency, auto_recharge }` 或
  `PlanQuota { remaining, total, expires_at?, daily_avg? }`。由
  计费工具返回。

### Providers

- **LLM Provider (大语言模型提供商)** — Agent 用来生成响应的服务
  （OpenAI、Anthropic、OpenAI 兼容、本地）。Agent 的"燃料"。
  _避免_：model、AI provider。
- **Billing Provider (计费提供商)** — Agent 可查询其计费状态的服务
  （DeepSeek、MiniMax）。Agent 的一级工具目标。
- **Provider** — 过载术语，避免单用。总是明确为 LLM Provider 或
  Billing Provider。
- **Adapter (适配器)** — 每个计费提供方的 HTTP 客户端与响应解析器，
  将 secret 转换为 `Snapshot`。运行在 Rust 端。
- **Balance (余额)** — 计费提供方持有的可充值信用池。时点状态，
  可充值。
- **Plan Quota (用量)** — 套餐附带的固定、不可充值的配额。随使用
  减少，周期重置，不可充值。

### 架构

- **Runtime (运行时)** — 包装 pi-mono agent loop 的 Effect-TS 层。
  掌控 agent 生命周期、工具注册表、Stream 订阅。_避免_：agent
  core、agent loop。
- **Bridge (桥接层)** — 将 Effect Service 的 `Effect` / `Stream`
  输出翻译为 Solid signal 的层。UI 组件不 `import 'effect'`。
  _避免_：adapter（过载）。
- **Effect Service (Effect 服务)** — 类型化异步模块，暴露
  `Effect<A, E, R>` 或 `Stream<A, E, R>`。通过 Effect layer 组合；
  通过 mock layer 测试（`@effect/vitest`）。
- **IPC** — Tauri 命令桥接。Rust 端拥有 `commands.rs`；TS 端
  包装在 `src/lib/tauri.ts`。Tool handler 通过 IPC 命令调用 Rust
  Adapter。

### 密钥

- **LLM API Key (LLM API 密钥)** — LLM Provider 的认证凭据。
  存储在 **Tauri store** 路径 `llm_providers/<id>/api_key` 下。
  Webview 可读；安全等级低于计费密钥（可接受威胁模型：LLM 密钥
  只能让攻击者消耗 token）。
- **Billing API Key (计费 API 密钥)** — Billing Provider 的认证
  凭据。存储在 **Windows Credential Manager**（通过 `keyring`
  crate）路径 `codeman-agent/<id>/api_key` 下。永不出 Rust 进程。
  前端只看到 `has_key: boolean` 标志。
- **Secret** — Rust 端 `Secret<String>` newtype。`Debug` /
  `Display` 打印 `Secret(***)`。只有 Adapter 层调用 `.expose()`。
  _避免_：对任何凭据使用裸 `String`。

### Settings 与状态

- **Settings (设置)** — 通过 `tauri-plugin-store` 持久化的 JSON
  文档，位于 OS app-data 目录。覆盖 7 个分类共约 17 个字段。
  **不含任何 API 密钥**（密钥分命名空间存于 Tauri store 或
  keyring）。
- **Hotkeys (全局热键)** —— V1.5 已移除：V1 无热键，V1.5 同样
  不带全局热键。`tauri-plugin-global-shortcut` 已不再是依赖。
- **Stale (过期)** — `Snapshot` 时间戳超过 Billing Provider 的
  `stale_after_seconds`；传统的"过期徽标"语义在 tool result 缓存
  场景保留。

### 样式

- **Utility Class (工具类)** — Tailwind v4 utility-first CSS 类
  （例如 `flex h-screen bg-zinc-50`）。V1 唯一的视觉层；每个
  组件的外观都通过 utility class 表达。_避免_：BEM class、
  atomic CSS、scoped CSS。
- **Theme (主题)** — 用户在 Settings 中选择的三态视觉模式
  （`light` / `dark` / `system`）；通过 `<html class="dark">`
  切换（无 `prefers-color-scheme` 媒体查询 —— `system` 模式由
  `agent/store/theme.ts` 中的 Solid effect 读取）。_避免_：
  color scheme、appearance、mode。
- **Style Token (样式令牌)** — 在 `@theme` 块中定义的语义名
  （例如 `primary-500`、`zinc-900`），组件引用而非裸 hex。
  _避免_：design token（与 Material / Apple / IBM 词汇过载）、
  CSS variable（实现细节）。

### Localization

- **Developer Language (开发者语言)** — 标识符、注释、治理文档的
  语言。V1.6+ 分层：identifier 保持英文（与 Tauri / Solid /
  Effect-TS / pi-mono / Tailwind / Vite / Vitest / Playwright 生态
  对齐），prose 与注释走中文。Canonical 词汇表是 `CONTEXT.md`。
  _避免_：bilingual inline annotations、翻译 identifier。
- **User Language (用户语言)** — UI 字符串（按钮 / 错误 / 提示）
  的语言。通过 `Settings.user_language: "zh" | "en" | "auto"`
  配置。V1 没有 i18n runtime；UI 字符串硬编码英文，与该设置
  解耦。_避免_：作为代码注释翻译的副作用改动 UI 字符串。
- **Test Description (测试描述)** — `it("xxx")` / `test("xxx")`
  中描述测试目标的可读字符串。出现在测试报告中。V1.6+ 约定：
  **中文**（例如 `it("可以保存 LLM API key")`）。_避免_：新测试
  使用英文 test description。
- **Assertion (断言)** — 测试体内的 runtime 检查，例如
  `expect(x).toBe(y)`。**锚定 UI 字符串时英文**（必须与 UI 完
  全一致），**fixture 数据时中文**（例如
  `toHaveBeenCalledWith({ content: '你好' })`）。_避免_：当
  底层值是 UI 字符串时使用中文断言字符串（运行时会失败）。
- **UI String (UI 字符串)** — 渲染 UI 中展示的文本（按钮标签、
  placeholder、错误信息、aria-label）。V1 始终输出英文 UI
  字符串，与 `user_language` 无关。在 V1.6 注释翻译工作中**不
  在范围**；未来 i18n 工作独立追踪。
- **Developer String (开发者字符串)** — 写入日志、console、panic
  消息或 `Result::Err` 变体（不向用户展示）的字符串字面量。
  V1.6+ 约定：**中文**。_避免_：新代码使用英文 log message
  （破坏 grep 一致性）。
- **Translation Rules (翻译规则)** — 操作手册，位于
  `docs/translation-rules.md`。包含品牌名保留、术语映射表、标点
  规则、注释格式。5 路并行工作流以此文档为一致性约束。

## Domain shape

```
Agent
  ├── runtime          (Effect-TS layer wrapping pi-mono)
  ├── bridge           (Effect → Solid signal 翻译器)
  └── tools[]          (类型化函数；计费工具由 Rust adapter 支撑)
        ├── get_balance(billing_provider_id)  → Snapshot
        └── get_plan_quota(billing_provider_id) → Snapshot

Conversation          (src/shared/types/index.ts)
  ├── id, title, system_prompt?, created_at, updated_at, archived_at?
  └── messages[]       (线性)
        ├── id, role, content
        ├── tool_calls[]    (assistant 调用工具时)
        ├── tool_results[]  (返回给 LLM 的结果)
        ├── model, input_tokens, output_tokens
        └── created_at

LLM Provider             Billing Provider
  (Settings.llm_providers) (Settings.billing_providers)
  ├── id                  ├── id
  ├── label               ├── label
  ├── enabled             ├── enabled
  ├── default_model       ├── adapter (Rust trait impl)
  ├── base_url?           └── refresh_interval_secs
  └── api_key_ref
        (Tauri store)              (keyring)
```

两类 Provider 故意保持区分 —— 它们由不同的代码路径和存储层
处理。**不要**合并为单一类型。

## Settings (V1 形态)

通过 `tauri-plugin-store` 持久化（JSON 文件位于 app-data 目录）。
完整 schema 位于 `src-tauri/src/settings.rs`；canonical TS 镜像
位于 `src/lib/types.ts`。

```ts
interface Settings {
  // A. LLM providers
  llm_providers: Array<{
    id: string; // 稳定 id（如 "openai"、"anthropic"）
    label: string; // 人类可读名
    enabled: boolean;
    default_model?: string; // per-provider 默认
    base_url?: string; // OpenAI 兼容专用
    api_key_ref: string; // 指向 Tauri store 的路径
  }>;

  // B. 默认行为
  default_llm_provider_id?: string;
  user_language: "zh" | "en" | "auto";
  theme: "light" | "dark" | "system";

  // C. App
  start_at_login: boolean;

  // D. Window
  window: {
    remember_position: boolean;
    remember_size: boolean;
    default_size: { width: number; height: number };
    min_size: { width: number; height: number };
  };

  // E. System prompt
  system_prompt: {
    default: string; // 多行
    user_can_edit: boolean;
  };

  // F. Billing
  billing_providers: Array<{
    id: string; // "deepseek" | "minimax"
    enabled: boolean;
    refresh_interval_secs: number;
    api_key_ref: string; // 指向 keyring 的路径
  }>;

  // G. Conversations
  conversations: {
    auto_archive_after_days: number; // 默认 30
    max_history: number; // 默认 1000
  };
}
```

API 密钥**永不**进入此文件。LLM 密钥存 Tauri store，计费密钥
存 keyring，两套命名空间互不冲突。

## 认证约定

- **LLM providers** 通过 pi-mono 标准机制认证（因 provider 而异：
  OpenAI Bearer、Anthropic `x-api-key`、OpenAI 兼容自定义 header）。
  `pi-ai` 负责构造 header；密钥值来自 Tauri store。
- **Billing providers** 使用 `Authorization: Bearer <key>`。header
  在 Rust adapter 内部用 `Secret<String>` 构造；密钥值来自
  keyring。密钥永不出 Rust 进程；前端永远只看到 `has_key: boolean`
  标志。

## MiniMax 端点

MiniMax plan-quota 端点在规划时**待定**。adapter 按可配置 URL
绑定（默认占位返回结构化错误），直到已验证的端点被记录到本文件。
一旦确认，已验证的 URL + 响应 schema 将在同一 commit 中记录并
切换默认。

## Logging

- 日志位于 `%LocalAppData%\codeman-agent\logs\`，按日轮转，容量
  上限。
- `log` + `tauri-plugin-log`；默认 `info` 级，通过环境变量启用
  `debug`。
- API 密钥材料在 Rust 端包成 `Secret<String>`，在 TS 端包成
  Effect-TS `Secret`，二者在 `Debug` / `Display` 中打码；log
  语句避免格式化完整 secret（任一语言）。
- LLM API 密钥（Tauri store）与 Billing API 密钥（keyring）在
  日志中区别对待：LLM 密钥仅通过 `api_key_ref` 引用，**绝不**打印
  原值。

## Non-goals (V1)

- 单 provider 多账号
- 历史图表 / 时序数据
- 分支会话
- 跨会话用户事实的自动记忆 / 跨 session 持久化（M2 会话除外）
- 计费之外的通用工具（无 shell、无文件系统、无 IDE 集成）
- 无鼠标操作（V1 无热键、无键盘快捷键）
- 跨平台打包（Tauri 保持可移植；V1 仅 Windows）
- 自动更新、代码签名
- 点击穿透透明区域
