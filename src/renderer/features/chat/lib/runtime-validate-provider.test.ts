import { describe, it, expect } from "vitest";
import { validateProvider } from "./runtime-validate-provider";
import type { ProviderConfig } from "./runtime";

const makeProvider = (overrides: Partial<ProviderConfig> = {}): ProviderConfig => ({
  apiKey: "",
  baseUrl: "https://api.anthropic.com",
  defaultModel: "claude-sonnet-4-20250514",
  systemPrompt: "You are helpful.",
  tools: [],
  ...overrides,
});

describe("validateProvider", () => {
  it("returns ok:false for empty string defaultModel", () => {
    const cfg = makeProvider({ defaultModel: "" });
    const result = validateProvider(cfg);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("defaultModel");
    }
  });

  it("returns ok:false for whitespace-only defaultModel", () => {
    const cfg = makeProvider({ defaultModel: "   " });
    const result = validateProvider(cfg);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("defaultModel");
    }
  });

  it("returns ok:false for tab/newline whitespace defaultModel", () => {
    const cfg = makeProvider({ defaultModel: "\t\n" });
    const result = validateProvider(cfg);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("defaultModel");
    }
  });

  it("returns ok:true for valid model id", () => {
    const cfg = makeProvider({ defaultModel: "claude-sonnet-4-20250514" });
    const result = validateProvider(cfg);
    expect(result.ok).toBe(true);
  });

  it("returns ok:true for model id with leading/trailing whitespace (trimmed before check)", () => {
    const cfg = makeProvider({ defaultModel: "  claude-sonnet-4-20250514  " });
    const result = validateProvider(cfg);
    expect(result.ok).toBe(true);
  });

  it("ignores other fields - apiKey does not affect result", () => {
    const cfg = makeProvider({ apiKey: "" });
    expect(validateProvider(cfg).ok).toBe(true);
  });

  it("ignores other fields - baseUrl does not affect result", () => {
    const cfg = makeProvider({ baseUrl: "" });
    expect(validateProvider(cfg).ok).toBe(true);
  });

  it("ignores other fields - systemPrompt does not affect result", () => {
    const cfg = makeProvider({ systemPrompt: "" });
    expect(validateProvider(cfg).ok).toBe(true);
  });

  it("ignores other fields - tools does not affect result", () => {
    const cfg = makeProvider({ tools: [] });
    expect(validateProvider(cfg).ok).toBe(true);
  });

  it("ignores other fields - workspaceId does not affect result", () => {
    const cfg = makeProvider({ workspaceId: undefined });
    expect(validateProvider(cfg).ok).toBe(true);
  });
});
