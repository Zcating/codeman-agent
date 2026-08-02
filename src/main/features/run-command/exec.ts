import { spawn } from "node:child_process";

export type RunCommandResult =
  | { status: "ok"; exitCode: number; stdout: string; stderr: string; durationMs: number }
  | { status: "cancelled"; partialOutput: { stdout: string; stderr: string } }
  | { status: "timeout"; partialOutput: { stdout: string; stderr: string } }
  | { status: "error"; error: { kind: string; message: string; exitCode?: number } };

export interface ExecuteCommandInput {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  signal?: AbortSignal;
}

const isWindows = process.platform === "win32";

function getShell(command: string): { cmd: string; args: string[] } {
  if (isWindows) {
    return { cmd: "cmd.exe", args: ["/c", command] };
  }
  return { cmd: "/bin/sh", args: ["-c", command] };
}

const SAFE_ENV_VARS = ["PATH", "HOME", "USERPROFILE", "TMP", "TEMP", "LANG", "LC_ALL", "SystemRoot"];

export async function executeCommand(input: ExecuteCommandInput): Promise<RunCommandResult> {
  const { command, cwd, timeoutMs = 300_000, env, signal } = input;

  const { cmd, args } = getShell(command);

  const safeEnv: Record<string, string> = {};
  for (const key of SAFE_ENV_VARS) {
    if (process.env[key]) {
      safeEnv[key] = process.env[key]!;
    }
  }
  if (env) {
    Object.assign(safeEnv, env);
  }

  const start = Date.now();

  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: cwd ?? process.cwd(),
      env: safeEnv,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    // Attach abort signal if provided
    if (signal) {
      if (signal.aborted) {
        killProcess(child);
        resolve({ status: "cancelled", partialOutput: { stdout, stderr } });
        return;
      }
      signal.addEventListener("abort", () => {
        killProcess(child);
        resolve({ status: "cancelled", partialOutput: { stdout, stderr } });
      });
    }

    // Set up timeout
    const timer = setTimeout(() => {
      killProcess(child);
      resolve({ status: "timeout", partialOutput: { stdout, stderr } });
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      const exitCode = code ?? 0;
      if (exitCode !== 0) {
        resolve({ status: "error", error: { kind: "NonZeroExit", message: `Exit code ${exitCode}`, exitCode } });
      } else {
        resolve({ status: "ok", exitCode, stdout, stderr, durationMs });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      resolve({ status: "error", error: { kind: "ProcessError", message: err.message } });
    });
  });
}

function killProcess(child: ReturnType<typeof spawn>): void {
  if (isWindows) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
  } else {
    child.kill("SIGTERM");
  }
}
