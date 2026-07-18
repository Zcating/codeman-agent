//! WorkspaceActions — chat-domain group-header component for rename + delete.
//!
//! Used as the `renderGroupHeader` content in ChatSidebar's universal
//! CodemanSidebar. Renders the workspace label + two hover-revealed action
//! buttons (rename / delete).
//!
//! Per ADR-0030 D6: chat-domain features (workspace rename / delete) live in
//! chat/feature, NOT in the universal sidebar. This component is passed to
//! `CodemanSidebar`'s `renderGroupHeader` prop.

import { render, cleanup, fireEvent } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceActions } from "./workspace-actions";

afterEach(() => cleanup());

describe("WorkspaceActions", () => {
  it("renders workspace label visible", () => {
    const { container } = render(() => (
      <WorkspaceActions
        wsId="ws-1"
        label="My Project"
        onRename={() => {}}
        onDelete={() => {}}
      />
    ));
    expect(container.textContent).toContain("My Project");
  });

  it("renders rename + delete hover buttons with hover-reveal CSS", () => {
    const { container } = render(() => (
      <WorkspaceActions
        wsId="ws-1"
        label="My Project"
        onRename={() => {}}
        onDelete={() => {}}
      />
    ));
    const renameBtn = container.querySelector(
      "[aria-label='Rename My Project']",
    ) as HTMLElement;
    const deleteBtn = container.querySelector(
      "[aria-label='Delete My Project']",
    ) as HTMLElement;
    expect(renameBtn).toBeTruthy();
    expect(deleteBtn).toBeTruthy();
    // Hover-reveal pattern: opacity-0 + group-hover/row:opacity-100
    const wrapper = renameBtn.parentElement as HTMLElement;
    expect(wrapper.className).toContain("opacity-0");
    expect(wrapper.className).toContain("group-hover/row:opacity-100");
  });

  it("clicking rename button calls onRename(wsId, label)", () => {
    const onRename = vi.fn();
    const { container } = render(() => (
      <WorkspaceActions
        wsId="ws-42"
        label="Project 42"
        onRename={onRename}
        onDelete={() => {}}
      />
    ));
    fireEvent.click(
      container.querySelector(
        "[aria-label='Rename Project 42']",
      ) as HTMLElement,
    );
    expect(onRename).toHaveBeenCalledWith("ws-42", "Project 42");
  });

  it("clicking delete button calls onDelete(wsId, label)", () => {
    const onDelete = vi.fn();
    const { container } = render(() => (
      <WorkspaceActions
        wsId="ws-42"
        label="Project 42"
        onRename={() => {}}
        onDelete={onDelete}
      />
    ));
    fireEvent.click(
      container.querySelector(
        "[aria-label='Delete Project 42']",
      ) as HTMLElement,
    );
    expect(onDelete).toHaveBeenCalledWith("ws-42", "Project 42");
  });

  it("rename + delete click do not trigger parent accordion expand", () => {
    // Real-world test: WorkspaceActions is rendered INSIDE an Accordion trigger.
    // Clicking rename/delete must not bubble to the trigger's onClick.
    const { container } = render(() => (
      <div data-testid="parent" onClick={() => { throw new Error("should not bubble"); }}>
        <WorkspaceActions
          wsId="ws-1"
          label="WS"
          onRename={() => {}}
          onDelete={() => {}}
        />
      </div>
    ));
    // Click should not throw because WorkspaceActions calls e.stopPropagation
    fireEvent.click(
      container.querySelector(
        "[aria-label='Rename WS']",
      ) as HTMLElement,
    );
    fireEvent.click(
      container.querySelector(
        "[aria-label='Delete WS']",
      ) as HTMLElement,
    );
  });
});
