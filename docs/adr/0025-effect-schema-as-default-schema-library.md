# 0025 — Effect Schema as Default Schema Library

**Status**: accepted · **Date**: 2026-07-11
**Scope**: `src/shared/lib/errors.ts` (新增) + `src/shared/lib/types.ts` (AppError 重命名为 LegacyAppErrorUnion) + `src/shared/lib/format-app-error.ts` (重写) + `src/shared/lib/format-app-error.test.ts` + `src/shared/lib/tool-schema.ts` (Type layer: SchemaToTypeBox<S> conditional type) + `src/features/file-tools/lib/file-tools.ts` (5 schemas 改写 + 5 AgentTool call sites 迁移) + `src/shared/lib/tool-schema.test.ts` (类型层断言新增) + `src/features/file-tools/lib/file-tools.test.ts` + 12 个 AppError consumer (PR 2 全栈迁移) + `src/AGENTS.md` (Schema 硬规则) + `src/features/*/lib/schemas.ts` (PR 4 落地) + `package.json` (typebox 降级为 pi-ai 传递依赖)
**Supersedes**: 部分 — ADR-0016 D3 中关于 `AppError` 判别联合的实现细节（Error 模型 base 改变，但 ADR-0016 D4 "service-in-store" + formatAppError 公共 API 形态保留）

**Related**: ADR-0003 (Effect-TS logic layer), ADR-0016 (App Store + service-in-store + formatAppError), ADR-0018 (unified logging), ADR-0024 (Electron shell migration), `CONTEXT.md` "架构" section 新增 Schema 子段

## Context

`file-tools.ts` 5 个 AgentTool 用 `@sinclair/typebox` (`Type.Object({...})` + `Static<typeof Schema>`) 定义 LLM 函数调用 schema。typebox 角色：

- **运行时**：被 pi-mono (`@mariozechner/pi-ai@0.9.4` → `@earendil-works/pi-agent-core`) 内部 AJV 编译为 JSON Schema 验证 LLM 工具调用参数
- **类型层**：`AgentTool<TParameters extends TSchema = TSchema>` 强约束 typebox `TSchema` 类型；`Static<TParameters>` 推导 `execute` 入参类型
- **依赖**：`@sinclair/typebox@^0.34.49` 在 pi-agent-core 的 `dependencies` 字段（不是 peer），项目已通过 pnpm 间接安装

`AppError` 是纯 TS 判别联合（8 变体：NotFound / Unauthorized / Network / InvalidConfig / Database / ToolCall / SandboxViolation / Unknown），由 `src/shared/lib/types.ts` 导出，被 12 个文件消费（chat.store / app.store / ipc / workspace-service / settings-saver / provider-card / format-app-error 等）。

需求触发（grill-with-docs 2026-07-11，8 问 8 答）：

1. typebox 是 **pi-mono 边界硬约束**，不能彻底移除。源码侧去 typebox 化是务实做法。
2. 想用 Effect-native 特性：`Schema.TaggedError`（判别联合 → 实例类型 + `instanceof` + 自动 JSON Schema 派生 + `Cause` 序列化）/ Branded 类型 / Refinement / 统一 type-validation-error 模型。
3. `AppError` 是 Schema-native 特性的最大未开发阵地 — 把它从"裸对象判别联合"升级成 "Schema.TaggedError class 层级"。

后续需求触发（grill-with-docs 2026-07-12，3 问 3 答）：

4. 单纯审美诉求：消掉 `as unknown as TSchema`，让 cast 类型信息完整。
5. 类型推导诉求：`AgentTool<typeof params, ...>` + `Static<typeof params>` 自动等于 `Schema.Schema.Type<typeof ReadFileSchema>`，移除 `execute` 函数体 `params: unknown` 的手动窄化。
6. 运行时不诉求：JSON Schema 路径已稳，不动。

## Decisions

### D1 — Schema 选型：`effect/Schema` (内置，0 新 dep)

