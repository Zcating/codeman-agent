# 0025 — Effect Schema as Default Schema Library (TypeBox → Schema 迁移)

**Status**: accepted · **Date**: 2026-07-11 · **Scope**: `src/shared/lib/errors.ts` (新增) + `src/shared/lib/types.ts` (AppError 重命名为 LegacyAppErrorUnion) + `src/shared/lib/format-app-error.ts` (重写) + `src/shared/lib/format-app-error.test.ts` + `src/features/file-tools/lib/file-tools.ts` (5 schemas 改写) + 12 个 AppError consumer (PR 2 全栈迁移) + `src/AGENTS.md` (Schema 硬规则) + `src/features/*/lib/schemas.ts` (PR 4 落地) + `package.json` (typebox 降级为 pi-ai 传递依赖)
**Supersedes**: 部分 — ADR-0016 D3 中关于 `AppError` 判别联合的实现细节 (Error 模型 base 改变，但 ADR-0016 D4 "service-in-store" + formatAppError 公共 API 形态保留)
**Related**: ADR-0003 (Effect-TS logic layer), ADR-0016 (App Store + service-in-store + formatAppError), ADR-0018 (unified logging), ADR-0024 (Electron shell migration), `CONTEXT.md` "架构" section 新增 Schema 子段

## Context

`file-tools.ts` 5 个 AgentTool 用 `@sinclair/typebox` (`Type.Object({...})` + `Static<typeof Schema>`) 定义 LLM 函数调用 schema。typebox 角色：
- **运行时**：被 pi-mono (`@mariozechner/pi-ai@0.9.4`) 内部 AJV 编译为 JSON Schema 验证 LLM 工具调用参数
- **类型层**：`AgentTool<TParameters extends TSchema = TSchema>` 强约束 typebox `TSchema` 类型
- **依赖**：`@sinclair/typebox@^0.34.41` 在 pi-ai 的 `dependencies` 字段（不是 peer），项目已通过 pnpm 间接安装

`AppError` 是纯 TS 判别联合（8 变体：NotFound / Unauthorized / Network / InvalidConfig / Database / ToolCall / SandboxViolation / Unknown），由 `src/shared/lib/types.ts` 导出，被 12 个文件消费（chat.store / app.store / ipc / workspace-service / settings-saver / provider-card / format-app-error 等）。

需求触发（grill-with-docs 2026-07-11，8 问 8 答）：
1. typebox 是**pi-mono 边界硬约束**，不能彻底移除。源码侧去 typebox 化是务实做法。
2. 想用 Effect-native 特性：`Schema.TaggedError`（判别联合 → 实例类型 + `instanceof` + 自动 JSON Schema 派生 + `Cause` 序列化）/ Branded 类型 / Refinement / 统一 type-validation-error 模型。
3. `AppError` 是 Schema-native 特性的最大未开发阵地 — 把它从"裸对象判别联合"升级成 "Schema.TaggedError class 层级"。

## Decisions

### D1 — Schema 选型：`effect/Schema` (内置，0 新 dep)

- 使用 `effect` 包内置的 `Schema` 模块 (`import { Schema } from "effect"`)。
- 不引入独立的 `@effect/schema` 包（已被 effect@3.x 合并）。
- 不引入 `zod` / `valibot`（与 Effect 生态割裂；pi-mono 内部已用 zod 但未对外暴露 schema 类型）。
- **拒绝理由（zod）**：与 `Effect.gen` / `Layer` / `Stream` 不一致，类型桥接复杂。

### D2 — 移除策略：源码去 typebox 化（typebox 仍作传递依赖）

- `package.json` 不再显式声明 `"@sinclair/typebox"`。
- `pnpm-lock.yaml` 仍含 typebox（pi-ai 拉入，作为 pi-ai 传递依赖存在）。
- `src/features/file-tools/lib/file-tools.ts` 改用 `Schema.Struct({...})` 替代 `Type.Object({...})`。
- 调 pi-ai 时通过 `Schema.toJsonSchema(schema)` 转 JSON Schema 对象喂给 `tool.parameters`，类型层 `as unknown as TSchema` cast。
- **拒绝理由（彻底移除 typebox）**：会破 `AgentTool<TParameters extends TSchema = TSchema>` 编译期约束；pi-ai 强依赖 typebox 类型符号。

