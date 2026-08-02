import { describe, it, expect } from "vitest";
import { assessRisk } from "./risk.js";

describe("assessRisk", () => {
  it("high risk by command + flag", () => {
    const result = assessRisk({ command: "rm -rf /tmp", cwd: "C:\\work" });
    expect(result.kind).toBe("high");
    const tags = result.reasons.map((r) => r.tag);
    expect(tags.some((t) => t === "dangerousCommand" || t === "destructiveFlag")).toBe(true);
    expect(tags.some((t) => t === "destructiveFlag" || t === "dangerousCommand")).toBe(true);
    // Check both rm and -rf are represented
    const messages = result.reasons.map((r) => r.message.toLowerCase());
    const hasRmReason = messages.some((m) => m.includes("rm"));
    const hasRfReason = messages.some((m) => m.includes("-rf") || m.includes("recursive"));
    expect(hasRmReason).toBe(true);
    expect(hasRfReason).toBe(true);
  });

  it("parse failure fallback", () => {
    const result = assessRisk({ command: 'echo "unclosed quote', cwd: "C:\\work" });
    expect(result.needsModelFallback).toBe(true);
    expect(result.reasons.some((r) => r.tag === "parseFailure")).toBe(true);
  });
});
