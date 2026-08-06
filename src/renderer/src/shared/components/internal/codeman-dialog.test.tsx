
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { cleanup } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
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

    it("show<T>(): returns a Promise<T | null>", async () => {
      const result = Dialog.show<string>((_resolve) => <div>Test</div>);
      expect(result).toBeInstanceOf(Promise);
      void result;
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

    // ── BUG 回归：confirm cancel 按钮必须 resolve(false)。
    //    zag-js controlled 模式下不会发 onOpenChange({open:true})，
    //    所以 wasOpened 必须初始化为 true，否则 cancel 走 handleClose 时
    //    `!wasOpened` 提前 return → promise 永远 pending。
    it("confirm cancel resolves the promise with false", async () => {
      const user = userEvent.setup();
      const promise = Dialog.confirm({
        title: "Delete?",
        content: "Are you sure?",
        confirmText: "确认",
        cancelText: "取消",
      });

      const cancelBtn = document.querySelector(
        '[data-testid="cancel-btn"]',
      ) as HTMLElement;
      expect(cancelBtn).toBeTruthy();

      await user.click(cancelBtn);
      await new Promise((r) => setTimeout(r, 50));

      await expect(promise).resolves.toBe(false);
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

    // ── options.title: 传 title 时渲染 DialogTitle + 关闭按钮 ──
    it("renders DialogTitle + close button when options.title is provided", () => {
      Dialog.show(
        (_resolve) => (
          <div>
            <p data-testid="custom-content">Body</p>
          </div>
        ),
        { title: "拉取 CQ 任务" },
      );

      expect(document.body.textContent).toContain("拉取 CQ 任务");
      const closeBtn = document.querySelector(
        '[data-testid="dialog-close"]',
      ) as HTMLElement;
      expect(closeBtn).toBeTruthy();
      expect(closeBtn.getAttribute("aria-label")).toBe("关闭对话框");
    });

    // ── 关闭按钮固定显示，不依赖 title。
    //    title 仅控制 DialogHeader/DialogTitle；不传时仍有关闭按钮。
    it("renders close button even when options.title is omitted", () => {
      Dialog.show((_resolve) => (
        <div>
          <p data-testid="custom-content">Body</p>
        </div>
      ));

      // 关闭按钮存在
      const closeBtn = document.querySelector(
        '[data-testid="dialog-close"]',
      ) as HTMLElement;
      expect(closeBtn).toBeTruthy();

      // DialogTitle 不存在（不传 title）
      expect(document.body.textContent).not.toContain("拉取 CQ 任务");
    });

    // ── BUG 回归：zag-js controlled 模式下不会发 onOpenChange({open:true})，
    //    所以 wasOpened 必须初始化为 true，否则外部关闭路径（X 按钮 / ESC /
    //    背景点击）触发 onOpenChange({open:false}) 时会被吞掉。
    //    根因修复见 codeman-dialog.tsx::show 的 wasOpened 初始化注释。
    it("closes dialog and resolves null when close button is clicked", async () => {
      const user = userEvent.setup();
      let resolvedValue: unknown = "pending";
      const promise = Dialog.show<unknown>(
        (_resolve) => (
          <div>
            <p data-testid="custom-content">Body</p>
          </div>
        ),
        { title: "拉取 CQ 任务" },
      );
      promise.then((v) => {
        resolvedValue = v;
      });

      const closeBtn = document.querySelector(
        '[data-testid="dialog-close"]',
      ) as HTMLElement;
      expect(closeBtn).toBeTruthy();

      await user.click(closeBtn);

      // cleanupDialog 通过 setTimeout(..., 300) 异步卸载；等动画 + cleanup
      await new Promise((r) => setTimeout(r, 500));

      // 关闭按钮应已从 DOM 中移除
      expect(document.querySelector('[data-testid="dialog-close"]')).toBeNull();
      // Promise 应 resolve null
      expect(resolvedValue).toBeNull();
    });

    // ── BUG 回归：不传 title 时点击关闭按钮也能 resolve(null)。
    //    关闭按钮固定渲染，与 title 解耦；handleClose 走 wasOpened=true 路径。
    it("close button works even without options.title", async () => {
      const user = userEvent.setup();
      const promise = Dialog.show<unknown>((_resolve) => (
        <div>
          <p data-testid="custom-content">Body</p>
        </div>
      ));

      const closeBtn = document.querySelector(
        '[data-testid="dialog-close"]',
      ) as HTMLElement;
      expect(closeBtn).toBeTruthy();

      await user.click(closeBtn);
      await new Promise((r) => setTimeout(r, 500));

      await expect(promise).resolves.toBeNull();
    });
  });
});
