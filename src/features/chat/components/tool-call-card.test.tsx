//! ToolCallCard component tests.
//!
//! States: running (no result yet), success (result, no error), error (result with error).
//! Pure UI component. No Effect imports. No store mocks needed.

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import { ToolCallCard } from "./tool-call-card";
import type { ToolCall, ToolResult } from "../../../shared/types";

describe("ToolCallCard", () => {
  afterEach(() => cleanup());

  it("running state: shows ⏳", () => {
    const toolCall: ToolCall = {
      id: "tc-1",
      name: "get_balance",
      args: { provider: "deepseek" },
    };
    const { container } = render(() => <ToolCallCard toolCall={toolCall} />);
    const card = container.querySelector("[class*='border-zinc-300']") ?? container.querySelector("[class*='dark:border-zinc-700']");
    expect(card).toBeTruthy();
    const icon = card?.querySelector("span");
    expect(icon?.textContent).toBe("⏳");
    const name = card?.querySelector("code");
    expect(name?.textContent).toBe("get_balance");
  });

  it("success state: shows ✓", () => {
    const toolCall: ToolCall = {
      id: "tc-2",
      name: "get_balance",
      args: { provider: "deepseek" },
    };
    const result: ToolResult = {
      tool_call_id: "tc-2",
      result: { amount: 87.42, currency: "CNY" },
      error: null,
    };
    const { container } = render(() => <ToolCallCard toolCall={toolCall} result={result} />);
    const card = container.querySelector("[class*='border-green-300']") ?? container.querySelector("[class*='dark:border-green-700']");
    expect(card).toBeTruthy();
    const icon = card?.querySelector("span");
    expect(icon?.textContent).toBe("✓");
    const resultPre = card?.querySelector("details:last-of-type pre");
    expect(resultPre?.textContent).toContain("87.42");
  });

  it("error state: shows ✗ + error message", () => {
    const toolCall: ToolCall = {
      id: "tc-3",
      name: "get_balance",
      args: { provider: "deepseek" },
    };
    const result: ToolResult = {
      tool_call_id: "tc-3",
      result: null,
      error: "API key not set",
    };
    const { container } = render(() => <ToolCallCard toolCall={toolCall} result={result} />);
    const card = container.querySelector("[class*='border-red-300']") ?? container.querySelector("[class*='dark:border-red-700']");
    expect(card).toBeTruthy();
    const icon = card?.querySelector("span");
    expect(icon?.textContent).toBe("✗");
    const errorDiv = card?.querySelector("[class*='bg-red-100']");
    expect(errorDiv?.textContent).toBe("API key not set");
  });

  it("shows tool call arguments", () => {
    const toolCall: ToolCall = {
      id: "tc-4",
      name: "get_balance",
      args: { provider: "deepseek", region: "cn" },
    };
    const { container } = render(() => <ToolCallCard toolCall={toolCall} />);
    const argsDetails = container.querySelector("details");
    expect(argsDetails).toBeTruthy();
    expect(argsDetails?.textContent).toContain("deepseek");
    expect(argsDetails?.textContent).toContain("cn");
  });
});
