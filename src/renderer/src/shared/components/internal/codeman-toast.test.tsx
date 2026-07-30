
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { codemanToast, ToasterMount } from "@codeman-frontend/shared/components/internal/codeman-toast";

describe("codemanToast", () => {
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

  it("error(message) 在 DOM 中渲染 message 文本", async () => {
    render(() => <ToasterMount />);
    codemanToast.error("出错了");
    await waitFor(() => {
      expect(document.body.textContent).toContain("出错了");
    });
  });
});