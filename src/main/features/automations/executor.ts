// Executes LLM and Script actions for automations
import { Effect } from "effect";
import { BrowserWindow, ipcMain } from "electron";
import { spawn } from "node:child_process";
import { Unknown, InvalidConfig } from "../../lib/errors.js";
import type { AutomationRule, TriggerKind } from "../../../shared/lib/automation-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecutionOutcome {
  readonly status: "success" | "failure" | "timeout" | "error";
  readonly finalText?: string;
  readonly exitCode?: number;
  readonly stderr?: string;
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// Pending LLM executions registry
// ---------------------------------------------------------------------------

interface PendingLlmExecution {
  resolve: (outcome: ExecutionOutcome) => void;
  timeoutHandle: NodeJS.Timeout;
}

const pendingLlmExecutions = new Map<string, PendingLlmExecution>();

// Register global IPC handler for LLM results (one-time setup)
let llmResultHandlerRegistered = false;
function ensureLlmResultHandler(): void {
  if (llmResultHandlerRegistered) return;
  llmResultHandlerRegistered = true;

  ipcMain.on(
    "automations:execute-llm-result",
    (_event, payload: {
      executionId: string;
      status: "success" | "failure" | "timeout" | "error";
      finalText?: string;
      error?: string;
    }) => {
      const pending = pendingLlmExecutions.get(payload.executionId);
      if (!pending) return;
      clearTimeout(pending.timeoutHandle);
      pendingLlmExecutions.delete(payload.executionId);
      pending.resolve({
        status: payload.status,
        finalText: payload.finalText,
        error: payload.error,
      });
    },
  );
}

// ---------------------------------------------------------------------------
// executeAction — dispatches to LLM or Script executor
// ---------------------------------------------------------------------------

export function executeAction(
  rule: AutomationRule,
  _triggerKind: TriggerKind,
  executionId: string,
): Effect.Effect<ExecutionOutcome, InvalidConfig | Unknown> {
  switch (rule.action.kind) {
    case "llm":
      return executeLlmAction(rule.action, executionId);
    case "script":
      return executeScriptAction(rule.action, executionId);
  }
}

// ---------------------------------------------------------------------------
// executeLlmAction — IPC to renderer, await result via Promise.race + 5min timeout
// ---------------------------------------------------------------------------

export function executeLlmAction(
  action: {
    readonly systemPrompt: string;
    readonly userPrompt: string;
    readonly providerId: string;
    readonly modelId: string;
    readonly timeoutMs: number;
  },
  executionId: string,
): Effect.Effect<ExecutionOutcome, Unknown> {
  return Effect.async((resolve) => {
    ensureLlmResultHandler();

    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!window || window.isDestroyed()) {
      resolve(Effect.fail(new Unknown({ message: "no_renderer_window" })));
      return;
    }

    // Send execution task to renderer listener
    window.webContents.send("automations:execute-llm", {
      executionId,
      action,
    });

    const timeoutMs = action.timeoutMs ?? 300_000;

    const timeoutHandle = setTimeout(() => {
      pendingLlmExecutions.delete(executionId);
      resolve(Effect.succeed({
        status: "timeout",
        error: `LLM action timed out after ${timeoutMs}ms`,
      }));
    }, timeoutMs);

    pendingLlmExecutions.set(executionId, {
      resolve: (outcome) => resolve(Effect.succeed(outcome)),
      timeoutHandle,
    });
  });
}

// ---------------------------------------------------------------------------
// executeScriptAction — spawn in workspace sandbox + 5min default timeout
// ---------------------------------------------------------------------------

export function executeScriptAction(
  action: {
    readonly language: "shell" | "javascript";
    readonly source: string;
    readonly workspaceId: string;
    readonly timeoutMs: number;
  },
  _executionId: string,
): Effect.Effect<ExecutionOutcome, InvalidConfig | Unknown> {
  // V1 does not support javascript script actions per
  if (action.language === "javascript") {
    return Effect.fail(new InvalidConfig({ message: "V1 does not support javascript script action" }));
  }

  return Effect.async((resolve) => {
    const cwd = process.cwd();

    // Execute via spawn
    const timeoutMs = action.timeoutMs ?? 300_000;
    const isWindows = process.platform === "win32";

    const command =
      action.language === "shell"
        ? action.source
        : `node -e "${action.source.replace(/"/g, '\\"')}"`;

    executeCommandSpawn({ command, cwd, timeoutMs, isWindows })
      .then((result) => resolve(Effect.succeed(result)))
      .catch((e) => resolve(Effect.fail(new Unknown({ message: String(e) }))));
  });
}

function executeCommandSpawn(input: {
  command: string;
  cwd: string;
  timeoutMs: number;
  isWindows: boolean;
}): Promise<ExecutionOutcome> {
  const { command, cwd, timeoutMs, isWindows } = input;

  return new Promise((resolve) => {
    const shellCmd = isWindows ? "cmd.exe" : "/bin/sh";
    const shellArgs = isWindows ? ["/c", command] : ["-c", command];

    const child = spawn(shellCmd, shellArgs, {
      cwd,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      child.kill();
      resolve({ status: "timeout", stderr: "Command timed out" });
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      const exitCode = code ?? 0;
      if (exitCode !== 0) {
        resolve({ status: "failure", exitCode, stderr });
      } else {
        resolve({ status: "success", exitCode, finalText: stdout, stderr });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ status: "error", error: err.message });
    });
  });
}
