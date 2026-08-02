import { spawn, type ChildProcess } from "node:child_process";


export type StdioExitHandler = (code: number | null, signal: NodeJS.Signals | null) => void;
export type StdioErrorHandler = (err: Error) => void;

const SIGKILL_FALLBACK_MS = 5_000;

export class StdioTransport {
  #child: ChildProcess | null = null;
  #onExit: StdioExitHandler | null = null;
  #onError: StdioErrorHandler | null = null;

  constructor(
    readonly command: string,
    readonly args: string[],
    readonly env: Record<string, string> | undefined,
    readonly spawnFn: typeof spawn = spawn,
  ) {}


  start(): ChildProcess {
    const child = this.spawnFn(this.command, this.args, {
      env: { ...process.env, ...this.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.#child = child;
    child.on("exit", (code, signal) => this.#onExit?.(code, signal));
    child.on("error", (err) => this.#onError?.(err));
    return child;
  }

  get stdin(): NodeJS.WritableStream | null {
    return this.#child?.stdin ?? null;
  }

  get stdout(): NodeJS.ReadableStream | null {
    return this.#child?.stdout ?? null;
  }

  setOnExit(handler: StdioExitHandler): void {
    this.#onExit = handler;
  }

  setOnError(handler: StdioErrorHandler): void {
    this.#onError = handler;
  }


  kill(): Promise<void> {
    const child = this.#child;
    if (!child || child.killed) {
      this.#child = null;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        this.#child = null;
        resolve();
      };
      child.once("exit", finish);
      child.kill("SIGTERM");
      setTimeout(() => {
        if (this.#child && !this.#child.killed) {
          this.#child.kill("SIGKILL");
        }
        finish();
      }, SIGKILL_FALLBACK_MS);
    });
  }
}