### D3 — 范围：全栈 Schema 化（4 PR 序贯，基础设施先行）

不只动 file-tools.ts，整个项目所有 schema 来源统一到 `effect/Schema`：

```
PR 1 — Schema 基础设施 (foundation, additive)
  ├── src/shared/lib/errors.ts (新增)
  │   ├── class AppError extends Schema.TaggedError<AppError>()("AppError", { message: Schema.String }) {}
  │   ├── class NotFound extends AppError { static _tag = "NotFound" as const; }
  │   ├── class Unauthorized extends AppError { ... }
  │   ├── class Network extends AppError { cause?: string; ... }
  │   ├── class InvalidConfig extends AppError { field?: string; ... }
  │   ├── class Database extends AppError { cause?: string; ... }
  │   ├── class ToolCall extends AppError { tool_call_id: string; ... }
  │   ├── class SandboxViolation extends AppError { path: string; workspace_label: string; ... }
  │   └── class Unknown extends AppError { ... }
  ├── src/shared/lib/types.ts — AppError 判别联合重命名为 LegacyAppErrorUnion, 加 @deprecated 注释
  └── src/shared/lib/format-app-error.ts — 重写支持双源:
       ├── 优先 instanceof X 分发 (_tag 路由)
       └── fallback 到 e.kind 判断 (legacy 兼容)

PR 2 — 全栈 consumer 迁移 (kind → _tag + instanceof)
  ├── chat.store.ts (13 hits)
  ├── app.store.ts (19 hits)
  ├── ipc.ts (28 hits)
  ├── workspace-service.ts (8 hits)
  ├── settings-saver.ts (4 hits)
  ├── provider-card.tsx (3 hits)
  ├── file-tools.ts (11 hits) — requireWorkspaceId 内 Effect.fail({ kind: "InvalidConfig", ... }) 改 Effect.fail(new InvalidConfig({...}))
  ├── ipc.test.ts (3 hits)
  ├── app.store.test.ts (10 hits)
  ├── format-app-error.test.ts (13 hits)
  └── 删除 LegacyAppErrorUnion

PR 3 — file-tools typebox → Schema.Struct (5 schemas 改写)
  ├── ReadFileSchema = Schema.Struct({ workspace_id: Schema.optional(Schema.String), path: Schema.String })
  ├── WriteFileSchema = ...
  ├── EditFileSchema = ...
  ├── SearchFilesSchema = ...
  ├── DeleteFileSchema = ...
  ├── type XxxArgs = Schema.Schema.Type<typeof XxxSchema>
  └── AgentTool<typeof XxxSchema, ...> → AgentTool<TSchema, ...> + cast Schema.toJsonSchema(XxxSchema) as unknown as TSchema
  + 包一个 helper: toToolParameters<S extends Schema.Struct<any>>(s: S): TSchema = Schema.toJsonSchema(s) as unknown as TSchema

PR 4 — Domain schema 补齐 (chat / settings / file-tools feature 自治)
  ├── src/features/file-tools/lib/schemas.ts (新增) — Branded WorkspaceId / FilePath / ToolCallId; Refinement on path/glob
  ├── src/features/chat/lib/schemas.ts (新增) — Branded ConversationId / WorkspaceId; Schema validation for runtime inputs
  ├── src/features/settings/lib/schemas.ts (新增) — Provider / Settings schemas (与 electron-side Zod 镜像对齐)
  └── AGENTS.md 加硬规则: "新错误必须 Schema.TaggedError; 新 schema 必须 Schema.Struct"
```

**拒绝理由（其它序贯）**：
- 3 PR 严格分层 (Branded → TaggedError → AppError 同步)：架构清淅但慢，且 Branded 边界模糊（哪些 ID Branded？）易卡 PR 4。
- Strangler fig (file-tools 试点单 PR)：收益局限，AppError 跨域错误不同步。
- 单 PR 全块：30+ 文件改动，review 难。

