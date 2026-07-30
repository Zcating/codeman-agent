import { describe, expect, it } from "vitest";
import {
  SIDEBAR_TRANSITION_MS,
  SIDEBAR_KEYBOARD_SHORTCUT,
} from "@codeman-frontend/shared/lib/design-tokens";

describe("design-tokens", () => {
  it("SIDEBAR_TRANSITION_MS is 200 (milliseconds, snappy)", () => {
    expect(SIDEBAR_TRANSITION_MS).toBe(200);
  });

  it("SIDEBAR_KEYBOARD_SHORTCUT is 'b' (toggle key, reserved for V2.2)", () => {
    expect(SIDEBAR_KEYBOARD_SHORTCUT).toBe("b");
  });

  it("constants are typed as their inferred primitive types", () => {
    expect(typeof SIDEBAR_TRANSITION_MS).toBe("number");
    expect(typeof SIDEBAR_KEYBOARD_SHORTCUT).toBe("string");
  });
});
