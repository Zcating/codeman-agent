import { Effect, Exit } from "effect";
import { toToolParameters } from "@codeman-frontend/shared/lib/tool-schema";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { invoke } from "@codeman-frontend/shared/apis/invoke.api";
import { RunCommandParamsSchema } from "./schemas.js";
import { Unknown, type AppError } from "@codeman-frontend/shared/lib/errors";

const params = toToolParameters(RunCommandParamsSchema);

interface RunCommandResult {
  status: "ok" | "cancelled" | "timeout" | "error";
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  durationMs?: number;
  partialOutput?: { stdout: string; stderr: string };
  error?: { kind: string; message: string; exitCode?: number };
}

export const runCommandTool: AgentTool<typeof params, RunCommandResult | AppError> = {
  label: "run_command",
  name: "run_command",
  description:
    "Execute a shell command via cmd.exe (Windows) or /bin/sh (POSIX). " +
    "Use for build/test/git/prisma operations. " +
    "Returns {status, exitCode, stdout, stderr} on success, or {status, error} on failure. " +
    "Default timeout 5 minutes (max 30 minutes). High-risk commands trigger a confirmation dialog.",
  parameters: params,
  execute: async (_toolCallId, args) => {
    const effect = Effect.gen(function* () {
      return yield* invoke<RunCommandResult>("runCommand", args as { command: string; cwd?: string; timeoutMs?: number });
    });
    const exit = await Effect.runPromiseExit(effect);
    if (Exit.isFailure(exit)) {
      const cause = exit.cause;
      const err: AppError =
        cause._tag === "Fail"
          ? (cause.error as AppError)
          : new Unknown({ message: String(cause) });
      return {
        content: [{ type: "text" as const, text: `Error (${err._tag}): ${"message" in err ? err.message : JSON.stringify(err)}` }],
        details: err,
      };
    }
    const r = exit.value;
    let text: string;
    if (r.status === "ok") {
      text = `Exit code: ${r.exitCode}\nDuration: ${r.durationMs}ms\n--- STDOUT ---\n${r.stdout ?? ""}\n--- STDERR ---\n${r.stderr ?? ""}`;
    } else if (r.status === "cancelled" || r.status === "timeout") {
      text = `${r.status === "cancelled" ? "Cancelled" : "Timed out"}\n--- partial STDOUT ---\n${r.partialOutput?.stdout ?? ""}\n--- partial STDERR ---\n${r.partialOutput?.stderr ?? ""}`;
    } else {
      text = `Error: ${r.error?.kind ?? "Unknown"} — ${r.error?.message ?? ""}${r.error?.exitCode !== undefined ? ` (exit ${r.error.exitCode})` : ""}`;
    }
    return { content: [{ type: "text" as const, text }], details: r };
  },
};
