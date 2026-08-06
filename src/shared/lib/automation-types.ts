// ADR-0053 D1 — AutomationRule 类型定义(Minimal T0 foundation)
// 本文件为主端与渲染端共用,无 Effect 依赖

/**
 * Automation ID — UUID v7
 */
export type AutomationId = string;

/**
 * 调度计划三种形态:
 * - interval: 每 everyMs 毫秒执行
 * - daily: 每天在 hour:minute 执行
 * - weekly: 每周在 weekday(0=周日..6=周六) 的 hour:minute 执行
 */
export type AutomationSchedule =
  | { readonly kind: "interval"; readonly everyMs: number }
  | { readonly kind: "daily"; readonly hour: number; readonly minute: number }
  | {
      readonly kind: "weekly";
      readonly weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
      readonly hour: number;
      readonly minute: number;
    };

/**
 * 自动化动作两种形态:
 * - llm: LLM 推理动作(providerId+modelId 引用 Settings 中的 Provider)
 * - script: 脚本执行(language: shell|javascript, workspaceId 引用 Workspace)
 */
export type AutomationAction =
  | {
      readonly kind: "llm";
      readonly systemPrompt: string;
      readonly userPrompt: string;
      readonly providerId: string;
      readonly modelId: string;
      readonly timeoutMs: number; // default 300_000, range [30_000, 1_800_000]
    }
  | {
      readonly kind: "script";
      readonly language: "shell" | "javascript";
      readonly source: string;
      readonly workspaceId: string;
      readonly timeoutMs: number; // default 300_000, range [5_000, 1_800_000]
    };

/**
 * 自动化规则完整结构
 */
export interface AutomationRule {
  readonly id: AutomationId;
  readonly name: string;
  readonly enabled: boolean;
  readonly schedule: AutomationSchedule;
  readonly action: AutomationAction;
  readonly createdAt: number; // epoch ms
  readonly updatedAt: number; // epoch ms
}

/**
 * 触发类型
 */
export type TriggerKind = "scheduled" | "manual" | "missed-replay";