- 使用 `effect` 包内置的 `Schema` 模块 (`import { Schema } from "effect"`)。
- 不引入独立的 `@effect/schema` 包（已被 effect@3.x 合并）。
- 不引入 `zod` / `valibot`（与 Effect 生态割裂；pi-mono 内部已用 zod 但未对外暴露 schema 类型）。
- **拒绝理由（zod）**：与 `Effect.gen` / `Layer` / `Stream` 不一致，类型桥接复杂。

### D2 — 移除策略：源码去 typebox 化（typebox 仍作传递依赖）

- `package.json` 不再显式声明 `"@sinclair/typebox"`。
- `pnpm-lock.yaml` 仍含 typebox（pi-agent-core 拉入，作为传递依赖存在）。
- `src/features/file-tools/lib/file-tools.ts` 改用 `Schema.Struct({...})` 替代 `Type.Object({...})`。
- 调 pi-mono 时通过类型层桥（见 D8）转 TypeBox 类型符号喂给 `tool.parameters`，运行时仍走 JSON Schema（AJV 验证）。
- **拒绝理由（彻底移除 typebox）**：会破 `AgentTool<TParameters extends TSchema = TSchema>` 编译期约束；pi-mono 强依赖 typebox 类型符号。

### D3 — 范围：全栈 Schema 化（4 PR 序贯，基础设施先行）

不只动 file-tools.ts，整个项目所有 schema 来源统一到 `effect/Schema`：

```
PR 1 — Schema 基础设施 (foundation, additive)
  ├── src/shared/lib/errors.ts (新增)
  │   ├── 8 个独立 Schema.TaggedError leaf classes + 类型 union (AppError)（见 D4 拒绝公共基类方案 rationale）
  │   └── isAppError(u: unknown): u is AppError (OR-of-instanceof 守卫)
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
  ├── ReadFileSchema = Schema.Struct({ workspaceId: Schema.optional(Schema.String), path: Schema.String })   (PR 5 后改 camelCase per ADR-0013.1)
  ├── WriteFileSchema = ...
  ├── EditFileSchema = ...
  ├── SearchFilesSchema = ...
  ├── DeleteFileSchema = ...
  ├── type XxxArgs = Schema.Schema.Type<typeof XxxSchema>  (PR 5 后删除, 见 D10)
  └── AgentTool<typeof XxxSchema, ...> → AgentTool<typeof toToolParameters(XxxSchema), ...>  (PR 5, 见 D10)

PR 4 — Domain schema 补齐 (chat / settings / file-tools feature 自治)
  ├── src/features/file-tools/lib/schemas.ts (新增) — Branded WorkspaceId / FilePath / ToolCallId; Refinement on path/glob
  ├── src/features/chat/lib/schemas.ts (新增) — Branded ConversationId / WorkspaceId; Schema validation for runtime inputs
  ├── src/features/settings/lib/schemas.ts (新增) — Provider / Settings schemas (与 electron-side Zod 镜像对齐)
  └── AGENTS.md 加硬规则: "新错误必须 Schema.TaggedError; 新 schema 必须 Schema.Struct"

PR 5 — SchemaToTypeBox<S> 类型层 + 调用点迁移 (本 ADR 落地, 见 D8-D12)
  ├── src/shared/lib/tool-schema.ts
  │   ├── 添加 SchemaToTypeBox<S> / FieldsOf<S> / AstToTypeBox<A> conditional types
  │   └── 改 cast: as unknown as TSchema → as SchemaToTypeBox<S>
  ├── src/shared/lib/tool-schema.test.ts — 类型层断言 (每个 D9 节点 1 案例)
  ├── src/features/file-tools/lib/file-tools.ts
  │   ├── 5 个 tool 改: AgentTool<TSchema, ...> → AgentTool<typeof readParams, ...>
  │   └── 删除 5 个 Schema.Schema.Type<typeof XxxSchema> manual aliases
  └── src/features/file-tools/lib/file-tools.test.ts — 更新 IsExactTSchema<TParameters> 测试
```

**拒绝理由（其它序贯）**：

