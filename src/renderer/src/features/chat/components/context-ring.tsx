










import { createMemo, type JSX } from "solid-js";
import type { Message } from "@codeman-frontend/shared/lib/types";


function formatTokensShort(n: number): string {
  if (!Number.isFinite(n)) {return "—";}
  if (n >= 1_000_000) {return `${(n / 1_000_000).toFixed(1)}M`;}
  if (n >= 1_000) {return `${Math.round(n / 1_000)}K`;}
  return `${n}`;
}


export const CTX_RING_SEND_GAP_PX = 16;

const CTX_RING_DIAMETER = 20;
const CTX_RING_STROKE = 2;
const CTX_RING_BOX = CTX_RING_DIAMETER + CTX_RING_STROKE; 
const CTX_RING_ARC_R = (CTX_RING_DIAMETER - CTX_RING_STROKE) / 2; 


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


export interface ContextRingProps {
  
  percentage: number;
  
  usedTokens: number;
  
  totalTokens: number;
}

export function ContextRing(props: ContextRingProps): JSX.Element {
  
  const cx = CTX_RING_BOX / 2;
  const cy = CTX_RING_BOX / 2;
  const circumference = 2 * Math.PI * CTX_RING_ARC_R;

  
  
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