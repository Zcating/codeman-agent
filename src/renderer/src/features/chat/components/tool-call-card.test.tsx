




import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import { ToolCallCard } from "@codeman-frontend/features/chat/components/tool-call-card";
import type { ToolCall, ToolResult } from "@codeman-frontend/shared/lib/types";

describe("ToolCallCard", () => {
  afterEach(() => cleanup());

  it("运行中状态：显示 ⏳", () => {
    const toolCall: ToolCall = {
      id: "tc-1",
      name: "read_file",
      args: { path: "/tmp/x.txt" },
    };
    const { container } = render(() => <ToolCallCard toolCall={toolCall} />);
    
    const card = container.querySelector("[class*='border-border']");
    expect(card).toBeTruthy();
    const icon = card?.querySelector("[data-testid='icon-running']");
    expect(icon?.getAttribute("aria-label")).toBe("running");
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
      toolCallId: "tc-2",
      result: "file content here",
      error: null,
    };
    const { container } = render(() => <ToolCallCard toolCall={toolCall} result={result} />);
    
    const card = container.querySelector("[class*='border-success']");
    expect(card).toBeTruthy();
    const icon = card?.querySelector("[data-testid='icon-success']");
    expect(icon?.getAttribute("aria-label")).toBe("success");
    
    const resultPre = card?.querySelector("[data-testid='tool-call-result']");
    expect(resultPre?.textContent).toContain("file content here");
  });

  it("错误状态：显示 ✗ + 错误消息", () => {
    const toolCall: ToolCall = {
      id: "tc-3",
      name: "read_file",
      args: { path: "/tmp/missing.txt" },
    };
    const result: ToolResult = {
      toolCallId: "tc-3",
      result: null,
      error: "File not found",
    };
    const { container } = render(() => <ToolCallCard toolCall={toolCall} result={result} />);
    
    const card = container.querySelector("[class*='border-destructive']");
    expect(card).toBeTruthy();
    const icon = card?.querySelector("[data-testid='icon-error']");
    expect(icon?.getAttribute("aria-label")).toBe("error");
    
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
    
    const argsPre = container.querySelector("[data-testid='tool-call-args']");
    expect(argsPre).toBeTruthy();
    expect(argsPre?.textContent).toContain("/tmp/x.txt");
    expect(argsPre?.textContent).toContain("utf-8");
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
    
    const svgIcons = container.querySelectorAll("svg");
    expect(svgIcons.length).toBeGreaterThan(0);
    
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
    
    const svgIcons = container.querySelectorAll("svg");
    expect(svgIcons.length).toBeGreaterThan(0);
  });
});