- 3 PR 严格分层 (Branded → TaggedError → AppError 同步)：架构清淅但慢，且 Branded 边界模糊（哪些 ID Branded？）易卡 PR 4。
- Strangler fig (file-tools 试点单 PR)：收益局限，AppError 跨域错误不同步。
- 单 PR 全块：30+ 文件改动，review 难。

### D4 — AppError 架构：8 个独立 leaf classes + union

```ts
// src/shared/lib/errors.ts (当前实现)
import { Schema } from "effect"

export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  message: Schema.String,
}) {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {
  message: Schema.String,
}) {}

export class Network extends Schema.TaggedError<Network>()("Network", {
  message: Schema.String,
  cause: Schema.optional(Schema.String),
}) {}

export class InvalidConfig extends Schema.TaggedError<InvalidConfig>()("InvalidConfig", {
  message: Schema.String,
  field: Schema.optional(Schema.String),
}) {}

export class Database extends Schema.TaggedError<Database>()("Database", {
  message: Schema.String,
  cause: Schema.optional(Schema.String),
}) {}

export class ToolCall extends Schema.TaggedError<ToolCall>()("ToolCall", {
  message: Schema.String,
  tool_call_id: Schema.String,
}) {}

export class SandboxViolation extends Schema.TaggedError<SandboxViolation>()("SandboxViolation", {
  message: Schema.optional(Schema.String),  // 见 D7 过渡条款
  path: Schema.String,
  workspace_label: Schema.String,
}) {}

export class Unknown extends Schema.TaggedError<Unknown>()("Unknown", {
  message: Schema.String,
}) {}

// AppError 是类型 union (命名借由 type alias 沿用)
export type AppError =
  | NotFound | Unauthorized | Network | InvalidConfig
  | Database | ToolCall | SandboxViolation | Unknown;

export const isAppError = (u: unknown): u is AppError =>
  u instanceof NotFound || u instanceof Unauthorized
  || u instanceof Network || u instanceof InvalidConfig
  || u instanceof Database || u instanceof ToolCall
  || u instanceof SandboxViolation || u instanceof Unknown;
```

**关键不变量**：

- 所有 AppError 子类各自独立（不是公共基类），保证 `Effect<T, AppError>` 仍可用 + `instanceof X` 可写。
- 判别字段名 `_tag`（Effect 习惯）— 12 consumer 全部从 `err.kind` 迁移到 `err._tag + instanceof X`。
- `Effect.fail(err)` 接 `AppError` 实例而非 `{kind, ...}` 裸对象 — TS 类型层强制约束。
- SandboxViolation `message` 字段过渡条款见 D7。

**拒绝理由（公共基类方案）**：Effect 3.x `Schema.TaggedError` 把 INSTANCE `_tag` 烤进制 ctor 的字面 tag；子类 `static _tag` 不覆盖实例；`Effect.catchTag` 无法匹配。后续 ADR 若 Effect 修复子类化，需新 ADR 重新审视本决策。

### D5 — PR 1 / PR 2 边界：Additive + Legacy 别名

PR 1 只增不删：

- 新增 `src/shared/lib/errors.ts`，新 8 个 `AppError` class 体系存在。
- `src/shared/lib/types.ts` 把旧 union **重命名为** `LegacyAppErrorUnion`，加 `@deprecated` 注释。`AppError` 类型名让位给新 union type。
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
- **SandboxViolation.message → `Schema.optional(Schema.String)`**（PR 5 之前；之后必填，见下）

**SandboxViolation.message 过渡条款**：

- PR 1 – PR 4：`message: Schema.optional(Schema.String)`。旧 union 没有 message（仅 path + workspace_label），保持可选。
- "PR 5 起" = 合约生效：新 throw site 必须补 `message`（review reject 含未补 message 的新 throw site）。字段上加 `@deprecated` JSDoc 注释说明可选阶段过渡。
- 已知 8 个 throw site 补 `message` 由 PR 6+ 统一处理，过渡完毕时由后续 ADR 改为必填 `Schema.String`。

