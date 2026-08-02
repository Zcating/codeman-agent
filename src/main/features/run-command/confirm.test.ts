import { describe, it, expect, vi, beforeEach } from "vitest";
import { confirmIfRisky } from "./confirm.js";

const { mockShowMessageBox } = vi.hoisted(() => ({
  mockShowMessageBox: vi.fn(),
}));

vi.mock("electron", () => ({
  dialog: { showMessageBox: mockShowMessageBox },
}));

describe("confirmIfRisky", () => {
  beforeEach(() => {
    mockShowMessageBox.mockReset();
  });

  it("high-risk + user denies returns 'deny'", async () => {
    mockShowMessageBox.mockResolvedValue({ response: 1 }); // deny

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
});
