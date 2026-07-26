//! ToolCallPanel 组件契约测试。
//!
//! 纯 UI,不依赖 chat.store (props 流式)。
//! 契约:
//!  - 默认 <details> 折叠(关闭)— 用户可点 summary 手动展开查看 args/result
//!  - summary 反映 status:running → "正在调用工具…",success → "已调用工具",error → "工具调用失败"
//!  - data-testid="tool-call-panel" + data-message-id + data-tool-call-id 是稳定锚点
//!  - 内嵌 ToolCallCard 渲染 args + result(由 mock 验证)

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import type { ToolCall, ToolResult } from "@codeman-frontend/shared/lib/types";

// Mock ToolCallCard — 让 ToolCallPanel 测试聚焦容器契约,无需展开 args/result 子树
vi.mock("./tool-call-card", () => ({
	ToolCallCard: (props: { toolCall: ToolCall; result?: ToolResult }) => (
		<div
			data-testid="inline-tool-card"
			data-tool-name={props.toolCall.name}
			data-tool-id={props.toolCall.id}
			data-has-result={props.result ? "true" : "false"}
		>
			ToolCallCard {props.toolCall.name}
		</div>
	),
}));

import { ToolCallPanel } from "@codeman-frontend/features/chat/components/tool-call-panel";

describe("ToolCallPanel", () => {
	afterEach(() => cleanup());

	const toolCall: ToolCall = {
		id: "tc-1",
		name: "read_file",
		args: { path: "/tmp/x.txt" },
	};

	it("默认 <details> 折叠(关闭) — 用户可点 summary 手动展开", () => {
		const { container } = render(() => (
			<ToolCallPanel toolCall={toolCall} messageId="msg-1" />
		));
		const panel = container.querySelector('[data-testid="tool-call-panel"]');
		expect(panel).toBeTruthy();
		expect(panel?.tagName).toBe("DETAILS");
		expect(panel?.hasAttribute("open")).toBe(false);
	});

	it("running(无 result)→ summary 显示 '正在调用工具…' + 工具名", () => {
		const { container } = render(() => (
			<ToolCallPanel toolCall={toolCall} messageId="msg-1" />
		));
		const summary = container.querySelector("summary");
		expect(summary?.textContent).toContain("正在调用工具…");
		expect(summary?.textContent).toContain("read_file");
	});

	it("success(有 result,无 error)→ summary 显示 '已调用工具' + 工具名", () => {
		const result: ToolResult = { toolCallId: "tc-1", result: "ok", error: null };
		const { container } = render(() => (
			<ToolCallPanel toolCall={toolCall} result={result} messageId="msg-1" />
		));
		const summary = container.querySelector("summary");
		expect(summary?.textContent).toContain("已调用工具");
		expect(summary?.textContent).toContain("read_file");
	});

	it("error(result 带 error)→ summary 显示 '工具调用失败' + 工具名", () => {
		const result: ToolResult = { toolCallId: "tc-1", result: null, error: "boom" };
		const { container } = render(() => (
			<ToolCallPanel toolCall={toolCall} result={result} messageId="msg-1" />
		));
		const summary = container.querySelector("summary");
		expect(summary?.textContent).toContain("工具调用失败");
		expect(summary?.textContent).toContain("read_file");
	});

	it("渲染 data-testid + data-message-id + data-tool-call-id 三重锚点", () => {
		const { container } = render(() => (
			<ToolCallPanel toolCall={toolCall} messageId="msg-X" />
		));
		const panel = container.querySelector('[data-testid="tool-call-panel"]');
		expect(panel).toBeTruthy();
		expect(panel?.getAttribute("data-message-id")).toBe("msg-X");
		expect(panel?.getAttribute("data-tool-call-id")).toBe("tc-1");
	});

	it("内嵌 ToolCallCard 接收 toolCall + result props 并渲染", () => {
		const result: ToolResult = { toolCallId: "tc-1", result: "ok", error: null };
		const { container } = render(() => (
			<ToolCallPanel toolCall={toolCall} result={result} messageId="msg-1" />
		));
		const card = container.querySelector('[data-testid="inline-tool-card"]');
		expect(card).toBeTruthy();
		expect(card?.getAttribute("data-tool-name")).toBe("read_file");
		expect(card?.getAttribute("data-has-result")).toBe("true");
	});

	// 回归断言:W3.x (commit 036e7cd) 把外层 assistant bubble 改成 w-full,
	// 内嵌的 ToolCallPanel 也必须跟上 — 不再被 max-w-prose 卡片宽度限制。
	// 防止以后 W3.x 宽度契约被无声回滚。
	it("regression: <details> 没有 max-w-prose — 跟外层 assistant bubble (w-full) 同宽", () => {
		const { container } = render(() => (
			<ToolCallPanel toolCall={toolCall} messageId="msg-w3x" />
		));
		const panel = container.querySelector('[data-testid="tool-call-panel"]');
		expect(panel).toBeTruthy();
		expect(panel).not.toHaveClass("max-w-prose");
	});
});