Branded 类型 (`WorkspaceId`, `FilePath`, `ToolCallId`, `ConversationId`) 推迟到 PR 4，跟 domain schema 一起设计。理由：Branding 是**类型层 0 成本**但**实际值仍为 string** —— 跨 feature 共用 ID 必须先确定命名空间归属（PR 4 自然会处理）。

**拒绝理由**：

- 仅 path / tool_call_id Branded：domain 边界模糊（FilePath 属 file-tools，跨 feature 用 WorkspaceId 时再 brand）。
- 全部 Branded：PR 1 膨胀 + PR 4 边界压力。

### D8 — TSchema cast helper：`JsonSchema.fromAST` runtime + `SchemaToTypeBox<S>` type layer

本 D8 由两部分组成：runtime path（D8-R）+ type layer（D8-A / D8-B / D8-C / D8-D）。Runtime path 选择 `JsonSchema.fromAST`（拒绝 `Schema.toJsonSchema` 方案，见 D8-R 拒绝理由）；type layer 引入 `SchemaToTypeBox<S>` conditional type（覆盖范围见 D8-B，cast 形态见 D8-C）。

#### D8-R — Runtime path: `JsonSchema.fromAST`

```ts
// src/shared/lib/tool-schema.ts
import { Schema } from "effect";
import * as JsonSchema from "effect/JSONSchema";
import type { TSchema } from "@sinclair/typebox";

/** 把 Effect `Schema.Struct` 桥接到 pi-mono `AgentTool` 接受的 `TSchema`。 */
export function toToolParameters<S extends Schema.Struct<any>>(schema: S): SchemaToTypeBox<S> {
  return JsonSchema.fromAST(schema.ast, { definitions: {} }) as SchemaToTypeBox<S>;
}
```

调用方：

```ts
const readParams = toToolParameters(ReadFileSchema);
export const readFileTool: AgentTool<typeof readParams, string | AppError> = {
  parameters: readParams,
  ...
};
```

**拒绝理由（`Schema.toJsonSchema`）**：3.21.x 的 `Schema.toJsonSchema` 走 `AST → JSON Schema` 转换路径会保留 Effect annotation；`fromAST` 直接读 AST 输出更接近 typebox 风格，AJV 兼容性更好。

#### D8-A — Scope: 类型层 only, 运行时不变

PR 5 改动仅限：

- `src/shared/lib/tool-schema.ts`（添加 conditional type + 改 cast 形态）
- 5 个 file-tool 调用点（`AgentTool<TSchema, ...>` → `AgentTool<typeof readParams, ...>`）
- 配套测试（类型层断言 + 调用点 IsExactTSchema 期望值更新）

**运行时路径不动**：仍 `JsonSchema.fromAST(schema.ast, { definitions: {} })`（per D8-R）。

**拒绝理由（"顺手把运行时也切到 TypeBox 真对象"）**：TypeBox 的 `Type.Object({...})` 运行时返回值就是 JSON Schema，与 `fromAST` 产物等价；切换无运行时收益，仅多 100+ LOC 适配与 ~5 个 file-tool 的 e2e 回归。

#### D8-B — `SchemaToTypeBox<S>` conditional type 覆盖范围

最小够用集（覆盖当前 5 个 file-tool 的所有 AST 节点）：

| Effect AST 节点 | TypeBox 对位 | 备注 |
|---|---|---|
| `Schema.String` | `Type.String()` | 1:1 |
| `Schema.Number` | `Type.Number()` | 1:1 |
| `Schema.Boolean` | `Type.Boolean()` | 1:1 |
| `Schema.Literal("a")` | `Type.Literal("a")` | 1:1 |
| `Schema.Array(S)` | `Type.Array(map(S))` | 1:1 |
| `Schema.Tuple([A,B])` | `Type.Tuple([map(A), map(B)])` | 1:1 |
| `Schema.Union(A,B)` | `Type.Union([map(A), map(B)])` | 1:1 |
| `Schema.Struct({...})` | `Type.Object<FieldsOf<S>>` | 顶层 brand |
| `Schema.optional(S)` | `Type.Optional(map(S))` | **不进 `required`** |

