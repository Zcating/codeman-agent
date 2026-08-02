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

  it("output truncation > 1MiB", async () => {
    const result = await executeCommand({ command: "node -e process.stdout.write(\"x\".repeat(2000000))" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // stdout should be truncated - has truncation marker and length well under 2_000_000
    expect(result.stdout.length).toBeLessThan(2_000_000);
    expect(result.stdout).toMatch(/truncated|omitted|\.\.\./);
  });

  it("truncate math: verifies omitted byte count is positive for output > 1MiB", async () => {
    // Produce ~3 MiB of single-line output to exercise single-line truncation branch.
    // 3 * 1024 * 1024 = 3,145,728 bytes
    const result = await executeCommand({ command: "node -e process.stdout.write(Buffer.alloc(3145728,120).toString())" });
    if (result.status !== "ok") {
      console.log("truncate math result:", JSON.stringify(result));
    }
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // Verify omitted marker appears and byte count is positive
    expect(result.stdout).toContain("omitted");
    const match = result.stdout.match(/\[\.\.\. (\d+) bytes omitted \.\.\.\]/);
    expect(match).not.toBeNull();
    const omittedBytes = Number(match![1]);
    // omitted = 3MiB - 2*(half) = 3MiB - 2*(1MiB/2) = 3MiB - 1MiB = 2MiB ≈ 2,097,152
    expect(omittedBytes).toBe(2097152);
  });
});
