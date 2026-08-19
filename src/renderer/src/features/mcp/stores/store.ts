import { createSignal, type Accessor } from "solid-js";
import { Effect } from "effect";
import { McpApi, McpApiLive } from "@codeman-frontend/shared/apis";
import type {
  McpServerInfo,
  McpToolEntry,
} from "@codeman-frontend/shared/lib/types";


const [mcpServersInternal, setMcpServersInternal] = createSignal<McpServerInfo[]>([]);
const [mcpAllToolsInternal, setMcpAllToolsInternal] = createSignal<McpToolEntry[]>([]);

export const mcpServers$: Accessor<McpServerInfo[]> = mcpServersInternal;

export const mcpAllTools$: Accessor<McpToolEntry[]> = mcpAllToolsInternal;


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

export function enable(serverName: string, enabled: boolean) {
  const program = Effect.gen(function* () {
    const svc = yield* McpApi;
    yield* svc.enable(serverName, enabled);
  });
  return program.pipe(Effect.provide(McpApiLive));
}

export function restart(serverName: string) {
  const program = Effect.gen(function* () {
    const svc = yield* McpApi;
    yield* svc.restart(serverName);
  });
  return program.pipe(Effect.provide(McpApiLive));
}

export function openConfigDir() {
  const program = Effect.gen(function* () {
    const svc = yield* McpApi;
    yield* svc.openConfigDir();
  });
  return program.pipe(Effect.provide(McpApiLive));
}


export const initializeMcp = Effect.fn(
  function* () {
    const svc = yield* McpApi;
    const servers = yield* svc.listServers();
    const tools = yield* svc.getAllTools();
    setMcpServersInternal(servers);
    setMcpAllToolsInternal(tools);
  },
  Effect.provide(McpApiLive),
);


export function _resetMcpStoreForTest(): void {
  setMcpServersInternal([]);
  setMcpAllToolsInternal([]);
}
