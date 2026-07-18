//! ConvDeleteAction — chat-domain leaf component for inline delete confirm.
//!
//! Renders:
//! - Streaming badge (Loader2) when `isStreaming=true`
//! - Trash icon button (hover-revealed via `group-hover/row:opacity-100`)
//! - On click: inline overlay with "删除" / "取消" buttons
//!
//! Used as the leaf content rendered by ChatSidebar's `renderItem`. Lives in
//! chat feature (not shared/) because delete-confirm is chat-domain UX per
//! ADR-0030 D6 ("business logic moves out of universal sidebar").

import { render, cleanup, fireEvent } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConvDeleteAction } from "./conv-delete-action";

afterEach(() => cleanup());

describe("ConvDeleteAction", () => {
  it("renders streaming badge when isStreaming=true", () => {
    const { container } = render(() => (
      <ConvDeleteAction
        convId="conv-1"
        label="Chat 1"
        isStreaming={true}
        onDelete={() => {}}
      />
    ));
    const spinner = container.querySelector("[aria-label='streaming']");
    expect(spinner).toBeTruthy();
  });

  it("does NOT render streaming badge when isStreaming=false (default)", () => {
    const { container } = render(() => (
      <ConvDeleteAction
        convId="conv-1"
        label="Chat 1"
        onDelete={() => {}}
      />
    ));
    const spinner = container.querySelector("[aria-label='streaming']");
    expect(spinner).toBeNull();
  });

  it("renders Trash icon button (hover-reveal pattern)", () => {
    const { container } = render(() => (
      <ConvDeleteAction
        convId="conv-1"
        label="Chat 1"
        onDelete={() => {}}
      />
    ));
    const trashBtn = container.querySelector(
      "[aria-label='Delete conversation']",
    );
    expect(trashBtn).toBeTruthy();
    // Hover-reveal: default opacity-0
    expect((trashBtn as HTMLElement).className).toContain("opacity-0");
    expect((trashBtn as HTMLElement).className).toContain(
      "group-hover/row:opacity-100",
    );
  });

  it("clicking Trash shows inline confirm overlay with 确认 / 取消", () => {
    const { container } = render(() => (
      <ConvDeleteAction
        convId="conv-1"
        label="Chat 1"
        onDelete={() => {}}
      />
    ));
    const trashBtn = container.querySelector(
      "[aria-label='Delete conversation']",
    ) as HTMLElement;
    fireEvent.click(trashBtn);
    // Confirm overlay appears
    const confirmBtn = container.querySelector("[aria-label='确认删除']");
    const cancelBtn = container.querySelector("[aria-label='取消删除']");
    expect(confirmBtn).toBeTruthy();
    expect(cancelBtn).toBeTruthy();
    // Trash icon is hidden in confirm state (replaced by overlay)
    expect(container.querySelector("[aria-label='Delete conversation']"))
      .toBeNull();
  });

  it("clicking 确认 calls onDelete with convId", () => {
    const onDelete = vi.fn();
    const { container } = render(() => (
      <ConvDeleteAction
        convId="conv-42"
        label="Chat 42"
        onDelete={onDelete}
      />
    ));
    fireEvent.click(
      container.querySelector(
        "[aria-label='Delete conversation']",
      ) as HTMLElement,
    );
    fireEvent.click(container.querySelector("[aria-label='确认删除']") as HTMLElement);
    expect(onDelete).toHaveBeenCalledWith("conv-42");
  });

  it("clicking 取消 hides overlay without calling onDelete", () => {
    const onDelete = vi.fn();
    const { container } = render(() => (
      <ConvDeleteAction
        convId="conv-1"
        label="Chat 1"
        onDelete={onDelete}
      />
    ));
    fireEvent.click(
      container.querySelector(
        "[aria-label='Delete conversation']",
      ) as HTMLElement,
    );
    fireEvent.click(container.querySelector("[aria-label='取消删除']") as HTMLElement);
    // Overlay gone, trash icon back
    expect(container.querySelector("[aria-label='确认删除']")).toBeNull();
    expect(
      container.querySelector("[aria-label='Delete conversation']"),
    ).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
