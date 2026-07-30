
import { Brain } from "lucide-solid";

export interface ThinkingPanelProps {
	thinking: string;
	streaming: boolean;
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