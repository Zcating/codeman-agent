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
      name: "read_file",
      args: { path: "/tmp/x.txt" },
    };
    const { container } = render(() => <ToolCallCard toolCall={toolCall} />);
    // Polish: border 改走 shadcn token `border-border` (前是 border-zinc-300)
    const card = container.querySelector("[class*='border-border']");
    expect(card).toBeTruthy();
    const icon = card?.querySelector("span");
    expect(icon?.textContent).toBe("⏳");
    const name = card?.querySelector("code");
    expect(name?.textContent).toBe("read_file");
  });

  it("成功状态：显示 ✓", () => {
    const toolCall: ToolCall = {
      id: "tc-2",
      name: "read_file",
      args: { path: "/tmp/x.txt" },
    };
    const result: ToolResult = {
      tool_call_id: "tc-2",
      result: "file content here",
      error: null,
    };
    const { container } = render(() => <ToolCallCard toolCall={toolCall} result={result} />);
    // Polish: 成功态 border 走 `border-success/40` (前是 border-green-300)
    const card = container.querySelector("[class*='border-success']");
    expect(card).toBeTruthy();
    const icon = card?.querySelector("span");
    expect(icon?.textContent).toBe("✓");
    const resultPre = card?.querySelector("details:last-of-type pre");
    expect(resultPre?.textContent).toContain("file content here");
  });

  it("错误状态：显示 ✗ + 错误消息", () => {
    const toolCall: ToolCall = {
      id: "tc-3",
      name: "read_file",
      args: { path: "/tmp/missing.txt" },
    };
    const result: ToolResult = {
      tool_call_id: "tc-3",
      result: null,
      error: "File not found",
    };
    const { container } = render(() => <ToolCallCard toolCall={toolCall} result={result} />);
    // Polish: 错误态 border 走 `border-destructive/40` (前是 border-red-300)
    const card = container.querySelector("[class*='border-destructive']");
    expect(card).toBeTruthy();
    const icon = card?.querySelector("span");
    expect(icon?.textContent).toBe("✗");
    // Polish: 错误消息容器走 `bg-destructive/10` (前是 bg-red-100)
    const errorDiv = card?.querySelector("[class*='bg-destructive']");
    expect(errorDiv?.textContent).toBe("File not found");
  });

  it("显示工具调用参数", () => {
    const toolCall: ToolCall = {
      id: "tc-4",
      name: "read_file",
      args: { path: "/tmp/x.txt", encoding: "utf-8" },
    };
    const { container } = render(() => <ToolCallCard toolCall={toolCall} />);
    const argsDetails = container.querySelector("details");
    expect(argsDetails).toBeTruthy();
    expect(argsDetails?.textContent).toContain("/tmp/x.txt");
    expect(argsDetails?.textContent).toContain("utf-8");
  });

  it("read_file 工具显示文件路径标签", () => {
    const toolCall: ToolCall = {
      id: "tc-read-1",
      name: "read_file",
      args: { path: "/workspace/src/index.ts" },
    };
    const { container } = render(() => <ToolCallCard toolCall={toolCall} />);
    const card = container.querySelector("[class*='border-border']");
    expect(card).toBeTruthy();
    // 验证路径标签存在
    const pathLabel = card?.querySelector("[class*='bg-primary/10']");
    expect(pathLabel?.textContent).toBe("/workspace/src/index.ts");
  });

  it("read_file 工具渲染 SVG 图标", () => {
    const toolCall: ToolCall = {
      id: "tc-read-2",
      name: "read_file",
      args: { path: "/workspace/src/app.ts" },
    };
    const { container } = render(() => <ToolCallCard toolCall={toolCall} />);
    // 验证有 SVG 图标渲染（FileText for read_file）
    const svgIcons = container.querySelectorAll("svg");
    expect(svgIcons.length).toBeGreaterThan(0);
    // 验证工具名称
    const name = container.querySelector("code");
    expect(name?.textContent).toBe("read_file");
  });

  it("未知工具回退到通用图标", () => {
    const toolCall: ToolCall = {
      id: "tc-unknown",
      name: "unknown_tool",
      args: {},
    };
    const { container } = render(() => <ToolCallCard toolCall={toolCall} />);
    // 应该仍然渲染 SVG 图标（Wrench 回退）
    const svgIcons = container.querySelectorAll("svg");
    expect(svgIcons.length).toBeGreaterThan(0);
  });
});
