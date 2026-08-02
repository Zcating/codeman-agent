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
        resolve({ status: "cancelled", partialOutput: { stdout: truncate(stdout), stderr: truncate(stderr) } });
        return;
      }
      signal.addEventListener("abort", () => {
        killProcess(child);
        resolve({ status: "cancelled", partialOutput: { stdout: truncate(stdout), stderr: truncate(stderr) } });
      });
    }

    // Set up timeout
    const timer = setTimeout(() => {
      killProcess(child);
      resolve({ status: "timeout", partialOutput: { stdout: truncate(stdout), stderr: truncate(stderr) } });
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      const exitCode = code ?? 0;
      const truncatedStdout = truncate(stdout);
      const truncatedStderr = truncate(stderr);
      if (exitCode !== 0) {
        resolve({ status: "error", error: { kind: "NonZeroExit", message: `Exit code ${exitCode}`, exitCode } });
      } else {
        resolve({ status: "ok", exitCode, stdout: truncatedStdout, stderr: truncatedStderr, durationMs });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      resolve({ status: "error", error: { kind: "ProcessError", message: err.message } });
    });
  });
}

const ONE_MIB = 1024 * 1024;

function truncate(output: string): string {
  if (output.length <= ONE_MIB) return output;
  const lines = output.split("\n");
  if (lines.length > 400) {
    const head = lines.slice(0, 200);
    const tail = lines.slice(-200);
    const omitted = output.length - head.join("\n").length - tail.join("\n").length - 2 * 200;
    return head.join("\n") + "\n" + `[... ${omitted} bytes omitted ...]\n` + tail.join("\n");
  }
  // Single-line or few-lines output > 1 MiB: keep first half + marker + last half
  const half = Math.floor(ONE_MIB / 2);
  return output.slice(0, half) + "\n[... " + (output.length - 2 * half) + " bytes omitted ...]\n" + output.slice(-half);
}

function killProcess(child: ReturnType<typeof spawn>): void {
  if (isWindows) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
  } else {
    child.kill("SIGTERM");
  }
}
