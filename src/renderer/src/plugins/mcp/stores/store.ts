import { createSignal, type Accessor } from "solid-js";
import { Effect } from "effect";
import { McpApi, McpApiLive } from "@codeman-frontend/shared/apis";
import type {
  McpServerInfo,
  McpToolEntry,
} from "@codeman-frontend/shared/lib/types";

// ─── Signals ────────────────────────────────────────────────────

const [mcpServersInternal, setMcpServersInternal] = createSignal<McpServerInfo[]>([]);
const [mcpAllToolsInternal, setMcpAllToolsInternal] = createSignal<McpToolEntry[]>([]);

/** All MCP servers with their config, status, and tools. */
export const mcpServers$: Accessor<McpServerInfo[]> = mcpServersInternal;

/** All available MCP tools flattened from all connected servers. */
export const mcpAllTools$: Accessor<McpToolEntry[]> = mcpAllToolsInternal;

// ─── Actions ────────────────────────────────────────────────────

/** Load servers + tools from main process into signals. */
export const refresh = (() => {
  const program = Effect.gen(function* () {
    const svc = yield* McpApi;
    const servers = yield* svc.listServers();
    const tools = yield* svc.getAllTools();
    setMcpServersInternal(servers);
    setMcpAllToolsInternal(tools);
    return { servers, tools };
  });
  return program.pipe(Effect.provide(McpApiLive));
})();

/** Enable or disable an MCP server. */
export function enable(serverName: string, enabled: boolean) {
  const program = Effect.gen(function* () {
    const svc = yield* McpApi;
    yield* svc.enable(serverName, enabled);
  });
  return program.pipe(Effect.provide(McpApiLive));
}

/** Restart a running MCP server. */
export function restart(serverName: string) {
  const program = Effect.gen(function* () {
    const svc = yield* McpApi;
    yield* svc.restart(serverName);
  });
  return program.pipe(Effect.provide(McpApiLive));
}

/** Open the MCP config directory in the system file explorer. */
export function openConfigDir() {
  const program = Effect.gen(function* () {
    const svc = yield* McpApi;
    yield* svc.openConfigDir();
  });
  return program.pipe(Effect.provide(McpApiLive));
}

// ─── Lifecycle initializer (registry entry point) ─────────────────

/**
 * MCP lifecycle initializer — loads servers and tools into store signals.
 * Called by the plugin registry at startup.
 *
 * Unlike `refresh`, this leaves prior signal state unchanged if loading fails,
 * allowing the registry to handle MCP failures without corrupting existing state.
 */
export const initializeMcp = Effect.fn(
  function* () {
    const svc = yield* McpApi;
    const servers = yield* svc.listServers();
    const tools = yield* svc.getAllTools();
    // Only update signals on success — leave prior state intact on failure
    setMcpServersInternal(servers);
    setMcpAllToolsInternal(tools);
  },
  Effect.provide(McpApiLive),
);

// ─── Test helpers ───────────────────────────────────────────────

/** Reset signals to initial state (for tests). */
export function _resetMcpStoreForTest(): void {
  setMcpServersInternal([]);
  setMcpAllToolsInternal([]);
}
