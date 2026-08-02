
/**
 * Mock server request parsing — 从 IncomingMessage 读取 JSON body,
 * 并提取 Anthropic 风格 messages 中的用户文本 / assistant 计数。
 */

import { IncomingMessage } from "node:http";

export interface AnthropicMessagesBody {
  model?: string;
  messages?: Array<{ role: string; content: unknown }>;
}

export function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as unknown);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
    req.on("error", reject);
  });
}

export function extractLastUserText(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "";
  }
  const b = body as AnthropicMessagesBody;
  const msgs = b.messages;
  if (!Array.isArray(msgs)) {
    return "";
  }
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m && m.role === "user") {
      const c = m.content;
      if (typeof c === "string") {
        return c;
      }
      return typeof c === "object" ? JSON.stringify(c) : String(c ?? "");
    }
  }
  return "";
}

export function extractFirstUserText(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "";
  }
  const b = body as AnthropicMessagesBody;
  const msgs = b.messages;
  if (!Array.isArray(msgs)) {
    return "";
  }
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m && m.role === "user") {
      const c = m.content;
      if (typeof c === "string") {
        return c;
      }
      return typeof c === "object" ? JSON.stringify(c) : String(c ?? "");
    }
  }
  return "";
}

export function countAssistantMessages(body: unknown): number {
  if (!body || typeof body !== "object") {return 0;}
  const b = body as AnthropicMessagesBody;
  const msgs = b.messages;
  if (!Array.isArray(msgs)) {return 0;}
  let n = 0;
  for (const m of msgs) {
    if (m && m.role === "assistant") {n++;}
  }
  return n;
}

export function countCurrentRunAssistants(body: unknown): number {
  if (!body || typeof body !== "object") {return 0;}
  const b = body as AnthropicMessagesBody;
  const msgs = b.messages;
  if (!Array.isArray(msgs)) {return 0;}

  let lastPlainUserIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (!m || m.role !== "user") {continue;}
    const c = m.content;
    if (
      Array.isArray(c) &&
      c.some(
        (block: unknown) =>
          !!block &&
          typeof block === "object" &&
          (block as { type?: unknown }).type === "tool_result",
      )
    ) {
      continue;
    }
    lastPlainUserIdx = i;
    break;
  }

  if (lastPlainUserIdx < 0) {return 0;}

  let n = 0;
  for (let i = lastPlainUserIdx + 1; i < msgs.length; i++) {
    const m = msgs[i];
    if (m && m.role === "assistant") {n++;}
  }
  return n;
}
