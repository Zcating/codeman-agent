# src/plugins/skills/ — Skills Plugin (技能插件)

> **Scope:** V3.1 Skills 系统 — 端用户可加载的 prompt augmentation (per ADR-0031)。
> **职责**: 仅修改 system prompt, **不带**新 AgentTool / **不带**UI 资源 (与 MCP 正交)。
> **路径**: `~/.agents/skills/<name>/SKILL.md` (与项目 `.agents/skills/` 同根同格式)。

## 目录布局

```
src/plugins/skills/
├── index.ts              # Barrel (plugin 根级唯一允许的文件之一)
├── AGENTS.md             # 本文件
│
├── lib/                  # 纯逻辑 / Effect-TS 运行时
│   ├── skill-loader-schema.ts    # SkillManifest / SkillFrontmatter schema (effect/Schema)
│   ├── skill-loader.ts           # scanSkillsDir + loadSkillContent + parseFrontmatter
│   ├── skill-loader.test.ts      # vitest 单元测试 (Wave A1)
│   ├── skill-injector.ts         # formatSkillsManifestSection [Wave A2]
│   └── skill-meta-tool.ts        # _load_skill AgentTool [Wave A5]
│
├── stores/               # Solid signal + bridge [Wave A2]
│   └── skills.store.ts
│
└── components/           # UI 组件 [Wave A7]
    └── slash-menu.tsx
```

## 数据模型

| 类型 | 字段 | 来源 |
|---|---|---|
| `SkillManifest` | `name, description, source, path` | `~/.agents/skills/<name>/SKILL.md` frontmatter |
| `SkillFrontmatter` | `name, description` | SKILL.md 顶部 `---` block |
| `SkillSource` | `"preinstalled" \| "user"` | 路径含 `.preinstalled/` → preinstalled |

## 硬性规则

- **UI 组件 (`components/*.tsx`) 禁止导入 `effect`**。它们是 Solid signal / createStore 纯消费者。
- **业务函数 (`lib/*.ts`) 必须用 `Effect.fnUntraced` 包装**(per `.repos/effect/.patterns/effect.md`)。
- **错误复用 `AppError` union** (`NotFound` / `InvalidConfig`)。不为本 plugin 创建新 TaggedError variant (除非使用方需要结构化字段)。
- **`as any` / `@ts-ignore` / 空 catch 全部禁用**。
- **frontmatter 解析手写** — 不引 `gray-matter` / `js-yaml` 新依赖(SKILL.md 是简单 key:value 行格式)。
- **corrupt skill 静默跳过** (per ADR-0031 D1: "corrupt 在 list 中省略, 不阻塞其它 skill")。

## 测试

```bash
vp run test src/plugins/skills
```

`lib/skill-loader.test.ts` 用 vitest + Node `fs/promises` 创建临时目录 (无 mockState — 本 plugin 无 IPC)。

## ADR 参考

- [ADR-0031](../../docs/adr/0031-skills-system.md) — Skills System 设计决策
- [ADR-0010](../../docs/adr/0010-frontend-5-1-folder-whitelist.md) — features/ 5+1 whitelist (plugins/ 是新的同级目录, 见 src/plugins/AGENTS.md)
- [ADR-0003](../../docs/adr/0003-effect-ts-logic-layer.md) — Effect-TS 逻辑层
- [ADR-0025](../../docs/adr/0025-effect-schema-as-default-schema-library.md) — effect/Schema 默认