未覆盖节点（fail-fast 策略见 D8-C）：

- `Schema.brand` / `Schema.filter` / `Schema.refine` / `Schema.transform` —— TypeBox 无对位或 brand 会破坏 `Static<T>` 推导
- `Schema.suspend` / `Schema.Lazy` —— 递归 schema，shape 差异大
- `Schema.Record`（非 string key）/ `Schema.BigInt` / `Schema.Symbol` / `Schema.Date` —— TypeBox 不支持或需 format 兜底
- `Schema.TaggedError` —— 错误模型，不归工具 schema 管

未来新增工具若用到未覆盖节点，需先扩 `SchemaToTypeBox<S>` 再用。**禁止**用 `as any` 兜底（per `src/AGENTS.md` 硬规则）。

#### D8-C — Cast 形态：`as SchemaToTypeBox<S>` 替代 `as unknown as TSchema`

helper 签名收紧：

```ts
// 旧（仅 D8-R 运行时路径，未含类型层）
export function toToolParameters<S extends Schema.Struct<any>>(schema: S): TSchema { ... }

// 新（D8-C, PR 5）
export function toToolParameters<S extends Schema.Struct<any>>(
  schema: S,
): SchemaToTypeBox<S> {
  return JsonSchema.fromAST(schema.ast, { definitions: {} }) as SchemaToTypeBox<S>;
}
```

调用方迁移（`file-tools.ts` 5 个 tool）：

```ts
// 旧
export const readFileTool: AgentTool<TSchema, string | AppError> = {
  parameters: toToolParameters(ReadFileSchema),
  execute: async (_, params) => { /* params: unknown, 需手动 cast */ },
};

// 新
const readParams = toToolParameters(ReadFileSchema);
//    ^ 类型: Type.Object<{ workspaceId: Type.Optional<Type.String>, path: Type.String }>
export const readFileTool: AgentTool<typeof readParams, string | AppError> = {
  parameters: readParams,
  execute: async (_, params) => {
    // params: { workspaceId?: string; path: string }  ← Static<TParameters> 自动推导
  },
};
```

**未覆盖 AST 节点 fail-fast 策略**：conditional type 在类型层无法"throw"，靠 TS 编译错误暴露。若某工具 schema 用到未覆盖节点，type 层 resolve 到 `never` → `AgentTool<typeof params, ...>` 报错 `Type 'never' does not satisfy constraint 'TSchema'`。**禁止**用 `as any` / `@ts-ignore` 静默兜底（per `src/AGENTS.md`）。

#### D8-D — Rejected: 路线 B（AST → TypeBox 真对象）

替代方案评估过并拒绝：

- 运行时产物：`Type.Object({...})` 调用 vs `JsonSchema.fromAST` —— **结构等价**（TypeBox 内部即 JSON Schema 生成器）
- AJV 兼容性：路线 B 应等价或更好（TypeBox 喂 AJV 是"标准答案"），但需 5 个 file-tool e2e 回归确认
- 类型层：两条路线产物等价（都靠 TypeBox 类型 brand）
- 工作量：路线 B ~400-600 LOC（10+ AST 节点映射 + 完整 conditional types）；本 D8 路线 ~150-200 LOC
- 治理成本：路线 B 实质推翻 D8-R（运行时路径）；本 D8 与 D8-R 并列

拒绝理由：

1. 运行时零差异（AJV 看到的都是 JSON Schema），但工作量 ~3×
2. 推翻 D8-R 需要重新走 e2e 回归，治理成本高
3. `fromAST` 路径已被 D8-R 验证 "更接近 JSON Schema Draft 07 输出、AJV 兼容性更好"

## Consequences

### 正面

