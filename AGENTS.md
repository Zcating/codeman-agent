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

**禁止写注释——代码必须自解释**。无法自解释的部分优先重构成更清晰的命名/拆分/类型，而非加注释。

自问："一位资深工程师会觉得这过度设计了吗？"如果是——简化它。

## 精准修改

只动必须动的。只清理自己制造的混乱。

编辑已有代码时：

- 不要顺手「改进」相邻代码、注释或格式。
- 没坏的东西不要重构。
- 沿用现有代码风格，哪怕你自己会换种写法。
- 精准修改，复用代码库中已有的代码。
- 发现无关的死代码？提一嘴就行，别删。

你的改动产生了孤儿代码时：

- 删除你的改动导致未使用的 import / 变量 / 函数。
- 除非被要求，否则不要删除原本就存在的死代码。

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

---

这些准则生效的标志是： diff 里不必要的改动变少了，因过度设计导致的重写变少了，澄清性问题出现在实现之前而不是出错之后。


## codeman-agent — 项目知识库

**生成时间:** 2026-06-14
**Commit:** (TBD)
**分支:** `master`


### 核心栈

> 数据源：`package.json`（同步于 2026-07-26）。完整版本以 `package.json` 为准。

| 层 | 选型 | 版本 |
| --- | --- | --- |
| 桌面壳 | Electron (main + preload) | `^39.2.6` |
| UI | Solid.js + TypeScript | `solid-js ^1.9.3` / `typescript ^7.0.0` |
| 构建 | electron-vite + Vite + vite-plugin-solid | `6.0.0-beta.1` / `^8.0.16` / `^2.11.12` |
| 样式 / 图标 | Tailwind v4 + cva + tailwind-merge + clsx + lucide-solid | `^4.3.0` / `^0.7.1` / `^3.6.0` / `^2.1.1` / `^1.18.0` |
| UI 原语 | @ark-ui/solid | `^5.37.1` |
| 逻辑层 (TS) | Effect-TS + @effect/platform-browser + ts-pattern | `^3.21.4` / `^0.75.0` / `^5.9.0` |
| 工具库 | es-toolkit / marked / dotenv | `^1.47.1` / `^15.0.0` / `^17.4.2` |
| 字体 | @fontsource/inter + @fontsource/noto-sans-sc | `^5.2.8` / `^5.2.9` |
| Agent 运行时 | @earendil-works/pi-ai + @earendil-works/pi-agent-core | `0.80.3` |
| 持久化 | SQLite (better-sqlite3) + FTS5 全文搜索 | `^12.11.1` |
| 配置 / 密钥 | electron-store（明文 JSON；API key 简化决策见 ADR-0015） | `^11.0.2` |
| Electron 生态 | electron-builder / electron-log / electron-updater / electron-window-state / @electron-toolkit/preload+utils | `^26.15.3` / `^5.4.4` / `^6.8.9` / `^5.0.3` / `^3-4.0` |
| 路由 | TanStack Router (code-based) | `^1.170.15` |
| 表单 | @tanstack/solid-form | `^1.33.2` |
| 测试 | vitest + @effect/vitest + @solidjs/testing-library + @playwright/test + jsdom | `^4.1.9` / `^0.25.0` / `^0.8.10` / `^1.49.0` / `^25.0.0` |
| Lint / Format | oxlint + oxfmt | `^1.71.0` / `^0.56.0` |
| 包管理 | pnpm（通过 `vp` / vite-plus CLI 调用脚本） | `pnpm@11.5.3` / `vp 0.1.24` |


### 命令

```bash
vp run install
vp run test              # 前端 vitest (jsdom)
vp run build             # 前端产物到 dist/
vp run dev               # electron-vite dev（自动调 scripts/kill-port.mjs 1420 1421）
vp run build:win         # 出 MSI + NSIS 安装包
vp run typecheck         # tsc --noEmit
vp run typecheck:e2e     # tsc --noEmit -p tsconfig.e2e.json
vp run e2e               # Playwright + 真 Electron 端到端 (本地)
```

### 语言

使用中文（Chinese）处理用户的回答。

### Git

- 提交禁止 --no-verify
- merge主分支时，必须 --no-ff
