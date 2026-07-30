
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { cleanup } from "@solidjs/testing-library";
import { Dialog } from "@codeman-frontend/shared/components/internal/codeman-dialog";

describe("Dialog", () => {
  beforeEach(() => {
    if (!document.getElementById("root")) {
      const root = document.createElement("div");
      root.id = "root";
      document.body.appendChild(root);
    }
  });

  afterEach(() => {
    cleanup();
    const root = document.getElementById("root");
    if (root && root.parentElement) {
      const toRemove = Array.from(root.parentElement.children).filter(
        (c) => c.id !== "root",
      );
      toRemove.forEach((c) => c.remove());
    }
  });

  describe("API contract", () => {
    it("alert(): returns a Promise", () => {
      const result = Dialog.alert({ title: "Test", content: "Content" });
      expect(result).toBeInstanceOf(Promise);
    });

    it("confirm(): returns a Promise<boolean>", () => {
      const result = Dialog.confirm({ title: "Test", content: "Content" });
      expect(result).toBeInstanceOf(Promise);
    });

    it("show<T>(): returns a Promise<T>", () => {
      const result = Dialog.show((_resolve) => <div>Test</div>);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe("confirm DOM rendering", () => {
    it("renders confirm and cancel buttons with correct text", () => {
      Dialog.confirm({
        title: "Delete?",
        content: "Are you sure?",
        confirmText: "确认删除",
        cancelText: "取消",
        destructive: true,
      });

      const confirmBtn = document.querySelector(
        '[data-testid="confirm-btn"]',
      ) as HTMLElement;
      expect(confirmBtn).toBeTruthy();
      expect(confirmBtn.textContent).toBe("确认删除");

      const cancelBtn = document.querySelector(
        '[data-testid="cancel-btn"]',
      ) as HTMLElement;
      expect(cancelBtn).toBeTruthy();
      expect(cancelBtn.textContent).toBe("取消");
    });
  });

  describe("show DOM rendering", () => {
    it("renders custom content inside dialog", () => {
      Dialog.show((_resolve) => (
        <div>
          <p data-testid="custom-content">Custom body</p>
        </div>
      ));

      const customContent = document.querySelector(
        '[data-testid="custom-content"]',
      ) as HTMLElement;
      expect(customContent).toBeTruthy();
      expect(customContent.textContent).toBe("Custom body");
    });
  });
});
