import { describe, it, expect, vi, beforeEach } from "vitest";
import { confirmIfRisky } from "./confirm.js";

const { mockShowMessageBox, capturedOptions } = vi.hoisted(() => {
  const capturedOptions = { value: null as any };
  const mockShowMessageBox = vi.fn();
  return { mockShowMessageBox, capturedOptions };
});

vi.mock("electron", () => ({
  dialog: { showMessageBox: mockShowMessageBox },
}));

describe("confirmIfRisky", () => {
  beforeEach(() => {
    capturedOptions.value = null;
    mockShowMessageBox.mockReset();
    mockShowMessageBox.mockImplementation(async (options: any) => {
      capturedOptions.value = options;
      return { response: 1 };
    });
  });

  it("high-risk + user denies returns 'deny'", async () => {
    // beforeEach already sets mockImplementation returning { response: 1 }
    const result = await confirmIfRisky({
      command: "rm -rf /tmp",
      cwd: "C:\\work",
      risk: {
        kind: "high",
        reasons: [
          { tag: "dangerousCommand", message: "rm" },
          { tag: "destructiveFlag", message: "-rf" },
        ],
        needsModelFallback: false,
      },
    });

    expect(result).toBe("deny");
  });

  it("low-risk returns 'allow' without calling dialog", async () => {
    const result = await confirmIfRisky({
      command: "git status",
      cwd: "C:\\work",
      risk: { kind: "low", reasons: [], needsModelFallback: false },
    });

    expect(result).toBe("allow");
    expect(mockShowMessageBox).not.toHaveBeenCalled();
  });

  it("dialog content includes command, cwd, category, reason", async () => {
    await confirmIfRisky({
      command: "rm -rf /tmp",
      cwd: "C:\\work",
      risk: {
        kind: "high",
        reasons: [
          { tag: "dangerousCommand", message: "rm" },
          { tag: "destructiveFlag", message: "-rf" },
        ],
        needsModelFallback: false,
      },
    });

    expect(capturedOptions.value).toBeDefined();
    expect(capturedOptions.value.message).toBe("rm -rf /tmp");
    expect(capturedOptions.value.detail).toContain("C:\\work");
    expect(capturedOptions.value.detail).toContain("high");
    expect(capturedOptions.value.detail).toContain("dangerousCommand");
  });
});
