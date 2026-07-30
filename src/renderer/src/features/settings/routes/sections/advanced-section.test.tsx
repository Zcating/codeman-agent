

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@solidjs/testing-library";
import { AdvancedSection } from "@codeman-frontend/features/settings/routes/sections/advanced-section";
import { mockState } from "@codeman-frontend/__mocks__/ipc-mock";

vi.mock("@tanstack/solid-router", () => ({
  
}));

beforeEach(() => {
  mockState.calls = [];
  mockState.rejected = undefined;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdvancedSection — /settings/advanced", () => {
  it("renders 'Clear all history…' button (idle state)", () => {
    render(() => <AdvancedSection />);
    expect(screen.getByText(/Clear all history/i)).toBeInTheDocument();
  });

  it("clicking Clear shows confirm overlay with Yes / Cancel", async () => {
    render(() => <AdvancedSection />);
    const clearBtn = screen.getByText(/Clear all history/i);
    fireEvent.click(clearBtn);
    expect(
      screen.getByText(/Delete all conversations\? This cannot be undone\./i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Yes, delete all/i)).toBeInTheDocument();
  });

  it("clicking Cancel in confirm overlay returns to idle state", () => {
    render(() => <AdvancedSection />);
    
    fireEvent.click(screen.getByText(/Clear all history/i));
    expect(
      screen.getByText(/Delete all conversations\?/i),
    ).toBeInTheDocument();
    
    fireEvent.click(screen.getAllByText(/Cancel/i)[0]!);
    
    expect(screen.getByText(/Clear all history/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/Delete all conversations\?/i),
    ).not.toBeInTheDocument();
  });

  it("clicking 'Yes, delete all' triggers invoke('clearAllHistory')", async () => {
    render(() => <AdvancedSection />);
    fireEvent.click(screen.getByText(/Clear all history/i));
    fireEvent.click(screen.getByText(/Yes, delete all/i));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockState.calls).toContain("clearAllHistory");
  });
});