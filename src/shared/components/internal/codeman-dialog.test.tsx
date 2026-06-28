//! codeman-dialog.test.tsx — API semantics tests for imperative dialog API (RED phase)
import type { Component, JSX } from "solid-js";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CodemanDialogProvider, useCodemanDialog } from "./codeman-dialog";

// Test wrapper that provides the dialog context
const DialogTestWrapper: Component<{
  children?: JSX.Element;
}> = (props) => {
  return (
    <CodemanDialogProvider>
      {props.children}
    </CodemanDialogProvider>
  );
};

describe("CodemanDialog", () => {
  describe("alert()", () => {
    it("alert(): renders title + content + confirm button; resolves when confirm clicked", async () => {
      const user = userEvent.setup();
      let resolved = false;

      const TestComponent = () => {
        const dialog = useCodemanDialog();

        const handleAlert = async () => {
          await dialog.alert({ title: "Alert Title", content: "Alert Content", confirmText: "OK" });
          resolved = true;
        };

        return <button data-testid="trigger" onClick={handleAlert}>Show Alert</button>;
      };

      render(() => (
        <DialogTestWrapper>
          <TestComponent />
        </DialogTestWrapper>
      ));

      // Click trigger to show alert
      await user.click(screen.getByTestId("trigger"));

      // Alert dialog should be visible
      expect(screen.getByText("Alert Title")).toBeInTheDocument();
      expect(screen.getByText("Alert Content")).toBeInTheDocument();
      expect(screen.getByText("OK")).toBeInTheDocument();

      // Click confirm
      await user.click(screen.getByText("OK"));

      // Should resolve
      await waitFor(() => {
        expect(resolved).toBe(true);
      });
    });
  });

  describe("confirm()", () => {
    it("confirm(): renders confirm + cancel; clicking confirm resolves true", async () => {
      const user = userEvent.setup();
      let result: boolean | null = null;

      const TestComponent = () => {
        const dialog = useCodemanDialog();

        const handleConfirm = async () => {
          result = await dialog.confirm({
            title: "Confirm Title",
            content: "Confirm Content",
            confirmText: "Yes",
            cancelText: "No",
          });
        };

        return <button data-testid="trigger" onClick={handleConfirm}>Show Confirm</button>;
      };

      render(() => (
        <DialogTestWrapper>
          <TestComponent />
        </DialogTestWrapper>
      ));

      // Click trigger to show confirm
      await user.click(screen.getByTestId("trigger"));

      // Confirm dialog should be visible
      expect(screen.getByText("Confirm Title")).toBeInTheDocument();
      expect(screen.getByText("Confirm Content")).toBeInTheDocument();
      expect(screen.getByText("Yes")).toBeInTheDocument();
      expect(screen.getByText("No")).toBeInTheDocument();

      // Click confirm
      await user.click(screen.getByText("Yes"));

      // Should resolve to true
      await waitFor(() => {
        expect(result).toBe(true);
      });
    });

    it("confirm(): clicking cancel resolves false", async () => {
      const user = userEvent.setup();
      let result: boolean | null = null;

      const TestComponent = () => {
        const dialog = useCodemanDialog();

        const handleConfirm = async () => {
          result = await dialog.confirm({
            title: "Confirm Title",
            content: "Confirm Content",
            confirmText: "Yes",
            cancelText: "No",
          });
        };

        return <button data-testid="trigger" onClick={handleConfirm}>Show Confirm</button>;
      };

      render(() => (
        <DialogTestWrapper>
          <TestComponent />
        </DialogTestWrapper>
      ));

      // Click trigger to show confirm
      await user.click(screen.getByTestId("trigger"));

      // Click cancel
      await user.click(screen.getByText("No"));

      // Should resolve to false
      await waitFor(() => {
        expect(result).toBe(false);
      });
    });
  });

  describe("show<T>()", () => {
    it("show<T>(render): resolve callback resolves the returned Promise<T>", async () => {
      const user = userEvent.setup();
      let resolvedValue: string | null = null;

      const TestComponent = () => {
        const dialog = useCodemanDialog();

        const handleShow = async () => {
          const value = await dialog.show<string>((resolve) => (
            <div data-testid="custom-dialog">
              <p>Custom Dialog Content</p>
              <button data-testid="resolve-btn" onClick={() => resolve("resolved-value")}>Resolve</button>
            </div>
          ));
          resolvedValue = value;
        };

        return <button data-testid="trigger" onClick={handleShow}>Show Custom</button>;
      };

      render(() => (
        <DialogTestWrapper>
          <TestComponent />
        </DialogTestWrapper>
      ));

      // Click trigger to show custom dialog
      await user.click(screen.getByTestId("trigger"));

      // Custom dialog should be visible
      expect(screen.getByTestId("custom-dialog")).toBeInTheDocument();
      expect(screen.getByText("Custom Dialog Content")).toBeInTheDocument();

      // Click resolve button
      await user.click(screen.getByTestId("resolve-btn"));

      // Should resolve with the value
      await waitFor(() => {
        expect(resolvedValue).toBe("resolved-value");
      });
    });
  });
});
