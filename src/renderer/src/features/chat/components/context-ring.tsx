// 几何参数:
//   - 外径 = 20px
//   - stroke 宽度 = 2px
//   - 圆环与发送按钮的距离 = 16px (`CTX_RING_SEND_GAP_PX`)
//
// 形态:
//   - 环左侧双行 label:粗体百分比 / 灰色紧凑 token 数(已用 / 总额)
//
// Token 计算(`computeUsedTokensEst`):fallback 路径,粗估字符/4。
// 优先路径是 chat-view 的 ringInfo memo 用 `inputTokens` (LLM 真实回报)。

import { createMemo, type JSX } from "solid-js";
import type { Message } from "@codeman-frontend/shared/lib/types";

/**
 * 紧凑 token 计数格式(per ring 设计意图):`200K` / `1.5M` / `12K`。
 * 故意不复用 `shared/lib/units.ts::compactNumber` —— 那个会强制保留一位小数
 * (`200.0k`),在环的紧凑双行 label 里太难看。
 */
function formatTokensShort(n: number): string {
  if (!Number.isFinite(n)) {return "—";}
  if (n >= 1_000_000) {return `${(n / 1_000_000).toFixed(1)}M`;}
  if (n >= 1_000) {return `${Math.round(n / 1_000)}K`;}
  return `${n}`;
}

/** 圆环与发送按钮之间的距离(px)。chat-view 用这个常量 wrap cluster。 */
export const CTX_RING_SEND_GAP_PX = 16;

const CTX_RING_DIAMETER = 20;
const CTX_RING_STROKE = 2;
const CTX_RING_BOX = CTX_RING_DIAMETER + CTX_RING_STROKE; // 22 (含 stroke 边距)
const CTX_RING_ARC_R = (CTX_RING_DIAMETER - CTX_RING_STROKE) / 2; // 9 (stroke 中心线位置)

/**
 * 用消息列表粗估已用 token 数。**仅**在 LLM API 没返回 `inputTokens`
 * 时使用(典型场景:对话刚开始,assistant 还没产出第一条回复,或者
 * provider 不报 inputTokens)。
 *
 * 计算:每字符 ≈ 0.25 token(English-leaning);混合中文会高估,
 * 但这是"快满了"的指示器,不需要精确。
 */
export function computeUsedTokensEst(msgs: readonly Message[]): number {
  let chars = 0;
  for (const m of msgs) {
    chars += m.content.length;
    if (m.thinking) {
      chars += m.thinking.length;
    }
    if (m.toolCalls) {
      for (const tc of m.toolCalls) {
        chars += tc.name.length;
        chars += JSON.stringify(tc.args).length;
      }
    }
    if (m.toolResults) {
      for (const tr of m.toolResults) {
        chars += JSON.stringify(tr.result).length;
      }
    }
  }
  return Math.ceil(chars / 4);
}

/** ContextRing props — 数据驱动,无状态。空态由调用方用 `<Show>` 控制。 */
export interface ContextRingProps {
  /** 当前已用百分比(0..∞,会被 clamp 到 [0,100])。 */
  percentage: number;
  /** 已用 token 数(显示用 + tooltip 用)。 */
  usedTokens: number;
  /** Context window 总额(显示用 + tooltip 用)。 */
  totalTokens: number;
}

export function ContextRing(props: ContextRingProps): JSX.Element {
  // 几何常量(基于模块常量,不依赖 props — 用 const 即可)。
  const cx = CTX_RING_BOX / 2;
  const cy = CTX_RING_BOX / 2;
  const circumference = 2 * Math.PI * CTX_RING_ARC_R;

  // 派生值用 createMemo — 同级别的 prop getter,如果用 const 一次性计算
  // 就会和早返回一样卡死(组件函数只运行一次,后续 prop 变化不会重渲染)。
  const clampedPct = createMemo(() => Math.min(100, Math.max(0, props.percentage)));
  const pct = createMemo(() => Math.round(clampedPct()));
  const dashoffset = createMemo(() => circumference * (1 - clampedPct() / 100));
  const tipText = createMemo(
    () =>
      `${pct()}% · ${formatTokensShort(props.usedTokens)} / ${formatTokensShort(props.totalTokens)} tokens`,
  );

  return (
    <div
      class="flex items-center gap-2 select-none"
      data-testid="context-ring"
      data-context-pct={pct()}
      role="status"
      aria-label={`context usage ${pct()}%`}
      title={tipText()}
    >
      <div class="text-right leading-tight">
        <div class="text-sm font-semibold tabular-nums">{pct()}%</div>
        <div class="text-[0.65rem] text-muted-foreground tabular-nums">
          {formatTokensShort(props.usedTokens)}/{formatTokensShort(props.totalTokens)}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${CTX_RING_BOX} ${CTX_RING_BOX}`}
        width={CTX_RING_BOX}
        height={CTX_RING_BOX}
        class="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={cx}
          cy={cy}
          r={CTX_RING_ARC_R}
          fill="none"
          class="stroke-muted"
          stroke-width={CTX_RING_STROKE}
        />
        <circle
          cx={cx}
          cy={cy}
          r={CTX_RING_ARC_R}
          fill="none"
          class="stroke-primary transition-[stroke-dashoffset] duration-300 ease-out"
          stroke-width={CTX_RING_STROKE}
          stroke-linecap="round"
          stroke-dasharray={`${circumference}`}
          stroke-dashoffset={dashoffset()}
        />
      </svg>
    </div>
  );
}