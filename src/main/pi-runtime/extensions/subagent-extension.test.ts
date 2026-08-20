import { describe, it, expect, vi } from "vitest";
import subagentExtension, { delegateTaskTool } from "./subagent-extension";

describe("subagent-extension", () => {
  it("exports delegateTaskTool with correct name", () => {
    expect(delegateTaskTool.name).toBe("delegate_task");
  });

  it("exports default extension function", () => {
    expect(typeof subagentExtension).toBe("function");
  });

  it("extension registers the delegate_task tool", () => {
    const mockPi = {
      registerTool: vi.fn(),
    };
    subagentExtension(mockPi as never);
    expect(mockPi.registerTool).toHaveBeenCalledWith(delegateTaskTool);
  });
});
