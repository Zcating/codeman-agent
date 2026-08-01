
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@solidjs/testing-library";
import { CompactionMarker } from "@codeman-frontend/features/chat/components/compaction-marker";
import type { CompactionEntry } from "@codeman-frontend/features/chat/lib/compaction/types";

function makeEntry(overrides: Partial<CompactionEntry> = {}): CompactionEntry {
  return {
    id: "cmp-1",
    conversationId: "conv-1",
    summary: "This is a sample summary of the compacted context. It contains multiple sentences to demonstrate the preview truncation behavior.",
    model: "MiniMax-M2.5-highspeed",
    tokensBefore: 45000,
    kind: "auto",
    createdAt: Date.now() - 120_000, // 2 minutes ago
    firstKeptMessageId: "msg-5",
    ...overrides,
  };
}

describe("CompactionMarker", () => {
  it("默认折叠状态: <details> 不展开,显示摘要前 80 字符预览", () => {
    const { container } = render(() => <CompactionMarker entry={makeEntry()} />);
    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details).toBeTruthy();
    expect(details.open).toBe(false);

    const marker = container.querySelector('[data-testid="compaction-marker"]');
    expect(marker).toBeTruthy();

    // Preview should be 80 chars + "…" via the preview span
    const preview = container.querySelector('[data-testid="compaction-preview"]');
    expect(preview).toBeTruthy();
    const previewText = preview!.textContent ?? "";
    expect(previewText.endsWith("…")).toBe(true);
    expect(previewText.length).toBe(81); // 80 + "…"
  });

  it("点击展开(<summary>) → 显示完整摘要文本 + 模型名 + 压缩前 token + 人类可读时间", async () => {
    const entry = makeEntry({
      summary: "Full summary text here.",
      model: "gpt-4o",
      tokensBefore: 1234,
      createdAt: Date.now() - 90_000,
    });
    const { container } = render(() => <CompactionMarker entry={entry} />);
    const details = container.querySelector("details") as HTMLDetailsElement;

    const summary = details.querySelector("summary") as HTMLElement;
    fireEvent.click(summary);

    expect(details.open).toBe(true);

    // Full summary should be visible
    const fullText = container.querySelector("p.whitespace-pre-wrap");
    expect(fullText?.textContent).toBe("Full summary text here.");

    // Model name
    expect(container.textContent).toContain("gpt-4o");

    // Tokens formatted
    expect(container.textContent).toContain("1.2k"); // 1234 formatted as 1.2k

    // Human-readable time
    expect(container.textContent).toContain("minute");
  });

  it("kind === auto 时显示 data-testid compaction-kind-auto", () => {
    const { container } = render(() => <CompactionMarker entry={makeEntry({ kind: "auto" })} />);
    const kindBadge = container.querySelector('[data-testid="compaction-kind-auto"]');
    expect(kindBadge).toBeTruthy();
  });

  it("kind === manual 时显示 data-testid compaction-kind-manual", () => {
    const { container } = render(() => <CompactionMarker entry={makeEntry({ kind: "manual" })} />);
    const kindBadge = container.querySelector('[data-testid="compaction-kind-manual"]');
    expect(kindBadge).toBeTruthy();
  });

  it("无障碍: role=separator + aria-expanded + aria-label", () => {
    const { container } = render(() => <CompactionMarker entry={makeEntry()} />);
    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details).toHaveAttribute("role", "separator");
    expect(details).toHaveAttribute("aria-label", "上下文已压缩");

    // aria-expanded on <summary>
    const summary = details.querySelector("summary") as HTMLElement;
    expect(summary).toHaveAttribute("aria-expanded", "false");

    // After click, aria-expanded should be true
    fireEvent.click(summary);
    expect(summary).toHaveAttribute("aria-expanded", "true");
  });

  it("token 数字格式化: 小于 1000 直接显示, 大于等于 1000 显示 X.Xk", () => {
    const { container: c1 } = render(() => <CompactionMarker entry={makeEntry({ tokensBefore: 999 })} />);
    expect(c1.textContent).toContain("999");

    const { container: c2 } = render(() => <CompactionMarker entry={makeEntry({ tokensBefore: 1000 })} />);
    expect(c2.textContent).toContain("1.0k");

    const { container: c3 } = render(() => <CompactionMarker entry={makeEntry({ tokensBefore: 45000 })} />);
    expect(c3.textContent).toContain("45.0k");
  });

  it("人类可读时间: 几秒前/几分钟前/几小时前/几天前", () => {
    const now = Date.now();

    const { container: c1 } = render(() => <CompactionMarker entry={makeEntry({ createdAt: now - 30_000 })} />);
    expect(c1.textContent).toContain("30 second");

    const { container: c2 } = render(() => <CompactionMarker entry={makeEntry({ createdAt: now - 90_000 })} />);
    expect(c2.textContent).toContain("minute");

    const { container: c3 } = render(() => <CompactionMarker entry={makeEntry({ createdAt: now - 3_600_000 })} />);
    expect(c3.textContent).toContain("hour");

    const { container: c4 } = render(() => <CompactionMarker entry={makeEntry({ createdAt: now - 86_400_000 })} />);
    expect(c4.textContent).toContain("day");
  });

  it("摘要不足 80 字符时不显示省略号", () => {
    const { container } = render(() => <CompactionMarker entry={makeEntry({ summary: "Short summary" })} />);
    const details = container.querySelector("details") as HTMLDetailsElement;
    const summaryText = details.querySelector("summary")?.textContent ?? "";
    expect(summaryText.trim()).not.toContain("…");
  });
});
