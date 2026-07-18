//! NewChatButton — used as `sidebarHeader` slot in ChatSidebar.
//! Click navigates to "/" (back to home for new conversation creation).

import { render, cleanup, fireEvent } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewChatButton } from "./new-chat-button";

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
});
