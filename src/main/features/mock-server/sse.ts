
// SSE 字符串构造与流式写入 —— 自 src/main/mock-server.ts 拆出(pure refactor)

import type { ServerResponse } from "node:http";

export interface SseTurnInput {
  thinking?: string;
  text: string;
  toolUses?: Array<{ name: string; input: Record<string, unknown> }>;
}

export interface SseEntryInput {
  turns: SseTurnInput[];
}

export function buildSseTurnEvents(turn: SseTurnInput, deltaSize: number): string[] {
  const events: string[] = [];
  const msgId = `msg_mock_${Date.now()}`;

  events.push(
    `event: message_start\n` +
      `data: {"type":"message_start","message":{"id":"${msgId}","type":"message","role":"assistant","content":[],"model":"mock-default","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":0,"output_tokens":0}}}\n` +
      "\n",
  );

  let blockIdx = 0;

  if (turn.thinking && turn.thinking.length > 0) {
    events.push(
      `event: content_block_start\n` +
        `data: {"type":"content_block_start","index":${blockIdx},"content_block":{"type":"thinking","thinking":""}}\n` +
        "\n",
    );
    events.push(
      `event: content_block_delta\n` +
        `data: {"type":"content_block_delta","index":${blockIdx},"delta":{"type":"thinking_delta","thinking":${JSON.stringify(turn.thinking)}}}\n` +
        "\n",
    );
    events.push(
      `event: content_block_delta\n` +
        `data: {"type":"content_block_delta","index":${blockIdx},"delta":{"type":"signature_delta","signature":"sig_mock_${blockIdx}_${Date.now()}"}}\n` +
        "\n",
    );
    events.push(
      `event: content_block_stop\n` +
        `data: {"type":"content_block_stop","index":${blockIdx}}\n` +
        "\n",
    );
    blockIdx++;
  }

  if (turn.text.length > 0) {
    events.push(
      `event: content_block_start\n` +
        `data: {"type":"content_block_start","index":${blockIdx},"content_block":{"type":"text","text":""}}\n` +
        "\n",
    );
    for (let i = 0; i < turn.text.length; i += deltaSize) {
      const chunk = turn.text.slice(i, i + deltaSize);
      events.push(
        `event: content_block_delta\n` +
          `data: {"type":"content_block_delta","index":${blockIdx},"delta":{"type":"text_delta","text":${JSON.stringify(chunk)}}}\n` +
          "\n",
      );
    }
    events.push(
      `event: content_block_stop\n` +
        `data: {"type":"content_block_stop","index":${blockIdx}}\n` +
        "\n",
    );
    blockIdx++;
  }

  if (turn.toolUses && turn.toolUses.length > 0) {
    for (const tu of turn.toolUses) {
      const toolId = `toolu_mock_${blockIdx}_${Date.now()}`;
      events.push(
        `event: content_block_start\n` +
          `data: {"type":"content_block_start","index":${blockIdx},"content_block":{"type":"tool_use","id":"${toolId}","name":${JSON.stringify(tu.name)},"input":{}}}\n` +
          "\n",
      );
      events.push(
        `event: content_block_delta\n` +
          `data: {"type":"content_block_delta","index":${blockIdx},"delta":{"type":"input_json_delta","partial_json":${JSON.stringify(JSON.stringify(tu.input))}}}\n` +
          "\n",
      );
      events.push(
        `event: content_block_stop\n` +
          `data: {"type":"content_block_stop","index":${blockIdx}}\n` +
          "\n",
      );
      blockIdx++;
    }
  }

  const stopReason = turn.toolUses && turn.toolUses.length > 0 ? "tool_use" : "end_turn";
  const outputTokens = turn.text.length + (turn.thinking?.length ?? 0);
  const inputTokens = Math.ceil((turn.text.length + (turn.thinking?.length ?? 0)) / 4);
  events.push(
    `event: message_delta\n` +
      `data: {"type":"message_delta","delta":{"stop_reason":"${stopReason}"},"usage":{"input_tokens":${inputTokens},"output_tokens":${outputTokens}}}\n` +
      "\n",
  );

  events.push(
    `event: message_stop\n` +
      `data: {"type":"message_stop"}\n` +
      "\n",
  );

  return events;
}

export function buildSseEvents(entry: SseEntryInput, deltaSize: number): string[] {
  return buildSseTurnEvents(entry.turns[0], deltaSize);
}

export function writeSseStream(
  res: ServerResponse,
  events: string[],
  delayMs: number,
): void {
  let i = 0;
  const writeNext = (): void => {
    if (i >= events.length) {
      res.end();
      return;
    }
    res.write(events[i]);
    i++;
    if (delayMs > 0) {
      setTimeout(writeNext, delayMs);
    } else {
      setImmediate(writeNext);
    }
  };

  writeNext();
}
