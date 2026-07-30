


export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) {
    return "—";
  }
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) {
    return `${(n / 1_000_000_000).toFixed(1)}B`;
  }
  if (abs >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${(n / 1_000).toFixed(1)}k`;
  }
  if (Number.isInteger(n)) {
    return n.toString();
  }
  return n.toFixed(2);
}

export function formatWithCommas(n: number): string {
  if (!Number.isFinite(n)) {
    return "—";
  }
  return n.toLocaleString();
}
