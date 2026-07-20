# src/plugins/ — Plugins (插件目录)

> **新增顶层目录**(V3.1,与 `src/features/` 同级,与 `src/shared/` 同级)。
> **Plugins 是扩展/集成点**(非产品核心),与 features(产品域)的区别:
> - **features/** = 产品核心能力(chat / settings / file-tools)
> - **plugins/** = 用户可加载的扩展点(skills / mcp)
> - **shared/** = 跨域基础设施(只读)

## 5+1 子目录白名单(plugins 内部)

每个 plugin 目录允许以下子目录(per ADR-0010 模式):

- `lib/` — 纯函数 / Effect-TS 运行时 / schema
- `stores/` — Solid signal / store / Accessor 桥接层
- `components/` — UI 组件
- `routes/` — 路由组件(若 plugin 需要独立路由)
- `hooks/` — Solid composable (`use-` 前缀)

**Plugin 根级只允许 2 个文件**:`index.ts` (barrel) + `AGENTS.md` (规则)。其它文件必须落在 5 个子目录之一。

## 现有 Plugins

| Plugin | Scope | ADR |
|---|---|---|
| `skills/` | 端用户 prompt augmentation (per ADR-0031) | ADR-0031 |
| `mcp/` | MCP Client (stdio) 扩展 tool 能力 (per ADR-0032) | ADR-0032 |

## 硬性规则

- **与 features/ 的区别**:plugins 是用户可选择性加载的扩展(skills / mcp 用户可启停),features 是产品强绑定的核心能力。
- **Plugin 与 feature 的边界**:plugin 不能反向依赖 feature (`src/plugins/<x>/` 不 import `src/features/<y>/`);feature 可以 import plugin。
- **Plugin 之间的边界**:`src/plugins/<a>/` 不直接 import `src/plugins/<b>/`;需共享代码提升到 `src/shared/`。
- **错误走 `AppError` union 复用**(`Schema.TaggedError`, 共享于 `src/shared/lib/errors.ts`)。
- **`as any` / `@ts-ignore` / 空 catch 全部禁用**(per src/AGENTS.md 全局规则)。
- **业务函数 `Effect.fnUntraced` 包装**(per `.repos/effect/.patterns/effect.md`)。
- **新增 plugin 必须开 ADR**——plugin 是新的扩展点,需文档化设计决策。

## Import 方向

```
features/chat  ──imports──►  plugins/skills    (feature 消费 plugin)
features/chat  ──imports──►  plugins/mcp       (feature 消费 plugin)
plugins/skills ──imports──►  shared/            (plugin 用 shared 基础设施)
plugins/mcp    ──imports──►  shared/

# 反向禁止
plugins/*    ──✗──imports──►  features/*       (plugin 不依赖 feature)
plugins/<a>  ──✗──imports──►  plugins/<b>      (plugin 之间互不依赖)
shared/      ──✗──imports──►  plugins/*        (shared 不依赖 plugin)
```

## 测试

```bash
vp run test src/plugins
```

各 plugin 自行维护 `*.test.ts(x)`,与被测文件同目录。

## ADR 参考

- [ADR-0010](../../docs/adr/0010-frontend-5-1-folder-whitelist.md) — features/ 5+1 whitelist (plugins/ 是其外的同级目录)
- [ADR-0031](../../docs/adr/0031-skills-system.md) — Skills Plugin
- [ADR-0032](../../docs/adr/0032-mcp-client-stdio.md) — MCP Plugin