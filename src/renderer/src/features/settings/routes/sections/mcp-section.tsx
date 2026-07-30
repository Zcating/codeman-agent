import { type JSX, onMount } from "solid-js";
import { Effect, Exit } from "effect";
import { McpSettingsTab } from "@codeman-frontend/plugins/mcp/components/settings-tab";
import { refresh } from "@codeman-frontend/plugins/mcp/stores/store";
import { codemanToast } from "@codeman-frontend/shared/components/internal/codeman-toast";

export function McpSection(): JSX.Element {
  onMount(async () => {
    const exit = await Effect.runPromiseExit(refresh);
    if (Exit.isSuccess(exit)) {
      const { servers } = exit.value;
      if (servers.length > 0) {
        codemanToast.success(`Loaded ${servers.length} MCP server(s)`);
      }
    } else {
      const cause = exit.cause;
      const errMsg =
        cause._tag === "Fail"
          ? String(cause.error)
          : "(unknown error)";
      codemanToast.error(`Failed to load MCP servers: ${errMsg}`);
    }
  });

  return <McpSettingsTab />;
}
