import type { WebContents } from "electron";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { agentSessionEventToRuntimeEvent } from "./types.js";

export function createEventBridge(webContents: WebContents) {
  let unsubscribed = false;

  return function bridgeToWebContents(event: AgentSessionEvent) {
    if (unsubscribed) { return; }

    const runtimeEvent = agentSessionEventToRuntimeEvent(event);
    if (runtimeEvent === null) { return; }

    if (!webContents.isDestroyed()) {
      webContents.send("pi:event", runtimeEvent);
    }
  };
}

export function createEventBridgeUnsubscriber(unsubscribe: () => void) {
  let called = false;
  return () => {
    if (called) { return; }
    called = true;
    unsubscribe();
  };
}
