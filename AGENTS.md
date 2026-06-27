# AGENTS.md

用于减少 LLM 编码常见错误的行为准则。可根据需要合并到项目特定指令中。

权衡说明： 这些准则偏向谨慎而非速度。对于琐碎任务，请自行判断。

## 动手前先思考

不要假设。不要掩盖困惑。把取舍摆上台面。

开始实现之前：
• 明确陈述你的假设。如果不确定，直接问。

• 如果存在多种理解方式，列出来——不要默默替用户做选择。

• 如果有更简单的解法，说出来。该反驳时就反驳。

• 如果某处不清晰，停下来。指出哪里让人困惑，然后提问。

## 简单优先

只写能解决问题的最少代码。不做任何投机性编码。

• 没要求的功能一律不加。

• 单次使用的代码不做抽象。

• 没提过的「灵活性」「可配置性」一律不写。

• 不可能发生的场景不做错误处理。

• 写了 200 行但 50 行就能搞定？重写。

自问："一位资深工程师会觉得这过度设计了吗？"如果是——简化它。

## 精准修改

只动必须动的。只清理自己制造的混乱。

编辑已有代码时：
• 不要顺手「改进」相邻代码、注释或格式。

• 没坏的东西不要重构。

• 沿用现有代码风格，哪怕你自己会换种写法。

• 发现无关的死代码？提一嘴就行，别删。

你的改动产生了孤儿代码时：
• 删除你的改动导致未使用的 import / 变量 / 函数。

• 除非被要求，否则不要删除原本就存在的死代码。

检验标准：每一行被改动的代码都应该能直接追溯到用户的需求。

## 目标驱动执行

先定义成功标准。循环验证直到达标。

把任务转化为可验证的目标：
• 「加校验」→「先为无效输入写测试，再让测试通过」

• 「修 bug」→「先写一个能复现 bug 的测试，再修复它」

• 「重构 X」→「确保重构前后测试全部通过」

多步骤任务时，简要陈述计划：

1. [步骤] → 验证：[检查项]
2. [步骤] → 验证：[检查项]
3. [步骤] → 验证：[检查项]

清晰的成功标准让你能独立迭代。模糊的标准（"让它能用"）意味着需要不断来回确认。

这些准则生效的标志是： diff 里不必要的改动变少了，因过度设计导致的重写变少了，澄清性问题出现在实现之前而不是出错之后。

---

# codeman-agent — 项目知识库

> **AI Agent 协作入口**。读 `CONTEXT.md` 拿词汇表，读 ADR 拿决策，读子目录 `AGENTS.md` 拿硬性规则。

**生成时间:** 2026-06-14
**Commit:** (TBD)
**分支:** `master`


## 核心栈

| 层           | 选型                                             | 版本                                           |
| ------------ | ------------------------------------------------ | ---------------------------------------------- |
| 桌面壳       | Tauri 2 (Rust)                                   | `2.x`                                          |
| UI           | Solid.js + TypeScript                            | `solid-js ^1.9.3` / `tsc ~5.6.2`               |
| 构建         | Vite + vite-plugin-solid                         | `^6.0.3`                                       |
| 样式         | Tailwind v4 + cva + cn (clsx+twMerge)            | `^4.3.0` / `cva 0.7.1` / `lucide-solid 1.18.0` |
| 逻辑层 (TS)  | **Effect-TS** + `@effect/platform-browser`       | `effect ^3.0.0`                                |
| Agent 运行时 | **pi-mono** (`@mariozechner/pi-ai` + `pi-agent`) | `latest`                                       |
| 持久化       | SQLite + sqlx 0.8 + **FTS5** 全文搜索             | `sqlx 0.8`                                     |
| 密钥         | Windows Credential Manager via `keyring` crate   | `keyring 3`                                    |
| 路由         | **TanStack Router (code-based)**                 | `^1.170.15`                                    |
| 包管理       | vite-plus                                        | `0.1.24`                                       |

## 目录布局

```txt
codeman-agent/
├── src/
│   ├── index.tsx                  # Solid 入口（挂 <RouterProvider>，~6 行）
│   ├── index.css                  # Tailwind v4 入口（@import + @theme + @layer base）
│   ├── router.tsx                 # TanStack Router code-based 配置
│   ├── test-setup.ts              # vitest setup（mockState 唯一源 = __mocks__/）
│   ├── AGENTS.md                  # src/ 规则
│   │
│   ├── shared/                    # 跨 feature 共享（5+1 白名单）
│   │   ├── AGENTS.md
│   │   ├── lib/                   # 纯函数 + 跨域类型：cn.ts / tauri.ts / units.ts / types.ts
│   │   ├── stores/                # 跨域 Solid signal：theme.ts
│   │   ├── hooks/                 # 跨域 composable（V1 预留位，use- 前缀）
│   │   ├── components/ui/         # 跨域设计系统原子：Button / Input / Textarea / Checkbox / Card
│   │   │   └── AGENTS.md
│   │   └── components/internal/   # 跨域业务组件（V1 预留位：ErrorBoundary / Provider wrappers / Layout atoms）
│   │
│   └── features/                  # 5 子目录白名单（按需创建）
│       ├── chat/                  # 聊天域 — lib + stores + components + routes
│       │   ├── AGENTS.md
│       │   ├── index.ts           # public API barrel
│       │   ├── components/        # chat-view / sidebar / message-bubble / tool-call-card
│       │   ├── routes/            # / 路由
│       │   ├── stores/            # conversations + messages（Effect→Solid 桥接层）
│       │   └── lib/               # runtime.ts（从 chat 根级迁入）
│       ├── settings/              # 设置域 — lib + components + routes
│       │   ├── AGENTS.md
│       │   ├── index.ts
│       │   ├── components/        # provider-card
│       │   ├── routes/            # /settings 路由
│       │   └── lib/               # llm-providers + system-prompt（从 subsystems/ 迁入；snake_case 已修）
│       └── billing/               # 工具域 — 仅 lib（无 UI）
│           ├── AGENTS.md
│           ├── index.ts
│           └── lib/               # billing.ts（从 tools/ 迁入）
│       └── file-tools/           # 文件工具域 — lib（无 UI，V2 新增）
│           ├── AGENTS.md
│           ├── index.ts
│           └── lib/               # file-tools.ts + file-tools.test.ts
│
├── src-tauri/                     # Rust 后端（详见 src-tauri/AGENTS.md）
├── docs/adr/                      # 10 个 ADR（0001-0010，见下方索引）
├── (mocks 改在 src/__mocks__/ — 详见 src/AGENTS.md)
├── docs/                          # 治理文档（translation-rules 等）
└── .agents/                       # 本地 agent skills
```


## 命令

```bash
vp run install
vp run test              # 前端 vitest (jsdom)
vp run build             # 前端产物到 dist/
vp run dev
vp run tauri:dev         # 自动调 scripts/kill-port.mjs 1420 1421
vp run tauri:test        # 后端（带 wiremock 集成测试）
vp run tauri:build       # 出 MSI + NSIS 安装包
vp run typecheck         # tsc --noEmit
vp run typecheck:e2e     # tsc --noEmit -p tsconfig.e2e.json
vp run e2e               # Playwright + 真 Tauri 端到端 (本地)
```
