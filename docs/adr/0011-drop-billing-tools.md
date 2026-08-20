# ADR 0011 — Drop Billing Tools (Documented Reality Correction)

**Status**: accepted · **Date**: 2026-08-20 · **Scope**: codeman-agent V4 词汇表 + 文档清理（事实修正）
**Related**: ADR 0001 (V4 总纲 D14)

## Context

V3 PRODUCT.md 与 V3 CONTEXT.md 都把"内置 2 个计费工具（`get_balance` / `get_plan_quota`，覆盖 DeepSeek 与 MiniMax）"写为产品唯一交付。

但实际 V3 仓库的 renderer 代码（`src/renderer/src/`）**完全无任何计费工具代码**：

- grep `get_balance` / `get_plan_quota` / `balance` / `PlanQuota` / `Snapshot`：renderer 侧**0 命中**
- grep `billing`：main 端 settings schema 残留（`Provider.billing` 字段定义），无任何功能代码

**计费工具在 V3 演进过程中已经被砍掉**，但文档（PRODUCT.md / V3 CONTEXT.md）未同步删除。

V4 启动时正式确认这一事实，**删除文档中所有计费工具相关词条**与 main 端 settings schema 残留。

## Decision

### D1. 删 PRODUCT.md 计费工具描述

PRODUCT.md 当前文字：

> "内置 2 个计费工具（`get_balance`、`get_plan_quota`，覆盖 DeepSeek 与 MiniMax）"

改为：

> （V4 起删除。产品定位从"快提词 + 看计费"转向"编码 agent"，计费工具不再属于本产品范围。）

### D2. 删 V4 CONTEXT.md 计费工具词条

V4 CONTEXT.md **不包含**以下词条（V3 词汇表清理）：

- `Balance (余额)`
- `Plan Quota (用量)`
- `Snapshot (快照)`
- `Provider.billing (计费能力)`
- `Adapter (适配器)`
- `Stale (过期)`（与 Snapshot 配对）
- `billing` 相关 schema 定义

### D3. 删 main 端 settings schema 残留

- **删除 src/main/features/settings/schemas.ts** 中的 `ProviderBillingStruct`（含 `kind: "balance" | "plan_quota"` 判别）
- **删除 src/main/features/settings/defaults.ts** 中的 `billing: { kind: "plan_quota" }` 默认值
- **删除 src/main/features/settings/settings-schema.test.ts** 中 billing 相关测试 fixture
- **删除 src/shared/lib/types.ts** 中 `Provider.billing?: ProviderBilling` 字段
- **V4 `Provider` schema 简化**：仅保留 `id / label / comment? / apiKey / llm`，无 `billing` 子对象

### D4. 验证

V4 启动后执行：

```bash
grep -rn "billing\|get_balance\|get_plan_quota\|PlanQuota\|Snapshot" src/
```

预期：0 命中（renderer 与 main 端全部清理）。

### D5. 不重新引入

V4 启动后**禁止**重新引入计费工具。

- pi-coding-agent 无内置计费能力，V4 自建扩展点为 `defineTool()` —— 但产品决策是 V4 不做计费
- 若未来有计费需求，需开新 ADR 评估（且需明确：是否影响 V4 "编码 agent" 定位）

## Consequences

### Positive

- **产品文档与代码一致**：V4 启动时 PRODUCT.md / CONTEXT.md / settings schema 全部对齐
- **Schema 简化**：`Provider` schema 不再有 `billing?` 子对象
- **代码量减少**：main 端 settings schema 残留代码删除

### Negative

- **V3 老用户文档预期落空**：若用户基于旧文档期待"计费工具"，会发现 V4 不再有该能力——但实际 V3 早已删除，影响有限

### Neutral

- **V3 git log 保留**：删除的代码仍在 git 历史中，可追溯

## Cross-file impact

| 路径 | 变化 |
|---|---|
| `PRODUCT.md` | 删除计费工具相关描述 |
| `src/main/features/settings/schemas.ts` | 删除 `ProviderBillingStruct`；`Provider` schema 简化 |
| `src/main/features/settings/defaults.ts` | 删除 `billing: { kind: "plan_quota" }` |
| `src/main/features/settings/settings-schema.test.ts` | 删除 billing 相关 test fixture |
| `src/shared/lib/types.ts` | `Provider` schema 删 `billing?` 字段 |
| `CONTEXT.md` | 词汇表删除 `Balance / Plan Quota / Snapshot / Provider.billing / Adapter / Stale` |

## Reversibility

完全可逆（仅文档与 schema 变更）：

- 回滚 = 恢复 `ProviderBillingStruct` + billing 默认值 + 字段
- 但 V4 不应回滚（产品决策），仅作 git revert 应急用

预计回滚耗时：1 小时。

## References

- V3 PRODUCT.md / V3 CONTEXT.md 计费工具描述：已过时
- V3 main 端 settings schema 残留：`ProviderBillingStruct`（per git log）
- V4 ADR 0001 D14（drop billing tools 决议）