//! ToolCallPanel — assistant message 内 tool call 展示块(可折叠 details,默认折叠)。
//!
//! V3.x 决策:tool call 渲染从 MessageBubble 内 inline ToolCallCard 抽出到独立
//! ToolCallPanel 组件。理由跟 ThinkingPanel 平行:
//!  - 长 args / result 文本可被折叠,需要时手动展开
//!  - 独立组件便于 unit test,不被 message-bubble 的 render tree 污染
//!  - summary 行携带工具名 + 状态(running / done / error),不用展开 details
//!    也能识别是哪个工具
//!
//! 默认折叠(本页"页面优化"诉求 — WX-OPT-2026-07-16):tool call 默认收起,
//! summary 行就足够扫读多轮调用的上下文;需要看具体 args/result 才点开。
//! 由 MessageBubble 在 inline-tool-calls 容器内逐条渲染,data-tool-call-id 锚定。

import { Wrench } from "lucide-solid";
import { ToolCallCard } from "./tool-call-card";
import type { ToolCall, ToolResult } from "../../../shared/lib/types";

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
		if (isRunning()) return "正在调用工具…";
		if (isError()) return "工具调用失败";
		return "已调用工具";
	};

	return (
		<details
			class="max-w-prose mb-2 border border-border/60 rounded-md bg-muted/40 overflow-hidden"
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