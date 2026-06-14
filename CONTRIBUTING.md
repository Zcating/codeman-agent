# Contributing to codeman-agent

> 入门指南 + Glossary 增补规则。本文件配套 ADR-0009 /
> `docs/translation-rules.md`。

## Quick start

```bash
# 1. 克隆 + 安装
git clone <repo>
cd codeman-agent
pnpm install

# 2. 跑 dev（前后端一起启）
pnpm tauri:dev

# 3. 跑测试
pnpm test              # vitest
cd src-tauri && cargo test
pnpm e2e               # Playwright + 真 Tauri

# 4. typecheck
pnpm typecheck
pnpm typecheck:e2e
```

详见 `AGENTS.md` "命令" 段。

## 必读文档

按顺序读：

1. `AGENTS.md`（顶层入口）
2. `CONTEXT.md`（词汇表 —— 写代码前先查术语）
3. `docs/adr/0001-0008-*.md`（8 个架构决策）
4. `docs/adr/0009-developer-language-cjk-strategy.md`（开发者语言策略）
5. `docs/translation-rules.md`（中文化操作规则）
6. 子目录 `AGENTS.md`（域规则：`src/` / `shared/` / `features/` /
   `src-tauri/` / `db/` / `providers/`）

## PR checklist

提交 PR 前确认：

- [ ] **新 identifier 已在 `CONTEXT.md` 加术语条目**（详见下方
      "Glossary 增补"）
- [ ] **新注释遵守 `docs/translation-rules.md` 规则**
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过
- [ ] `cargo test` 通过
- [ ] `pnpm e2e` 通过（新增 IPC 命令时同步加 e2e spec）
- [ ] commit message 格式：`type(scope): 中文 subject`（参考 conventional
      commits）
- [ ] branch name 英文 ASCII：`feature/xxx` / `fix/xxx` / `docs/xxx`
- [ ] 没动 `.agents/skills/*` 的英文 prompt

## Glossary 增补

新增 identifier 时，按以下门槛决定是否需要在 `CONTEXT.md` 加术语条目：

| 情形 | 是否需要加 |
|---|---|
| 跨 ≥ 2 文件的 public type / function / interface / trait | **必须** |
| 引入新的 external dependency（npm / cargo） | **必须** |
| 1 个文件内 private helper（不出 module） | 不必 |
| 已有 glossary 条目但翻译 / 含义变化 | 更新现有条目 |
| 与现有术语同义的新 identifier | 不必（用现有术语） |

**Glossary 条目格式**（参考 `CONTEXT.md` § Localization）：

```markdown
- **English Term (中文译名)** — 一句话定义，补充技术细节。
  可选 _Avoid_: 同义但禁止使用的词。
```

如果术语在 `docs/translation-rules.md` § 2 已有映射 → 不必新增
`CONTEXT.md` 条目，只需 PR 引用该映射。如果映射表里没有 → 先 PR
更新 `docs/translation-rules.md` § 2，再在 `CONTEXT.md` 加 glossary
条目。

## 翻译工作流

本项目采用 5 路并行的翻译批处理（详见 ADR-0009 § Decision 8）：

1. **`docs/adr/` + `CONTEXT.md`** —— 治理文档，policy 层
2. **`AGENTS.md`**（根 + 7 个子）—— 域规则，operational 层
3. **`src/shared/` + `src/features/`** —— 前端源码
4. **`src-tauri/`** —— Rust 后端源码
5. **`e2e/` + `**/*.test.{ts,tsx}`** —— 测试

每路开工前必读 `docs/translation-rules.md`，术语歧义以该文件为准。
5 路间术语一致性靠**统一规则文档**而非人工 review 抓。

## 不做的事

- 不用 npm / yarn —— 项目强制 pnpm
- 不引入 Radix UI / Kobalte（ADR-0008）
- 不写 BEM class（ADR-0006）
- 不在 UI 组件 `import { Effect, ... }`（ADR-0003）
- 不动 `.agents/skills/*` 的英文 prompt
- 不写 custom lint 脚本抓漏译（ADR-0009 决定靠 review 抓）
- 不在 PR 里做无关联改动
- 不改 Tauri 模板默认 `README.md`（项目自写 README 落地后整文件覆盖）
- 不翻译 `.omo/*` agent working files

## Code review 期望

Reviewer 在 review 新 PR 时关注：

1. **新增 identifier** 是否需要加 `CONTEXT.md` 条目（按上述门槛）
2. **新注释** 是否遵守 `docs/translation-rules.md`（尤其 § 3 标点
   + § 6 标识符引用）
3. **中文 fixture** 在测试中是否合理（中文用户消息 vs 英文技术数据）
4. **runtime 断言** 是否正确锚定 UI 字符串（`expect().toBe('Settings')`
   必须跟 UI 字符串完全匹配，否则测试必红）
5. **commit message subject** 是否中文、是否清晰

## 链接

- 项目知识库入口：`AGENTS.md`
- 词汇表：`CONTEXT.md`
- 架构决策：`docs/adr/`
- 翻译规则：`docs/translation-rules.md`
- 命令清单：`AGENTS.md` "命令" 段