### D4 — AppError 架构：Schema.TaggedError 公共基类 + `_tag` 判别

```ts
// src/shared/lib/errors.ts
export class AppError extends Schema.TaggedError<AppError>()("AppError", {
  message: Schema.String,
}) {}

// 子类继承, 仅添加自有字段:
export class NotFound extends AppError {
  static readonly _tag = "NotFound"
}

export class Network extends AppError {
  static readonly _tag = "Network"
  declare readonly cause: string | undefined  // Schema.optional(Schema.String)
}

export class SandboxViolation extends AppError {
  static readonly _tag = "SandboxViolation"
  declare readonly path: string
  declare readonly workspace_label: string
  // message 字段从基类来; throw 时由 path + workspace_label 拼 message:
  //   `SandboxViolation: path '${path}' is outside workspace '${workspace_label}'`
}

// 用法:
Effect.fail(new NotFound({ message: "File not found" }))
Effect.fail(new SandboxViolation({ message: `Path '/etc/passwd' is outside workspace 'myproject'`, path: "/etc/passwd", workspace_label: "myproject" }))
```

**关键不变量**：
- 所有 AppError 子类必须继承公共基类（不是 8 个独立类 + 联合类型），保证 `Effect<T, AppError>` 仍可用 + `instanceof AppError` 可写。
- 判别字段名 `_tag`（Effect 习惯）— 12 consumer 全部从 `err.kind` 迁移到 `err._tag` + `instanceof X`。
- `Effect.fail(err)` 接 `AppError` 实例而非 `{kind, ...}` 裸对象 — TS 类型层强制约束。
- SandboxViolation **必须补 message 字段**（旧 union 没有 message，是 base class 强约束带来的小幅语义统一）。

### D5 — PR 1 / PR 2 边界：Additive + Legacy 别名

PR 1 只增不删：
- 新增 `src/shared/lib/errors.ts`，新 `AppError` class 体系存在。
- `src/shared/lib/types.ts` 把旧 union **重命名为** `LegacyAppErrorUnion`，加 `@deprecated` 注释。`AppError` 类型名让位给新 class（class + type 重名 = 同名 import 冲突，新 class 优先）。
- `format-app-error.ts` 重写支持**双源**：先 `instanceof AppError` + `_tag` 分发；fallback 到 `e.kind` 判断（旧 union 仍走老路径）。

PR 2 删旧：
- 12 consumer 全部从 `err.kind === "X"` / `{ kind: "X" }` 迁到 `instanceof X` / `new X({...})`。
- 删除 `LegacyAppErrorUnion` from types.ts。
- format-app-error.ts 删 fallback 分支。

**拒绝理由**：
- PR 1 不 additive (硬切 12 consumer)：PR 1 变 ~20 文件改动，review 难。
- 仅 rename LegacyAppErrorUnion 但不重写 format-app-error：consumer 切到 _tag 后 format-app-error 无法 fallback。

### D6 — Schema 落位：每 feature 自治（domain schema 归属 feature，跨域基础设施在 shared/）

- **跨域基础设施**（仅 AppError base class / Schema re-export / TaggedError helper）放 `src/shared/lib/errors.ts`。
- **Domain schema**（WorkspaceId / FilePath / ToolCallId / ConversationId / Provider settings）按 feature 拆：
  - `src/features/file-tools/lib/schemas.ts` — file 工具领域
  - `src/features/chat/lib/schemas.ts` — chat 领域
  - `src/features/settings/lib/schemas.ts` — settings 领域
- 跨域共享 ID (WorkspaceId) 在多 feature 复用时抽到 `shared/lib/`，但首版各 feature 自治定义（PR 4 评估）。

**拒绝理由（统一 shared/lib/schemas/）**：与项目 5+1 子目录白名单兼容，但跨域 ID 定义在 `shared/`，domain 边界模糊。Feature 自治符合 ADR-0010 5 子目录白名单精神（domain knowledge belongs to domain）。

### D7 — PR 1 字段类型：全 Schema.String，Branded 推 PR 4

