
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import type { StreamFn } from "@earendil-works/pi-agent-core";

/** Agent 的 streamFn 薄包装:PI api 的 stream。Agent loop 已把 getApiKey 注入 options.apiKey。 */
export const anthropicStream: StreamFn = (model, context, options) =>
  anthropicMessagesApi().stream(model, context, options);
