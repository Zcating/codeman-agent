# ADR 0009 — pi Error to AppError Full Subclass Mapping

**Status**: accepted · **Date**: 2026-08-20 · **Scope**: codeman-agent V4 错误模型 / IPC 边界错误传递
**Related**: ADR 0001 (V4 总纲 D10)

## Context

V3 错误模型（per V3 ADR-0025 D4）：`AppError` 基类 + `Schema.TaggedError` 派生的 8 个子类：

- `NotFound`
- `Unauthorized`
- `Network`
- `InvalidConfig`
- `Database`
- `ToolCall`
- `SandboxViolation`
- `Unknown`

各 layer 用 `Effect.fail(new AppError(...))` 抛出，`instanceof AppError` 类型守卫，`cause._tag === "X"` 模式匹配。

V4 runtime 迁 main process 后，pi-coding-agent 抛出大量 pi 原生错误：

- model call failure（provider / auth / network）
- session error（cwd 不存在 / 权限拒绝）
- tool execute exception（tool 抛错 / 类型不匹配）
- compaction error（compaction 失败）
- credential store error（auth.json 解析失败）
- extension load error
- 等等

V4 必须决定如何在 IPC 边界处理 pi 错误。

## Decision

### D1. AppError 体系保留为 renderer 边界错误类型

V4 renderer 侧的 `AppError` + `Schema.TaggedError` 体系**保留**：

- 作为 renderer UI 错误展示的标准化类型（toast / inline error）
- 作为 IPC 边界的错误序列化协议
- Solid store 的错误状态字段类型

### D2. pi 错误 → AppError 全量独立子类映射

V4 main 端在 IPC handler 出口对每个 pi 错误类型**独立映射为一个 AppError 子类**（而非统一归为 `Unknown`）。新增的子类：

| Pi 错误类型 | AppError 子类 | 说明 |
|---|---|---|
| ModelProviderError | `ModelProvider` | provider 不可达 / 4xx / 5xx |
| ModelAuthError | `ModelAuth` | API key 缺失 / 401 / 403 |
| ModelRateLimitError | `ModelRateLimit` | 429 |
| ModelContextLengthError | `ModelContextLength` | context window 溢出 |
| ModelTimeoutError | `ModelTimeout` | fetch 超时 |
| ModelProtocolError | `ModelProtocol` | 协议不匹配（如 SSE 解析失败） |
| SessionNotFoundError | `SessionNotFound` | sessionId 不存在 |
| SessionPermissionError | `SessionPermission` | cwd 不可访问 |
| SessionFilesystemError | `SessionFilesystem` | JSONL 文件读写失败 |
| ToolExecuteError | `ToolExecute` | tool execute 抛错 |
| ToolArgumentError | `ToolArgument` | 参数校验失败 |
| ToolUnavailableError | `ToolUnavailable` | tool 不在注册表 |
| CompactionError | `Compaction` | 上下文压缩失败 |
| ExtensionLoadError | `ExtensionLoad` | extension 加载失败 |
| CredentialStoreError | `CredentialStore` | auth.json 解析/读写失败 |
| ResourceLoadError | `ResourceLoad` | context 文件加载失败 |
| PiRuntimeError | `PiRuntime` | 通用 pi runtime 错误兜底 |
| 兜底 | `Unknown` | 真正的未预期错误 |

V4 AppError 子类数：8（V3 保留 - `SandboxViolation` 因 ADR 0003 删除 = 7 保留）+ 17（pi 错误映射新增）+ 1（`Unknown` 兜底）= **18 个子类**。

### D3. SandboxViolation 删除

V3 `SandboxViolation` 子类删除（per ADR 0003 sandbox 语义删除）。

V3 7 个保留子类：`NotFound` / `Unauthorized` / `Network` / `InvalidConfig` / `Database` / `ToolCall` / `Unknown`。

### D4. 映射层实现

V4 main 端 `src/main/pi-runtime/error-mapper.ts` 实现映射：

```typescript
function mapPiError(err: unknown): AppError {
  return match(PiError.classify(err))
    .with({ kind: "ModelProvider" }, (e) => new ModelProvider({ ...e, ...baseFields(err) }))
    .with({ kind: "ModelAuth" }, (e) => new ModelAuth({ ... }))
    // ... 17 个分支
    .otherwise(() => new Unknown({ message: String(err), cause: err }));
}
```

`PiError.classify(err)` 是 pi 错误的归一化分类（基于 err.constructor.name 或 err._tag）。