- **统一错误模型**：从"裸对象判别联合"升到"Schema.TaggedError class 层级"，拿到 `instanceof X` 类型守卫 + 自动 JSON Schema 派生 + `Cause` 自动序列化 + `Schema.decodeUnknown` 校验入口。
- **跨域 Schema 一致性**：file-tools / chat / settings 三领域 schema 写法统一（`Schema.Struct({...})`），未来扩展 / 校验 / 重构的认知成本下降。
- **Effect 生态完整闭环**：`Effect` + `Layer` + `Stream` + `Schema.TaggedError` 全家桶，与 ADR-0003 (Effect-TS logic layer) 一致。
- **Branding 基础设施就绪**：PR 4 引入 `WorkspaceId` / `FilePath` / `ToolCallId` 时，已有公共基类 + `_tag` 体系可复用。
- **AJV / pi-mono 边界透明**：`toToolParameters()` helper 包装 JSON Schema 转换，调用点无感。
- **类型层完整（D8-C）**：消掉 `as unknown as TSchema`，cast 类型信息完整保留。
- **类型推导正确（D8-C）**：`AgentTool<typeof readParams, ...>` + `Static<typeof readParams>` 自动等于 `Schema.Schema.Type<typeof ReadFileSchema>`；移除每个 tool 的 `Schema.Schema.Type<typeof XxxSchema>` 手动 type alias（`file-tools.ts:80-114` 的 5 个 type alias 可删）。
- **`tool.parameters` 编辑时类型校验**：IDE 在 `parameters: readParams` 上能 hover 到完整 schema shape；改 schema 后 TS 立即报错（如把 `path: Schema.String` 写成 `path: Schema.Number`，5 个 tool 调用点立即 type error）。
- **不破 D8-R**：runtime path 不动，5 个 file-tool e2e 无需回归。

### 负面 / 风险

- **PR 1 ~ PR 5 整体 2-3 周**：每 PR 都涉及多文件 + tests，review 成本不低（PR 2 12 文件最大）。
- **D4 correction（公共基类 → 8 leaf）**：在 Effect 官方修复 `Schema.TaggedError` 子类化语义前，新团队成员需读 D4 才能"看见"为什么没公共基类。
- **D8-R `JsonSchema.fromAST` 是 Effect 内部 API**：版本升级可能 break；需在 Effect 升级时同步回归测试。
- **SandboxViolation 补 message 字段**：PR 5 之前 optional（保持兼容），PR 5 之后新 throw site 必填 —— 8 throw 点需补（Rust 端 `SandboxViolation` IPC payload 也要加 message 字段，或 TS 端在收到 IPC 错误时派生）。
- **`SchemaToTypeBox<S>` conditional types 风险（D8-B / D8-C）**：~120 LOC of mapped types / conditional types / AST 类型踩点。Effect 3.21.x 的 `AST.PropertySignature.isOptional` 等内部节点是 stable 导出，但若未来 Effect 版本调整 AST 形状，本 D8 需同步修复。需在 `tool-schema.test.ts` 加类型层断言（`AssertEqual<Static<typeof out>, {...}>`）做编译期回归。
- **`SchemaToTypeBox<S>` fail-fast 副作用（D8-C）**：未覆盖 AST 节点（`Schema.brand` / `Schema.filter` / `Schema.suspend` 等）的工具调用点会**编译失败**而非运行时失败 —— 表面上更严，但若未来加新工具用到这些节点，需先扩 mapping。
- **类型与运行时分离的双源真相**：类型层 `SchemaToTypeBox<S>` 与运行时 `JsonSchema.fromAST` 产物理论上 1:1 对应，但 JSON Schema Draft 07 spec 不强制 `Static<T>` 的所有结构。**需类型层 parity 测试**。
- **LegacyAppErrorUnion 临时态**：PR 1 ~ PR 2 中间窗口期，`AppError` 类型与 `LegacyAppErrorUnion` 类型同时存在 ~1-2 周。新代码须强制走新 class（靠 review / linter），旧代码暂容忍双源。
- **PR 4 Branded 类型边界模糊**：跨域 ID（WorkspaceId）究竟定义在 file-tools / chat / shared 哪个？本次 PR 4 内评估；可能衍生 ADR-0026。

### 兼容性

