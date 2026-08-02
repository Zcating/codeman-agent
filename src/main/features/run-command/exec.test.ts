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
});