PR 1 所有 AppError 子类的字段走 `Schema.String` 或 `Schema.optional(Schema.String)`：
- Network.cause → `Schema.optional(Schema.String)`
- InvalidConfig.field → `Schema.optional(Schema.String)`
- ToolCall.tool_call_id → `Schema.String`
- SandboxViolation.path → `Schema.String`
- SandboxViolation.workspace_label → `Schema.String`

Branded 类型 (`WorkspaceId`, `FilePath`, `ToolCallId`, `ConversationId`) 推迟到 PR 4，跟 domain schema 一起设计。理由：Branding 是**类型层 0 成本**但**实际值仍为 string** —— 跨 feature 共用 ID 必须先确定命名空间归属（PR 4 自然会处理）。

**拒绝理由**：
- 仅 path / tool_call_id Branded：domain 边界模糊（FilePath 属 file-tools，跨 feature 用 WorkspaceId 时再 brand）。
- 全部 Branded：PR 1 膨胀 + PR 4 边界压力。

### D8 — TSchema cast helper：`toToolParameters`

```ts
// src/shared/lib/tool-schema.ts (新增, 在 PR 3 落地)
import { Schema } from "effect"
import type { TSchema } from "@sinclair/typebox"

/** Schema.Struct → pi-ai AgentTool 接受的 TSchema */
export function toToolParameters<S extends Schema.Struct<any>>(schema: S): TSchema {
  return Schema.toJsonSchema(schema) as unknown as TSchema
}
```

所有 file-tool 注册位置用：
```ts
parameters: toToolParameters(ReadFileSchema)
```
而不是：
```ts
parameters: Schema.toJsonSchema(ReadFileSchema) as unknown as TSchema
```

## Decision Tree (grill-with-docs 2026-07-11 完整记录)

| # | 决策维度 | 锁定值 |
|---|---------|-------|
| Q1 | Schema 选型 | `effect/Schema`（内置） |
| Q2 | 移除策略 | B: 源码去 typebox 化（package.json 降级） |
| Q2.1 | 驱动力 | Schema-native 特性（TaggedError/Branded/Refinement） |
| Q3 | 范围 | D: 全栈 Schema 化 |
| Q3.1 | AppError 模型 | 同步升 Schema.TaggedError |
| Q4 | PR 拆分 | 4 PR 基础设施先行 |
| Q4.1 | Schema 落位 | C: 每 feature 自治 |
| Q5 | 判别字段 | A: `_tag`（Effect 习惯） |
| Q5.1 | Tag 架构 | 公共基类 |
| Q6 | 字段类型 | PR 1 全 Schema.String，Branded 推 PR 4 |
| Q6.1 | SandboxViolation | 构造时补 message |
| Q7 | PR 边界 | PR 1 additive + Legacy 别名 |
| Q8 | 治理文档 | 单个 ADR-0025 汇总 |
| Q8.1 | CONTEXT.md | 6 词条加 schema/TaggedError/Branded/TSchema cast/LegacyAppErrorUnion |

## Consequences

### 正面

- **统一错误模型**：从"裸对象判别联合"升到"Schema.TaggedError class 层级"，拿到 `instanceof X` 类型守卫 + 自动 JSON Schema 派生 + `Cause` 自动序列化 + `Schema.decodeUnknown` 校验入口。
- **跨域 Schema 一致性**：file-tools / chat / settings 三领域 schema 写法统一（`Schema.Struct({...})`），未来扩展 / 校验 / 重构的认知成本下降。
- **Effect 生态完整闭环**：`Effect` + `Layer` + `Stream` + `Schema.TaggedError` 全家桶，与 ADR-0003 (Effect-TS logic layer) 一致。
- **Branding 基础设施就绪**：PR 4 引入 `WorkspaceId` / `FilePath` / `ToolCallId` 时，已有公共基类 + `_tag` 体系可复用。
- **AJV / pi-mono 边界透明**：`Schema.toJsonSchema(s) as unknown as TSchema` 包成 `toToolParameters()` helper 后，调用点无感。

### 负面 / 风险

