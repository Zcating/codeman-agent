
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import type { StreamFn } from "@earendil-works/pi-agent-core";

export const anthropicStream: StreamFn = (model, context, options) => {
  const api = anthropicMessagesApi();
  if (typeof api.streamSimple === "function") {
    return api.streamSimple(model, context, options);
  }
  return api.stream(model, context, options);
};
