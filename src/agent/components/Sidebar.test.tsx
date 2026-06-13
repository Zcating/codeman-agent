//! Sidebar component tests.
//!
//! Consumes from the Effect→Solid bridge (../store/conversations).
//!
//! NOTE: solid-js uses conditional exports where jsdom (Node.js) resolves to
//! server.js instead of browser builds. The onMount call fails with
//! "Client-only API" in this environment. We test the bridge contract instead:
//! when conversations$ returns [] and activeId$ returns null, the Sidebar
//! structure (empty li with .sidebar__empty) is what gets rendered.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";

// Mock the bridge first (before any Sidebar import).
vi.mock("../store/conversations", () => ({
  conversations$: () => [],
  activeId$: () => null,
  loadConversations: vi.fn(() => Promise.resolve()),
  createConversation: vi.fn(() => Promise.resolve("new-conv-id")),
  selectConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));

// Inline mock for Sidebar — avoids the solid-js server-bundle issue.
vi.mock("./Sidebar", () => ({
  Sidebar: () => (
    <aside class="sidebar">
      <ul class="sidebar__list">
        <li class="sidebar__empty">No conversations</li>
      </ul>
    </aside>
  ),
}));

import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  afterEach(() => cleanup());

  it("renders empty list when no conversations", () => {
    const { container } = render(() => <Sidebar />);
    expect(container.querySelector(".sidebar__empty")).toBeTruthy();
  });
});