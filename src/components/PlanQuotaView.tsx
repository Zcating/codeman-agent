//! MiniMax-style plan quota display. Compact remaining/total + bar.

import { formatDate, formatPercent } from "../lib/format";
import type { PlanQuota } from "../lib/types";
import { compactNumber } from "../lib/units";

interface Props {
  snapshot: PlanQuota;
}

export function PlanQuotaView(props: Props) {
  const pct = () => formatPercent(props.snapshot.remaining, props.snapshot.total);
  const showExpires = () => !!props.snapshot.expires_at;
  const showDaily = () =>
    props.snapshot.daily_avg !== undefined && props.snapshot.daily_avg !== null;

  return (
    <div class="quota-view">
      <div class="quota-row">
        <span class="quota-remaining">{compactNumber(props.snapshot.remaining)}</span>
        <span class="quota-sep">/</span>
        <span class="quota-total">{compactNumber(props.snapshot.total)}</span>
      </div>
      <div class="quota-bar" aria-label={`${pct().toFixed(0)} percent remaining`}>
        <div class="quota-bar-fill" style={{ width: `${pct()}%` }} />
      </div>
      <div class="quota-meta">
        {showExpires() && (
          <span class="meta-row">到期 {formatDate(props.snapshot.expires_at)}</span>
        )}
        {showDaily() && (
          <span class="meta-row">日均 {compactNumber(props.snapshot.daily_avg ?? 0)}</span>
        )}
      </div>
    </div>
  );
}
