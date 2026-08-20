import { describe, it, expect, vi } from "vitest";
import codemanAgentExtension from "./codeman-agent-extension";

describe("codeman-agent-extension", () => {
  it("exports a function", () => {
    expect(typeof codemanAgentExtension).toBe("function");
  });

  it("registers before_agent_start hook", () => {
    const mockOn = vi.fn();
    const mockPi = { on: mockOn } as never;
    codemanAgentExtension(mockPi);
    expect(mockOn).toHaveBeenCalledWith("before_agent_start", expect.any(Function));
  });

  it("before_agent_start injects identity and cwd footer", async () => {
    let capturedHandler: (event: never) => Promise<{ systemPrompt: string }> = {} as never;
    const mockOn = vi.fn((_event: string, handler: typeof capturedHandler) => {
      capturedHandler = handler as never;
    });
    const mockPi = { on: mockOn } as never;
    codemanAgentExtension(mockPi);

    const event = {
      systemPrompt: "",
      systemPromptOptions: {},
      cwd: "/test/project",
    } as never;

    const result = await capturedHandler(event);
    expect(result.systemPrompt).toContain("codeman-agent");
    expect(result.systemPrompt).toContain("/test/project");
  });

  it("before_agent_start preserves existing system prompt", async () => {
    let capturedHandler: (event: never) => Promise<{ systemPrompt: string }> = {} as never;
    const mockOn = vi.fn((_event: string, handler: typeof capturedHandler) => {
      capturedHandler = handler as never;
    });
    const mockPi = { on: mockOn } as never;
    codemanAgentExtension(mockPi);

    const event = {
      systemPrompt: "",
      systemPromptOptions: { systemPrompt: "User custom prompt" },
      cwd: "/test",
    } as never;

    const result = await capturedHandler(event);
    expect(result.systemPrompt).toContain("User custom prompt");
    expect(result.systemPrompt).toContain("codeman-agent");
  });
});
