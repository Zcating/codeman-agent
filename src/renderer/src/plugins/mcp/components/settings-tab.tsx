import { For, Show, type JSX } from "solid-js";
import { Effect } from "effect";
import {
  FolderOpen,
  Power,
  RefreshCw,
  Server,
} from "lucide-solid";
import { cn } from "@codeman-frontend/shared/lib/cn";
import { Button } from "@codeman-frontend/shared/components/ui/button";
import {
  mcpServers$,
  mcpAllTools$,
  refresh,
  enable,
  restart,
  openConfigDir,
} from "@codeman-frontend/plugins/mcp/stores/store";
import type { McpServerStatus, McpServerInfo } from "@codeman-frontend/shared/lib/types";


const STATUS_LABEL: Record<McpServerStatus["kind"], string> = {
  disabled: "Disabled",
  starting: "Starting",
  connected: "Connected",
  spawn_failed: "Spawn Failed",
  protocol_error: "Protocol Error",
  crashed: "Crashed",
};

function StatusPill(props: { status: McpServerStatus }): JSX.Element {
  const isError = (): boolean =>
    props.status.kind === "spawn_failed" ||
    props.status.kind === "protocol_error" ||
    props.status.kind === "crashed";

  const isConnected = (): boolean => props.status.kind === "connected";
  const isStarting = (): boolean => props.status.kind === "starting";

  return (
    <span
      class={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium",
        isError()
          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
          : isConnected()
            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
            : isStarting()
              ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
      )}
      data-testid="mcp-status-pill"
    >
      <span
        class={cn(
          "h-1.5 w-1.5 rounded-full",
          isError()
            ? "bg-red-500"
            : isConnected()
              ? "bg-green-500"
              : isStarting()
                ? "bg-yellow-500"
                : "bg-zinc-400",
        )}
        aria-hidden="true"
      />
      {STATUS_LABEL[props.status.kind]}
      {props.status.kind === "spawn_failed" ||
      props.status.kind === "protocol_error" ||
      props.status.kind === "crashed"
        ? `: ${(props.status as { error: string }).error}`
        : null}
    </span>
  );
}


interface ServerRowProps {
  server: McpServerInfo;
}

function ServerRow(props: ServerRowProps): JSX.Element {
  const isRestartDisabled = (): boolean =>
    props.server.status.kind === "disabled" ||
    props.server.status.kind === "starting";

  const handleToggle = (): void => {
    void Effect.runPromise(
      enable(props.server.config.name, !props.server.config.enabled),
    );
  };

  const handleRestart = (): void => {
    void Effect.runPromise(restart(props.server.config.name));
  };

  return (
    <li class="flex items-start gap-3 rounded-lg border border-zinc-200 dark:border-zinc-700 p-3">
      <Server class="h-5 w-5 mt-0.5 text-zinc-400 shrink-0" aria-hidden="true" />
      <div class="flex-1 min-w-0 space-y-1">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <code class="text-sm font-mono font-medium text-zinc-900 dark:text-zinc-100 truncate min-w-0">
              {props.server.config.name}
            </code>
            <StatusPill status={props.server.status} />
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="xs"
              onClick={handleRestart}
              disabled={isRestartDisabled()}
              aria-label={`Restart ${props.server.config.name}`}
              title="Restart server"
            >
              <RefreshCw aria-hidden="true" />
              <span>Restart</span>
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={handleToggle}
              aria-label={`${props.server.config.enabled ? "Disable" : "Enable"} ${props.server.config.name}`}
              title={props.server.config.enabled ? "Disable server" : "Enable server"}
            >
              <Power aria-hidden="true" />
              <span>{props.server.config.enabled ? "Disable" : "Enable"}</span>
            </Button>
          </div>
        </div>
        <p class="text-xs text-zinc-500 dark:text-zinc-400 font-mono truncate">
          {props.server.config.command}
          {props.server.config.args.length > 0
            ? ` ${props.server.config.args.join(" ")}`
            : null}
        </p>
        <p class="text-xs text-zinc-400 dark:text-zinc-600">
          {props.server.tools.length} tool{props.server.tools.length !== 1 ? "s" : ""} available
        </p>
      </div>
    </li>
  );
}


export interface McpSettingsTabProps {
  onOpenConfigDir?: () => void;
}

export function McpSettingsTab(props: McpSettingsTabProps): JSX.Element {
  const handleOpenConfigDir = (): void => {
    void Effect.runPromise(openConfigDir());
    props.onOpenConfigDir?.();
  };

  const handleRefresh = (): void => {
    void Effect.runPromise(refresh);
  };

  return (
    <>
      <header class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            MCP Servers
          </h2>
          <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Manage Model Context Protocol servers that extend the agent's tool capabilities.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          aria-label="Refresh servers list"
          data-testid="mcp-refresh"
        >
          <RefreshCw aria-hidden="true" />
          <span>Refresh</span>
        </Button>
      </header>

      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleOpenConfigDir}
          data-testid="mcp-open-config"
        >
          <FolderOpen aria-hidden="true" />
          <span>Open config file</span>
        </Button>
        <p class="mt-1 text-xs text-zinc-400 dark:text-zinc-600 font-mono">
          ~/.agents/mcp_servers.json
        </p>
      </div>

      <Show
        when={mcpServers$().length > 0}
        fallback={
          <div class="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center">
            <Server class="h-8 w-8 mx-auto text-zinc-400 dark:text-zinc-600" aria-hidden="true" />
            <p class="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              No MCP servers configured.
            </p>
            <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
              Click "Open config file" to add servers via{" "}
              <code class="font-mono">~/.agents/mcp_servers.json</code>.
            </p>
          </div>
        }
      >
        <ul class="space-y-2" data-testid="mcp-servers-list">
          <For each={mcpServers$()}>
            {(server) => <ServerRow server={server} />}
          </For>
        </ul>
      </Show>

      <Show when={mcpAllTools$().length > 0}>
        <div>
          <p class="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            Available Tools ({mcpAllTools$().length})
          </p>
          <ul class="space-y-2" data-testid="mcp-tools-list">
            <For each={mcpAllTools$()}>
              {(tool) => (
                <li class="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3">
                  <div class="flex items-center gap-2 min-w-0">
                    <code
                      class="font-mono text-xs text-primary-600 dark:text-primary-400 truncate min-w-0 flex-1"
                      title={tool.agentName}
                    >
                      {tool.agentName}
                    </code>
                    <span class="shrink-0 rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                      {tool.serverName}
                    </span>
                  </div>
                  <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-500 break-words">
                    {tool.description}
                  </p>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </>
  );
}
