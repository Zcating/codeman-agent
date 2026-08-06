
import { createMemo, createSignal, Show, type JSX } from 'solid-js';
import { Minimize2, Loader2 } from 'lucide-solid';
import type { Message } from '@codeman-frontend/shared/lib/types';
import { Button } from '@codeman-frontend/shared/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@codeman-frontend/shared/components/ui/popover';

function formatTokensShort(n: number): string {
  if (!Number.isFinite(n)) { return '—'; }
  if (n >= 1_000_000) { return `${(n / 1_000_000).toFixed(1)}M`; }
  if (n >= 1_000) { return `${Math.round(n / 1_000)}K`; }
  return `${n}`;
}

/** 完整 token 数字（千分位），供详情 popover 展示。 */
function formatTokensFull(n: number): string {
  if (!Number.isFinite(n)) { return '—'; }
  return Math.round(n).toLocaleString('en-US');
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
  /** 传入 onCompact 后启用压缩交互：点击用量环 → 弹出详细用量与压缩按钮。 */
  compacting?: boolean;
  onCompact?: () => void;
}

export function ContextRing(props: ContextRingProps): JSX.Element {
  const [open, setOpen] = createSignal(false);

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

  // 进度条着色：>=90% 危险色，>=70% 警告色，其余主色
  const barClass = createMemo(() => {
    if (clampedPct() >= 90) { return 'bg-destructive'; }
    if (clampedPct() >= 70) { return 'bg-warning'; }
    return 'bg-primary';
  });

  const ringVisual = (
    <div
      class='flex items-center gap-2 select-none'
      data-testid='context-ring'
      data-context-pct={pct()}
      role='status'
      aria-label={`context usage ${pct()}%`}
      title={tipText()}
    >
      <div class='text-right leading-tight'>
        <div class='text-sm font-semibold tabular-nums'>{pct()}%</div>
        <div class='text-[0.65rem] text-muted-foreground tabular-nums'>
          {formatTokensShort(props.usedTokens)}/{formatTokensShort(props.totalTokens)}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${CTX_RING_BOX} ${CTX_RING_BOX}`}
        width={CTX_RING_BOX}
        height={CTX_RING_BOX}
        class='-rotate-90'
        aria-hidden='true'
      >
        <circle
          cx={cx}
          cy={cy}
          r={CTX_RING_ARC_R}
          fill='none'
          class='stroke-muted'
          stroke-width={CTX_RING_STROKE}
        />
        <circle
          cx={cx}
          cy={cy}
          r={CTX_RING_ARC_R}
          fill='none'
          class='stroke-primary transition-[stroke-dashoffset] duration-300 ease-out'
          stroke-width={CTX_RING_STROKE}
          stroke-linecap='round'
          stroke-dasharray={`${circumference}`}
          stroke-dashoffset={dashoffset()}
        />
      </svg>
    </div>
  );

  // 纯展示模式：调用方未提供压缩回调时保持原有行为
  if (!props.onCompact) {
    return ringVisual;
  }

  return (
    <Popover
      open={open()}
      onOpenChange={(details) => setOpen(details.open)}
      positioning={{
        placement: 'top-end',
        offset: { mainAxis: 8 },
      }}
      autoFocus={false}
      restoreFocus={false}
    >
      <PopoverTrigger
        class='cursor-pointer rounded-md p-1 -m-1 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring'
        aria-label='查看上下文用量与压缩'
        data-testid='usage-ring-trigger'
      >
        {ringVisual}
      </PopoverTrigger>
      <Show when={open()}>
        <PopoverContent
          class='w-64 rounded-lg border border-border bg-popover p-3 shadow-lg'
          data-testid='usage-ring-popover'
        >
          <div class='space-y-2.5'>
            <div class='flex items-baseline justify-between'>
              <span class='text-xs font-medium text-muted-foreground'>上下文用量</span>
              <span class='text-sm font-semibold tabular-nums'>{pct()}%</span>
            </div>
            <div class='h-1.5 w-full overflow-hidden rounded-full bg-muted'>
              <div
                class={`h-full rounded-full transition-[width] duration-300 ease-out ${barClass()}`}
                style={{ width: `${clampedPct()}%` }}
              />
            </div>
            <div class='flex justify-between text-xs text-muted-foreground tabular-nums'>
              <span>已用 {formatTokensFull(props.usedTokens)}</span>
              <span>共 {formatTokensFull(props.totalTokens)} tokens</span>
            </div>
            <Show
              when={!props.compacting}
              fallback={
                <Button
                  type='button'
                  variant='secondary'
                  class='w-full'
                  disabled
                  aria-label='压缩中'
                  data-testid='compaction-spinner'
                >
                  <Loader2 class='h-4 w-4 animate-spin' />
                  压缩中…
                </Button>
              }
            >
              <Button
                type='button'
                variant='secondary'
                class='w-full'
                onClick={props.onCompact}
                aria-label='立即压缩上下文'
                data-testid='compact-now-button'
              >
                <Minimize2 class='h-4 w-4' />
                立即压缩
              </Button>
            </Show>
          </div>
        </PopoverContent>
      </Show>
    </Popover>
  );
}
