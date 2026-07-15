//! ThinkingPanel — assistant message 内 thinking 展示块(details 容器,默认折叠)。
//!
//! V3.x 决策:thinking 渲染从 message-bubble 内的 inline ThinkingSection(<div>)
//! 迁出到独立 ThinkingPanel 组件(<details>)。
//!
//! 默认折叠(本页"页面优化"诉求 — WX-OPT-2026-07-16):thinking 文本属于 agent
//! 内部推理过程,默认对用户不可见,需要时点 summary 手动展开。streaming 期间
//! 也保持折叠 — 用户通过正文 Markdown 流式输出感知 agent 进度,thinking 仅在
//! 显式需要时查看(降低 chat 视觉密度)。
//!
//! summary 标签反映 streaming 状态("思考中…" vs "已思考"),即使折叠也提示
//! agent 状态。独立组件便于 unit test,不被 message-bubble 的 render tree
//! 污染。由 MessageBubble 在 assistant bubble 内 thinking 位置渲染,data-message-id
//! 跟 bubble 同 message id,便于 e2e harness 锚定。

import { Brain } from "lucide-solid";

export interface ThinkingPanelProps {
	/** 累积 thinking 文本内容 */
	thinking: string;
	/** 是否仍处于 streaming (仅影响 summary label: "思考中…" vs "已思考") */
	streaming: boolean;
	/** message 的 id,作为 data-message-id 锚点 */
	messageId: string;
}

export function ThinkingPanel(props: ThinkingPanelProps) {
	return (
		<details
			class="max-w-prose mb-2 border border-border/60 rounded-md bg-muted/40 overflow-hidden"
			data-testid="thinking-panel"
			data-message-id={props.messageId}
		>
			<summary class="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none">
				<Brain class="h-3.5 w-3.5" aria-hidden="true" />
				<span>{props.streaming ? "思考中…" : "已思考"}</span>
			</summary>
			<pre
				class="px-3 py-2 text-xs font-mono leading-relaxed text-muted-foreground whitespace-pre-wrap border-t border-border/60 max-h-64 overflow-y-auto"
				data-testid="thinking-panel-content"
			>
				{props.thinking}
			</pre>
		</details>
	);
}