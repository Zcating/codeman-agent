//! Display-side formatting. Pure functions; no I/O.

import type { Balance, PlanQuota, ProviderId, Snapshot } from "./types";

const CURRENCY_SYMBOL: Record<string, string> = {
  CNY: "¥",
  USD: "$",
  EUR: "€",
  JPY: "¥",
  GBP: "£",
};

export function formatCurrency(amount: string, currency: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) {
    return `${amount} ${currency}`;
  }
  const symbol = CURRENCY_SYMBOL[currency.toUpperCase()] ?? "";
  const body = n.toFixed(2);
  return `${symbol}${body}`;
}

export function formatTime(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit" });
}

export function formatPercent(remaining: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (remaining / total) * 100));
}

export function autoRechargeLabel(v: boolean | null | undefined): string {
  if (v === true) return "auto-recharge: on";
  if (v === false) return "auto-recharge: off";
  return "auto-recharge: —";
}

export function isStale(
  fetchedAt: string | null | undefined,
  staleAfterSecs: number,
  now: Date = new Date(),
): boolean {
  if (!fetchedAt) return true;
  const t = new Date(fetchedAt).getTime();
  if (Number.isNaN(t)) return true;
  return (now.getTime() - t) / 1000 > staleAfterSecs;
}

export function balanceOf(snap: Snapshot | null | undefined): Balance | null {
  return snap && snap.kind === "balance" ? snap : null;
}

export function planQuotaOf(snap: Snapshot | null | undefined): PlanQuota | null {
  return snap && snap.kind === "plan_quota" ? snap : null;
}

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  deepseek: "DeepSeek",
  minimax: "MiniMax",
};
