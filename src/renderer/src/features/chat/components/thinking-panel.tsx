// 默认折叠:thinking 文本属于 agent 内部推理过程,默认对用户不可见,需要时点 summary 手动展开。
// streaming 期间也保持折叠 — 用户通过正文 Markdown 流式输出感知 agent 进度。
// summary 标签反映 streaming 状态("思考中…" vs "已思考")。

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
			class="mb-2 border border-border/60 rounded-md bg-muted/40 overflow-hidden"
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