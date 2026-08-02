import { describe, it, expect } from "vitest";

import { executeCommand } from "./exec.js";

describe("executeCommand", () => {
  it("basic execution collects stdout", async () => {
    const result = await executeCommand({ command: "node -e console.log(String.fromCharCode(104,105))" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hi");
  });

  it("non-zero exit code returns error result", async () => {
    const result = await executeCommand({ command: "node -e process.exit(2)" });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error.kind).toBeDefined();
    expect(result.error.exitCode).toBe(2);
  });

  it("timeoutMs returns timeout + partialOutput", async () => {
    const result = await executeCommand({ command: "ping -n 6 127.0.0.1", timeoutMs: 100 });
    expect(result.status).toBe("timeout");
    if (result.status !== "timeout") return;
    expect(result.partialOutput).toBeDefined();
  });
});
