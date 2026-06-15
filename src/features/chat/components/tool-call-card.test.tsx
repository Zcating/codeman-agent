//! ToolCallCard 组件测试。
//!
//! 状态：running（无结果）、success（result，无 error）、error（result 带 error）。
//! 纯 UI 组件。无 Effect 导入。无 store mocks 需要。

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import { ToolCallCard } from "./tool-call-card";
import type { ToolCall, ToolResult } from "../../../shared/lib/types";

describe("ToolCallCard", () => {
  afterEach(() => cleanup());

  it("运行中状态：显示 ⏳", () => {
    const toolCall: ToolCall = {
      id: "tc-1",
      name: "get_balance",
      args: { provider: "deepseek" },
    };
    const { container } = render(() => <ToolCallCard toolCall={toolCall} />);
    // Polish: border 改走 shadcn token `border-border` (前是 border-zinc-300)
    const card = container.querySelector("[class*='border-border']");
    expect(card).toBeTruthy();
    const icon = card?.querySelector("span");
    expect(icon?.textContent).toBe("⏳");
    const name = card?.querySelector("code");
    expect(name?.textContent).toBe("get_balance");
  });

  it("成功状态：显示 ✓", () => {
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
    // Polish: 成功态 border 走 `border-success/40` (前是 border-green-300)
    const card = container.querySelector("[class*='border-success']");
    expect(card).toBeTruthy();
    const icon = card?.querySelector("span");
    expect(icon?.textContent).toBe("✓");
    const resultPre = card?.querySelector("details:last-of-type pre");
    expect(resultPre?.textContent).toContain("87.42");
  });

  it("错误状态：显示 ✗ + 错误消息", () => {
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
    // Polish: 错误态 border 走 `border-destructive/40` (前是 border-red-300)
    const card = container.querySelector("[class*='border-destructive']");
    expect(card).toBeTruthy();
    const icon = card?.querySelector("span");
    expect(icon?.textContent).toBe("✗");
    // Polish: 错误消息容器走 `bg-destructive/10` (前是 bg-red-100)
    const errorDiv = card?.querySelector("[class*='bg-destructive']");
    expect(errorDiv?.textContent).toBe("API key not set");
  });

  it("显示工具调用参数", () => {
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
