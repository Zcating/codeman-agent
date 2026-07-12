//! ThinkingPanel — 专用块,展示当前 stub / 最近一条 assistant 的 thinking 内容。
//!
//! 与 message-bubble 内嵌的 ThinkingSection 不同:
//!  - ThinkingPanel 作为独立 panel,放在 stub message 之外(messages list 后)
//!  - 即使 stream 已 done 也持续显示,与 streamingMessageId=null 解耦
//!  - 默认 streaming=true 时展开,streaming=false 时折叠,用户可点击 summary 手动 toggle
//!
//! 由 ChatView 在 messages list 之后、thinking-indicator 之前渲染。
//! 数据源: store.byId[convId].streamingMessageId 找到当前 stub;
//! fallback(done 之后):最后一条 thinking 非空的 assistant message。

import { Brain } from "lucide-solid";

export interface ThinkingPanelProps {
  /** 累积 thinking 文本内容 */
  thinking: string;
  /** 是否仍处于 streaming (影响 open 默认值 + summary label) */
  streaming: boolean;
  /** stub / finalized message 的 id,作为 data-message-id 锚点 */
  messageId: string;
}

export function ThinkingPanel(props: ThinkingPanelProps) {
  return (
    <details
      class="max-w-prose mb-3 border border-border/60 rounded-md bg-muted/40 overflow-hidden"
      data-testid="thinking-panel"
      data-message-id={props.messageId}
      open={props.streaming}
    >
      <summary class="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none">
        <Brain class="h-3.5 w-3.5" aria-hidden="true" />
        <span>{props.streaming ? "正在思考…" : "已思考"}</span>
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