- **类型层**：`AgentTool<TParameters extends TSchema>` 接口不变（typebox 仍是 pi-agent-core 传递依赖）。`AgentTool<TSchema, ...>` 写法**不再被推荐**但仍兼容（旧 call site 不强制迁移，本 ADR 仅迁移 5 个 file-tool）。
- **运行时层（D8-R）**：pi-mono AJV 编译 `tool.parameters` 接受任意 JSON Schema spec 对象，类型层 brand 是 TS 编译期概念、不影响运行时。无需 pi-mono 升级。
- **运行时层（D8-C）**：`JsonSchema.fromAST` 产物不变，TypeBox 类型 brand 不影响运行时 AJV。无需 e2e 回归。
- **公共 API**：`formatAppError(cause: Cause.Cause<AppError>)` 形态保留；但 `AppError` 类型从 union 变 class union，`cause._tag === "Fail"` 后续取出的 `cause.error` 是 instance 而非 object，JSON 序列化由 Effect 自带完成（不再手动 `JSON.stringify`）。

### Follow-ups (后续 ADR 候选)

- **ADR-0026 — Branded 跨域 ID 命名空间归属** (PR 4 衍生)：`WorkspaceId` 在 file-tools / chat / shared 哪个定义？多个 feature 复用时的归属规则？
- **ADR-0027 — `format-app-error` V2 重构** (PR 2 衍生)：是否引入 effect-log 体系 / 结构化日志 / i18n 文案外提？
- **ADR-0028 — `SchemaToTypeBox<S>` 扩展**（PR 6+ 衍生，按需）：若未来 5+ 个工具用到 brand / filter / suspend，需开新 ADR 扩 `SchemaToTypeBox<S>` 覆盖范围。本 D8 不预先支持。
- **`tool-schema.test.ts` 类型层断言（D8-C 跟进）**：用 `expect-type` 或纯 type-level assertion（`AssertEqual<...>`）覆盖 D8-B 表中每个 AST 节点的 `Static<typeof out>` 推导。

## Migration Plan

### 验证策略（每 PR）

每 PR 必须通过的 gate：

1. `vp run typecheck` exit 0（**PR 5 关键**：类型层 conditional types 的所有边界 case 必须编译通过）
2. `vp run test` 全绿 (589 passed / 1 skipped baseline；不应引入新 failed/skipped)
3. `lsp_diagnostics` 改动文件 clean
4. **PR 3 额外**：e2e 5 个 file-tool 真实 LLM 调用通过（typebox vs Schema JSON Schema 输出一致性验证）
5. **PR 5 额外**：type-level parity 测试覆盖 D8-B 表中每个 AST 节点；`file-tools.test.ts` 第 385 行 `IsExactTSchema` 测试更新后通过 —— 证明 `TParameters` 不再是裸 `TSchema` 而是 `Type.Object<FieldsOf<S>>`
6. **PR 2 额外**：`format-app-error.test.ts` 覆盖 8 变体 × 2 (new instance + legacy fallback during PR 1)

### 进度跟踪

每次开新分支前更新 `.omo/plans/`：

- `.omo/plans/phase-3-schema-001.md` — PR 1 (AppError base + Legacy 别名 + format-app-error 重写)
- `.omo/plans/phase-3-schema-002.md` — PR 2 (12 consumer 迁移)
- `.omo/plans/phase-3-schema-003.md` — PR 3 (file-tools typebox → Schema)
- `.omo/plans/phase-3-schema-004.md` — PR 4 (Branded + chat/settings schemas)
- `.omo/plans/phase-3-schema-005.md` — PR 5 (SchemaToTypeBox<S> 类型层 + 调用点迁移)

每个 plan 走 `/writing-plans` skill + Momus 评审 + Effect-TS / Domain-modeling skill 咨询。

### Commit 粒度

每个 PR 单 commit（参照 ADR-0023 atomic rename 模式）：