### D5. IPC 序列化

AppError 通过 `Schema.toJsonSchema` + `Schema.encode` 序列化为 JSON payload 通过 IPC 传到 renderer：

```typescript
// main → renderer
webContents.send("pi:event", {
  type: "error",
  error: Schema.encodeSync(AppErrorSchema)(mapPiError(err)),
});
```

renderer 用 `Schema.decodeUnknown(AppErrorSchema)(payload)` 反序列化：

```typescript
const program = pipe(
  Effect.tryPromise({
    try: () => window.codeman.pi.prompt(text),
    catch: (e) => Schema.decodeUnknown(AppErrorSchema)(e),
  }),
  Effect.tapError((err) => /* update Solid store */),
);
```

### D6. 词汇表清理与新增

V3 `CONTEXT.md` 词汇表更新：

- `AppError` 词条更新：列出 V4 全部 18 个子类
- `Schema.TaggedError` 词条不变
- `SandboxViolation` 词条删除（per ADR 0003）

V4 新增：

- `Pi Error Classifier`（`PiError.classify()` 归一化分类）
- `Pi Error to AppError Mapper`（IPC 边界错误映射层）

## Considered

#### 选 1（已选）：全量映射为独立子类
每个 pi 错误类型独立映射，renderer 端可针对性 UI 处理（不同错误不同 toast / 不同 retry 策略）。

#### 选 2：保留 AppError + pi 错误映射为 Unknown
简单，但 renderer 端无法针对性处理不同错误类型。**不选**。

#### 选 3：删除 AppError 体系，全走 pi 错误
renderer 端需重新适配 pi 错误类型，UI 代码改动巨大。**不选**。

## Consequences

### Positive

- **Renderer UI 可针对性处理**：每个错误类型对应不同 UI 行为（toast 文案、retry 按钮、escalation 策略）
- **AppError 作为稳定边界**：renderer 代码不变依赖 pi 错误类型（即使 pi 升级错误类型变化，AppError 映射层吸收）
- **错误分类清晰**：main 端日志 + renderer 端 UI 都按 18 个子类分别处理

### Negative

- **AppError 子类膨胀到 18 个**：每个子类都是 schema 定义 + test fixture + UI 处理
- **错误映射层是新代码**：`error-mapper.ts` 必须正确处理所有 pi 错误类型 + 边界 case
- **pi 升级时新增错误类型需补映射**：每次 pi 版本升级时需检查新错误类型并补 AppError 子类映射
- **错误信息丢失风险**：映射过程中可能丢失原始错误的 stack trace / context（需 careful 序列化）

### Neutral

- **`Schema.TaggedError` 模式保留**：与 V3 决策一致
- **测试 fixture 数量翻倍**：18 个子类每个需要至少 1 个 test fixture

## Cross-file impact

| 路径 | 变化 |
|---|---|
| `src/shared/lib/errors.ts` | 扩展：删除 `SandboxViolation`；新增 17 个 pi 错误映射子类；共 18 个 |
| `src/main/pi-runtime/error-mapper.ts` | **新建**：pi 错误 → AppError 映射函数 |
| `src/main/pi-runtime/error-mapper.test.ts` | **新建**：18 个映射分支的 test fixture |
| `src/main/ipc.ts` | 错误处理统一走 `error-mapper.ts` 后通过 IPC 发送 |
| `src/renderer/src/core/` | IPC 客户端用 `Schema.decodeUnknown(AppErrorSchema)` 解析错误 |
| `src/renderer/src/features/chat/` | 错误 UI 处理扩展：18 个子类对应不同行为 |
| `e2e/` | 测试 fixture 增加 pi 错误场景（provider 不可达 / auth 失败 / 等等） |
| `CONTEXT.md` 词汇表 | 更新 `AppError`；删除 `SandboxViolation`；新增 `Pi Error Classifier`、`Pi Error to AppError Mapper` |

## Reversibility

中等可逆：

- 恢复 SandboxViolation 子类需在 errors.ts 中加回
- 缩减 AppError 子类数（如移除 pi 错误映射）需修改错误映射层 + UI 处理

预计回滚耗时：1 周。

## References

- pi-coding-agent 错误类型（pi 源码）：ModelProviderError / ModelAuthError / ToolExecuteError / SessionNotFoundError / 等
- effect/Schema：`Schema.TaggedError<...>()("Tag", { field: Schema.X })`
- V3 ADR-0025 D4（AppError TaggedError 基类）：保留语义，扩展子类