- **PR 1 ~ PR 4 整体 2-3 周**：每 PR 都涉及多文件 + tests，review 成本不低（PR 2 12 文件最大）。
- **SandboxViolation 补 message 字段**：旧 union 允许无 message（仅 path + workspace_label），新基类强约束 message 必填 —— 8 throw 点需补（Rust 端 `SandboxViolation` IPC payload 也要加 message 字段，或 TS 端在收到 IPC 错误时派生）。
- **`Schema.toJsonSchema` 输出与 typebox 100% 兼容性待验证**：JSON Schema spec 一致性理论上 OK（两者都遵循 JSON Schema Draft 7+），但 pi-ai AJV 编译可能对某些关键字（如 `format`, `$ref`, `definitions`）有微差。需 PR 3 + e2e 验证。
- **LegacyAppErrorUnion 临时态**：PR 1 ~ PR 2 中间窗口期，`AppError` 类与 `LegacyAppErrorUnion` 类型同时存在 ~1-2 周。新代码须强制走新 class（靠 review / linter），旧代码暂容忍双源。
- **PR 4 Branded 类型边界模糊**：跨域 ID（WorkspaceId）究竟定义在 file-tools / chat / shared 哪个？本次 PR 4 内评估；可能衍生 ADR-0026。

### 兼容性

- **类型层**：`AgentTool<TParameters extends TSchema = TSchema>` 接口不变（typebox 仍是 pi-ai 传递依赖）；`AgentTool<unknown, ...>` 不允许 — 必须显式传 `TSchema` 类型或 generic inference。
- **运行时层**：pi-ai AJV 编译 `tool.parameters` 接受任意 JSON Schema spec 对象，`Schema.toJsonSchema` 输出标准 JSON Schema，**无需 pi-mono 升级**。
- **公共 API**：`formatAppError(cause: Cause.Cause<AppError>)` 形态保留；但 `AppError` 类型从 union 变 class，`cause._tag === "Fail"` 后续取出的 `cause.error` 是 instance 而非 object，JSON 序列化由 Effect 自带完成（不再手动 `JSON.stringify`）。

### Follow-ups (后续 ADR 候选)

- **ADR-0026 — Branded 跨域 ID 命名空间归属** (PR 4 衍生)：`WorkspaceId` 在 file-tools / chat / shared 哪个定义？多个 feature 复用时的归属规则？
- **ADR-0027 — `format-app-error` V2 重构** (PR 2 衍生)：是否引入 effect-log 体系 / 结构化日志 / i18n 文案外提？

## Migration Plan

### 验证策略（每 PR）

每 PR 必须通过的 gate：
1. `vp run typecheck` exit 0
2. `vp run test` 全绿 (589 passed / 1 skipped baseline；不应引入新 failed/skipped)
3. `lsp_diagnostics` 改动文件 clean
4. **PR 3 额外**：e2e 5 个 file-tool 真实 LLM 调用通过（typebox vs Schema JSON Schema 输出一致性验证）
5. **PR 2 额外**：`format-app-error.test.ts` 覆盖 8 变体 × 2 (new instance + legacy fallback during PR 1)

### 进度跟踪

每次开新分支前更新 `.omo/plans/`：
- `.omo/plans/phase-3-schema-001.md` — PR 1 (AppError base + Legacy 别名 + format-app-error 重写)
- `.omo/plans/phase-3-schema-002.md` — PR 2 (12 consumer 迁移)
- `.omo/plans/phase-3-schema-003.md` — PR 3 (file-tools typebox → Schema)
- `.omo/plans/phase-3-schema-004.md` — PR 4 (Branded + chat/settings schemas)

每个 plan 走 `/writing-plans` skill + Momus 评审 + Effect-TS / Domain-modeling skill 咨询。

### Commit 粒度

每个 PR 单 commit（参照 ADR-0023 atomic rename 模式）：
- PR 1 ~ 1 commit（新增 + 重命名 + format-app-error 重写必须同时提交，否则中间状态编译失败）
- PR 2 ~ 1 commit（consumer 全部迁移后才完整，否则 type error）
- PR 3 ~ 1 commit
- PR 4 ~ 1 commit