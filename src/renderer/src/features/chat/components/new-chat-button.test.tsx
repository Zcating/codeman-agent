
import { render, cleanup, fireEvent } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewChatButton } from "@codeman-frontend/features/chat/components/new-chat-button";

afterEach(() => cleanup());

describe("NewChatButton", () => {
  it("renders the button with accessible label '新对话'", () => {
    const { container } = render(() => (
      <NewChatButton onClick={() => {}} />
    ));
    const btn = container.querySelector("[aria-label='新对话']");
    expect(btn).toBeTruthy();
  });

  it("calls onClick when button clicked", () => {
    const onClick = vi.fn();
    const { container } = render(() => (
      <NewChatButton onClick={onClick} />
    ));
    fireEvent.click(
      container.querySelector("[aria-label='新对话']") as HTMLElement,
    );
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('uses the shared Button component with token-based hover (no primary-600 jump)', () => {
    const { container } = render(() => <NewChatButton onClick={() => {}} />);
    const btn = container.querySelector("[aria-label='新对话']") as HTMLElement;
    expect(btn.dataset.slot).toBe('button');
    expect(btn.className).toContain('hover:bg-primary/80');
    expect(btn.className).not.toContain('hover:bg-primary-600');
  });
});
