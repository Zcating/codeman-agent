import { createMemo, createSignal, type JSX } from "solid-js";
import { Zap, Hand } from "lucide-solid";
import type { CompactionEntry } from "@codeman-frontend/features/chat/lib/compaction/types";

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return `${diffSec} second${diffSec === 1 ? "" : "s"} ago`;
  }
  if (diffMin < 60) {
    return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  }
  if (diffHour < 24) {
    return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;
  }
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

function formatTokens(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return n.toString();
}

export function CompactionMarker(props: { entry: CompactionEntry }): JSX.Element {
  const entry = () => props.entry;
  const [isOpen, setIsOpen] = createSignal(false);

  const previewText = createMemo(() => {
    const summary = entry().summary;
    return summary.length > 80 ? summary.slice(0, 80) + "…" : summary;
  });

  return (
    <details
      data-testid="compaction-marker"
      class="my-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-muted-foreground"
      role="separator"
      aria-label="上下文已压缩"
    >
      <summary
        class="flex cursor-pointer list-none items-center gap-1.5 font-medium text-foreground"
        data-testid="compaction-summary-trigger"
        aria-expanded={isOpen()}
        onClick={() => setIsOpen((v) => !v)}
      >
        <span class="flex items-center gap-1">
          {entry().kind === "auto"
            ? <Zap class="size-3 text-warning" aria-hidden="true" />
            : <Hand class="size-3 text-warning" aria-hidden="true" />}
          <span
            class="sr-only"
            data-testid={`compaction-kind-${entry().kind}`}
          >
            {entry().kind === "auto" ? "自动" : "手动"}压缩
          </span>
        </span>
        <span class="flex-1 truncate" data-testid="compaction-preview">{previewText()}</span>
      </summary>

      <div class="mt-2 flex flex-col gap-1 text-muted-foreground">
        <p class="whitespace-pre-wrap">{entry().summary}</p>
        <p class="text-[0.75rem]">
          <span class="font-medium text-foreground">{entry().model}</span>
          {" · "}
          {formatTokens(entry().tokensBefore)} tokens
          {" · "}
          {formatRelativeTime(entry().createdAt)}
        </p>
      </div>
    </details>
  );
}
