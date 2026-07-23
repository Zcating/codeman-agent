//! workspace-rename-dialog.test.tsx — showRenameDialog tests
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@solidjs/testing-library";
import { showRenameDialog } from "./workspace-rename-dialog";

// ─── Mock Dialog.show ────────────────────────────────────────────────────────

const mockShow = vi.hoisted(() => vi.fn());

vi.mock("../../../shared/components/internal/codeman-dialog", () => ({
  Dialog: {
    show: mockShow,
  },
}));

describe("showRenameDialog", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("calls Dialog.show with a render function", () => {
    mockShow.mockReturnValue(Promise.resolve("New Name"));

    showRenameDialog("My Project");

    expect(mockShow).toHaveBeenCalledTimes(1);
    expect(mockShow.mock.calls[0][0]).toBeInstanceOf(Function);
  });

  it("returns the value from Dialog.show", async () => {
    mockShow.mockReturnValue(Promise.resolve("New Name"));

    const result = await showRenameDialog("My Project");

    expect(result).toBe("New Name");
  });

  it("returns null when Dialog.show resolves to null", async () => {
    mockShow.mockReturnValue(Promise.resolve(null));

    const result = await showRenameDialog("My Project");

    expect(result).toBeNull();
  });

  describe("form rendering", () => {
    it("renders input with initial label", () => {
      let capturedRender:
        | ((resolve: (v: string | null) => void) => unknown)
        | null = null;
      mockShow.mockImplementation(
        (fn: (resolve: (v: string | null) => void) => unknown) => {
          capturedRender = fn;
          return Promise.resolve("result");
        },
      );

      const resolve = vi.fn();
      showRenameDialog("My Project");

      const { getByTestId } = render(() => capturedRender!(resolve) as unknown as Element);

      const input = getByTestId("rename-input") as HTMLInputElement;
      expect(input.value).toBe("My Project");
    });

    it("Cancel calls resolve(null)", () => {
      let capturedRender:
        | ((resolve: (v: string | null) => void) => unknown)
        | null = null;
      mockShow.mockImplementation(
        (fn: (resolve: (v: string | null) => void) => unknown) => {
          capturedRender = fn;
          return Promise.resolve("result");
        },
      );

      const resolve = vi.fn();
      showRenameDialog("My Project");

      const { getByText } = render(() => capturedRender!(resolve) as unknown as Element);

      fireEvent.click(getByText("Cancel"));
      expect(resolve).toHaveBeenCalledWith(null);
    });

    it("Rename calls resolve with label", () => {
      let capturedRender:
        | ((resolve: (v: string | null) => void) => unknown)
        | null = null;
      mockShow.mockImplementation(
        (fn: (resolve: (v: string | null) => void) => unknown) => {
          capturedRender = fn;
          return Promise.resolve("result");
        },
      );

      const resolve = vi.fn();
      showRenameDialog("My Project");

      const { getByTestId } = render(() => capturedRender!(resolve) as unknown as Element);

      fireEvent.click(getByTestId("rename-submit"));
      expect(resolve).toHaveBeenCalledWith("My Project");
    });

    it("Rename calls resolve with updated label after input change", () => {
      let capturedRender:
        | ((resolve: (v: string | null) => void) => unknown)
        | null = null;
      mockShow.mockImplementation(
        (fn: (resolve: (v: string | null) => void) => unknown) => {
          capturedRender = fn;
          return Promise.resolve("result");
        },
      );

      const resolve = vi.fn();
      showRenameDialog("My Project");

      const { getByTestId } = render(() => capturedRender!(resolve) as unknown as Element);

      const input = getByTestId("rename-input") as HTMLInputElement;
      fireEvent.input(input, { target: { value: "New Name" } });
      fireEvent.click(getByTestId("rename-submit"));
      expect(resolve).toHaveBeenCalledWith("New Name");
    });
  });
});
