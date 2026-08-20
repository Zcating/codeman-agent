import { describe, it, expect, vi } from "vitest";
import skillsExtension from "./skills-extension";

describe("skills-extension", () => {
  it("exports a function", () => {
    expect(typeof skillsExtension).toBe("function");
  });

  it("registers skill and skills-list commands", () => {
    const mockRegisterCommand = vi.fn();
    const mockPi = { registerCommand: mockRegisterCommand } as never;
    skillsExtension(mockPi);
    expect(mockRegisterCommand).toHaveBeenCalledTimes(2);
    const calls = (mockRegisterCommand as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toBe("skill");
    expect(calls[1][0]).toBe("skills-list");
  });
});
