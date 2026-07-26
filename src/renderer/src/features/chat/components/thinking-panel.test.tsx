//! ThinkingPanel 组件契约测试。
//!
//! 纯 UI,不依赖 chat.store (props 流式),所以无需 mock store。
//! 契约:
//!  - <details> 始终折叠(默认关闭)— 用户可点 summary 手动展开查看
//!  - streaming=true → summary "思考中…"
//!  - streaming=false → summary "已思考"
//!  - data-testid="thinking-panel" + data-message-id 是稳定锚点
//!  - <pre> 用 whitespace-pre-wrap,允许多行 + 保留空白

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
		// 默认折叠:streaming 与否都不展开,用户可手动点开
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
		// 空字符串 <pre> 仍然在 DOM (用户可能后续 streaming 添加内容)
		const pre = details?.querySelector('[data-testid="thinking-panel-content"]');
		expect(pre).toBeTruthy();
		expect(pre?.textContent).toBe("");
	});

	// 回归断言:W3.x (commit 036e7cd) 把外层 assistant bubble 改成 w-full,
	// 内嵌的 ThinkingPanel 也必须跟上 — 不再被 max-w-prose 卡片宽度限制。
	// 防止以后 W3.x 宽度契约被无声回滚。
	it("regression: <details> 没有 max-w-prose — 跟外层 assistant bubble (w-full) 同宽", () => {
		const { container } = render(() => (
			<ThinkingPanel thinking="..." streaming={false} messageId="msg-w3x" />
		));
		const panel = container.querySelector('[data-testid="thinking-panel"]');
		expect(panel).toBeTruthy();
		expect(panel).not.toHaveClass("max-w-prose");
	});
});