- PR 1 ~ 1 commit（新增 + 重命名 + format-app-error 重写必须同时提交，否则中间状态编译失败）
- PR 2 ~ 1 commit（consumer 全部迁移后才完整，否则 type error）
- PR 3 ~ 1 commit
- PR 4 ~ 1 commit
- PR 5 ~ 1 commit（仅代码层 + 测试）

**PR 5 commit message 草稿**：

```
feat(tool-schema): SchemaToTypeBox<S> type layer, remove as unknown as TSchema

- Runtime path unchanged: JsonSchema.fromAST (per ADR-0025 D8-R)
- Type layer: SchemaToTypeBox<S> conditional type maps Schema.Struct
  to Type.Object<FieldsOf<S>>, replacing as unknown as TSchema cast
  with as SchemaToTypeBox<S> (narrow type, no info loss)
- 5 file-tool call sites now use AgentTool<typeof toToolParameters(...)>
  → Static<TParameters> correctly infers params type
  → execute params: { workspaceId?: string; path: string } instead of unknown
  (Note: PR 5 落地时 schema field 是 snake_case `workspace_id`; ADR-0013.1 在 PR 5 之后将 LLM wire-format 改 camelCase `workspaceId`,执行参数类型同步更新。)
- file-tools.ts: remove 5 Schema.Schema.Type<typeof XxxSchema> manual aliases
  (auto-inferred via Static<typeof params>)

Code:
  src/shared/lib/tool-schema.ts
  src/shared/lib/tool-schema.test.ts
  src/features/file-tools/lib/file-tools.ts
  src/features/file-tools/lib/file-tools.test.ts
```

## Decision Tree

| # | 决策维度 | 锁定值 |
|---|---------|-------|
| Q1 | Schema 选型 | `effect/Schema`（内置） |
| Q2 | 移除策略 | B: 源码去 typebox 化（package.json 降级） |
| Q2.1 | 驱动力 | Schema-native 特性（TaggedError/Branded/Refinement）+ 类型推导诉求 |
| Q3 | 范围 | D: 全栈 Schema 化（PR 1-5） |
| Q3.1 | AppError 模型 | 8 独立 leaf classes + 类型 union（废除公共基类） |
| Q4 | PR 拆分 | 5 PR 基础设施先行（PR 5 = 类型层） |
| Q4.1 | Schema 落位 | C: 每 feature 自治 |
| Q5 | 判别字段 | A: `_tag`（Effect 习惯） |
| Q5.1 | Tag 架构 | 8 个独立 leaf classes + 类型 union（废除公共基类） |
| Q6 | 字段类型 | PR 1 全 Schema.String，Branded 推 PR 4 |
| Q6.1 | SandboxViolation.message | PR 5 之前 optional（过渡），之后新 throw site 必填；8 个已知 throw site 由 PR 6+ 统一补 |
| Q7 | PR 边界 | PR 1 additive + Legacy 别名 |
| Q8 | 治理文档 | 单个 ADR-0025 汇总 |
| Q8.1 | CONTEXT.md | 6 词条加 schema/TaggedError/Branded/TSchema cast/LegacyAppErrorUnion/SchemaToTypeBox |
| Q9 | TSchema helper runtime path（D8-R） | `JsonSchema.fromAST(s.ast, { definitions: {} })` |
| Q10 | TSchema helper scope（D8-A） | 仅类型层；运行时路径不动 |
| Q11 | `SchemaToTypeBox<S>` 覆盖节点（D8-B） | `String` / `Number` / `Boolean` / `Literal` / `Array` / `Tuple` / `Union` / `Struct` / `optional` |
| Q12 | 未覆盖节点策略（D8-C） | TS 编译失败（`never`）+ 禁止 `as any` 兜底 |
| Q13 | Cast 形态（D8-C） | `as SchemaToTypeBox<S>`（窄类型，无信息丢失） |
| Q14 | 调用点迁移（D8-C） | 5 个 file-tool 全部迁到 `AgentTool<typeof params, ...>` |
| Q15 | 路线 B（D8-D） | 拒绝：运行时零差异 + 工作量 ~3× + 推翻 D8-R 治理成本高 |