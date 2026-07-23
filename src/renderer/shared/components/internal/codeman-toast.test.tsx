//! codeman-toast.test.tsx — Tests for module-level codemanToast singleton API.
//! Per ADR-0029 D5: imperative error/success API based on @ark-ui/solid Toast.

import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { codemanToast, ToasterMount } from "./codeman-toast";

describe("codemanToast", () => {
  afterEach(() => {
    cleanup();
    // Clean up any Portal-rendered content outside #root (parity with codeman-dialog test)
    const root = document.getElementById("root");
    if (root && root.parentElement) {
      const toRemove = Array.from(root.parentElement.children).filter(
        (c) => c.id !== "root",
      );
      toRemove.forEach((c) => c.remove());
    }
  });

  it("error(message) 在 DOM 中渲染 message 文本", async () => {
    render(() => <ToasterMount />);
    codemanToast.error("出错了");
    await waitFor(() => {
      expect(document.body.textContent).toContain("出错了");
    });
  });
});