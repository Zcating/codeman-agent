import { Effect, Exit } from "effect";
import { match } from "ts-pattern";
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
    const assess = await Effect.runPromiseExit(invoke<{ risk: any; requestID?: string }>("runCommandAssess" as any, args as { command: string; cwd?: string }));
    if (Exit.isFailure(assess)) {
      const err: AppError = assess.cause._tag === "Fail" ? assess.cause.error as AppError : new Unknown({ message: String(assess.cause) });
      return { content: [{ type: "text" as const, text: `Error (${err._tag}): ${"message" in err ? err.message : JSON.stringify(err)}` }], details: err };
    }
    const r = assess.value;
    if (r.risk?.kind === "high" && r.requestID) {
      const decision = await new Promise<"once" | "always" | "reject">((resolve) => {
        const unsub = window.codeman.onPermissionReplied((p: any) => {
          if (p.requestID === r.requestID) {
            unsub();
            resolve(p.reply);
          }
        });
      });
      if (decision === "reject") {
        return { content: [{ type: "text" as const, text: "Error (PermissionDenied): 用户拒绝执行" }], details: new Unknown({ message: "用户拒绝执行" }) };
      }
      const exec = await Effect.runPromiseExit(invoke<RunCommandResult>("runCommandExecute" as any, args as { command: string; cwd?: string; timeoutMs?: number }));
      if (Exit.isFailure(exec)) {
        const err: AppError = exec.cause._tag === "Fail" ? exec.cause.error as AppError : new Unknown({ message: String(exec.cause) });
        return { content: [{ type: "text" as const, text: `Error (${err._tag}): ${"message" in err ? err.message : JSON.stringify(err)}` }], details: err };
      }
      const text = match(exec.value.status)
        .with("ok", () => `Exit code: ${exec.value.exitCode}\nDuration: ${exec.value.durationMs}ms\n--- STDOUT ---\n${exec.value.stdout ?? ""}\n--- STDERR ---\n${exec.value.stderr ?? ""}`)
        .with("cancelled", () => `Cancelled\n--- partial STDOUT ---\n${exec.value.partialOutput?.stdout ?? ""}\n--- partial STDERR ---\n${exec.value.partialOutput?.stderr ?? ""}`)
        .with("timeout", () => `Timed out\n--- partial STDOUT ---\n${exec.value.partialOutput?.stdout ?? ""}\n--- partial STDERR ---\n${exec.value.partialOutput?.stderr ?? ""}`)
        .with("error", () => `Error: ${exec.value.error?.kind ?? "Unknown"} — ${exec.value.error?.message ?? ""}${exec.value.error?.exitCode !== undefined ? ` (exit ${exec.value.error.exitCode})` : ""}`)
        .otherwise(() => `Error: Unknown status`);
      return { content: [{ type: "text" as const, text }], details: exec.value };
    }
    const exec = await Effect.runPromiseExit(invoke<RunCommandResult>("runCommandExecute" as any, args as { command: string; cwd?: string; timeoutMs?: number }));
    if (Exit.isFailure(exec)) {
      const err: AppError = exec.cause._tag === "Fail" ? exec.cause.error as AppError : new Unknown({ message: String(exec.cause) });
      return { content: [{ type: "text" as const, text: `Error (${err._tag}): ${"message" in err ? err.message : JSON.stringify(err)}` }], details: err };
    }
    const text = match(exec.value.status)
      .with("ok", () => `Exit code: ${exec.value.exitCode}\nDuration: ${exec.value.durationMs}ms\n--- STDOUT ---\n${exec.value.stdout ?? ""}\n--- STDERR ---\n${exec.value.stderr ?? ""}`)
      .with("cancelled", () => `Cancelled\n--- partial STDOUT ---\n${exec.value.partialOutput?.stdout ?? ""}\n--- partial STDERR ---\n${exec.value.partialOutput?.stderr ?? ""}`)
      .with("timeout", () => `Timed out\n--- partial STDOUT ---\n${exec.value.partialOutput?.stdout ?? ""}\n--- partial STDERR ---\n${exec.value.partialOutput?.stderr ?? ""}`)
      .with("error", () => `Error: ${exec.value.error?.kind ?? "Unknown"} — ${exec.value.error?.message ?? ""}${exec.value.error?.exitCode !== undefined ? ` (exit ${exec.value.error.exitCode})` : ""}`)
      .otherwise(() => `Error: Unknown status`);
    return { content: [{ type: "text" as const, text }], details: exec.value };
  },
};
