//! DeepSeek-style balance display. Big amount + auto-recharge + updated.

import { autoRechargeLabel, formatCurrency } from "../lib/format";
import type { Balance } from "../lib/types";

interface Props {
  snapshot: Balance;
}

export function BalanceView(props: Props) {
  return (
    <div class="balance-view">
      <div class="amount">{formatCurrency(props.snapshot.amount, props.snapshot.currency)}</div>
      <div class="meta">
        <span class="meta-row">{autoRechargeLabel(props.snapshot.auto_recharge)}</span>
      </div>
    </div>
  );
}
