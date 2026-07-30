// 默认折叠:tool call 默认收起,summary 行就足够扫读多轮调用的上下文。
// 由 MessageBubble 在 inline-tool-calls 容器内逐条渲染,data-tool-call-id 锚定。

import { Wrench } from "lucide-solid";
import { ToolCallCard } from "@codeman-frontend/features/chat/components/tool-call-card";
import type { ToolCall, ToolResult } from "@codeman-frontend/shared/lib/types";

export interface ToolCallPanelProps {
	/** tool call 元数据(name / args / id) */
	toolCall: ToolCall;
	/** 工具执行结果(可选;无 = running) */
	result?: ToolResult;
	/** 当前 assistant message id,作为 data-message-id 锚点 */
	messageId: string;
}

export function ToolCallPanel(props: ToolCallPanelProps) {
	const isRunning = () => !props.result;
	const isError = () => !!props.result?.error;
	const statusLabel = () => {
		if (isRunning()) {return "正在调用工具…";}
		if (isError()) {return "工具调用失败";}
		return "已调用工具";
	};

	return (
		<details
			class="mb-2 border border-border/60 rounded-md bg-muted/40 overflow-hidden"
			data-testid="tool-call-panel"
			data-message-id={props.messageId}
			data-tool-call-id={props.toolCall.id}
		>
			<summary class="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none">
				<Wrench class="h-3.5 w-3.5" aria-hidden="true" />
				<span>{statusLabel()}</span>
				<code class="text-xs font-mono text-foreground ml-auto">{props.toolCall.name}</code>
			</summary>
			<div class="border-t border-border/60">
				<ToolCallCard toolCall={props.toolCall} result={props.result} />
			</div>
		</details>
	);
}