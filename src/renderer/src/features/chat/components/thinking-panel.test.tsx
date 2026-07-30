
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import { ThinkingPanel } from "@codeman-frontend/features/chat/components/thinking-panel";

describe("ThinkingPanel", () => {
	afterEach(() => cleanup());

	it("streaming=true → <details> 默认折叠(关闭)+ summary '思考中…'", () => {
		const { container } = render(() => (
			<ThinkingPanel
				thinking="let me think..."
				streaming={true}
				messageId="msg-1"
			/>
		));
		const details = container.querySelector("details");
		expect(details).toBeTruthy();
		expect(details?.hasAttribute("open")).toBe(false);
		const summary = details?.querySelector("summary");
		expect(summary?.textContent).toContain("思考中…");
	});

	it("streaming=false → <details> 仍然折叠 + summary '已思考'", () => {
		const { container } = render(() => (
			<ThinkingPanel
				thinking="decided."
				streaming={false}
				messageId="msg-2"
			/>
		));
		const details = container.querySelector("details");
		expect(details).toBeTruthy();
		expect(details?.hasAttribute("open")).toBe(false);
		const summary = details?.querySelector("summary");
		expect(summary?.textContent).toContain("已思考");
	});

	it("渲染 data-testid 'thinking-panel' + data-message-id 锚点", () => {
		const { container } = render(() => (
			<ThinkingPanel thinking="..." streaming={true} messageId="msg-X" />
		));
		const panel = container.querySelector('[data-testid="thinking-panel"]');
		expect(panel).toBeTruthy();
		expect(panel?.getAttribute("data-message-id")).toBe("msg-X");
	});

	it("thinking 文本渲染在 data-testid='thinking-panel-content' 的 <pre> 内", () => {
		const { container } = render(() => (
			<ThinkingPanel
				thinking={"line 1\nline 2\nline 3"}
				streaming={false}
				messageId="msg-3"
			/>
		));
		const pre = container.querySelector('[data-testid="thinking-panel-content"]');
		expect(pre).toBeTruthy();
		expect(pre?.tagName).toBe("PRE");
		expect(pre?.textContent).toBe("line 1\nline 2\nline 3");
	});

	it("thinking=空字符串仍然渲染 <details> 容器(summary 可点击)", () => {
		const { container } = render(() => (
			<ThinkingPanel thinking="" streaming={true} messageId="msg-4" />
		));
		const details = container.querySelector('[data-testid="thinking-panel"]');
		expect(details).toBeTruthy();
		expect(details?.hasAttribute("open")).toBe(false);
		const pre = details?.querySelector('[data-testid="thinking-panel-content"]');
		expect(pre).toBeTruthy();
		expect(pre?.textContent).toBe("");
	});

	it("regression: <details> 没有 max-w-prose — 跟外层 assistant bubble (w-full) 同宽", () => {
		const { container } = render(() => (
			<ThinkingPanel thinking="..." streaming={false} messageId="msg-w3x" />
		));
		const panel = container.querySelector('[data-testid="thinking-panel"]');
		expect(panel).toBeTruthy();
		expect(panel).not.toHaveClass("max-w-prose");
	});
});