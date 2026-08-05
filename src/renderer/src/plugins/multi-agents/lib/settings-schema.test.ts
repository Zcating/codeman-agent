import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import { SubAgentFormSchema, SubAgentFormValues } from "./settings-schema";

const SAMPLE_FORM_VALUES: SubAgentFormValues = {
  name: "Researcher",
  description: "Web research sub-agent",
  systemPrompt: "You are a helpful research assistant.",
  modelId: "MiniMax-M2.5-highspeed",
  thinkingLevel: "medium",
  allowedTools: ["webfetch", "search_files"],
  enabled: true,
};

describe("SubAgentFormSchema", () => {
  it("parses a valid SubAgentFormValues", () => {
    const result = Schema.decodeUnknownEither(SubAgentFormSchema)(SAMPLE_FORM_VALUES);
    expect(result._tag).toBe("Right");
    if (result._tag === "Right") {
      expect(result.right).toEqual(SAMPLE_FORM_VALUES);
    }
  });

  it("round-trips through encode then decode", () => {
    const encoded = Schema.encodeEither(SubAgentFormSchema)(SAMPLE_FORM_VALUES);
    expect(encoded._tag).toBe("Right");
    if (encoded._tag === "Right") {
      const decoded = Schema.decodeUnknownEither(SubAgentFormSchema)(encoded.right);
      expect(decoded._tag).toBe("Right");
      if (decoded._tag === "Right") {
        expect(decoded.right).toEqual(SAMPLE_FORM_VALUES);
      }
    }
  });

  it("rejects non-literal thinkingLevel", () => {
    const invalid = { ...SAMPLE_FORM_VALUES, thinkingLevel: "superfast" as const };
    const result = Schema.decodeUnknownEither(SubAgentFormSchema)(invalid);
    expect(result._tag).toBe("Left");
  });

  it("allowedTools accepts empty array", () => {
    const withEmptyTools = { ...SAMPLE_FORM_VALUES, allowedTools: [] };
    const result = Schema.decodeUnknownEither(SubAgentFormSchema)(withEmptyTools);
    expect(result._tag).toBe("Right");
    if (result._tag === "Right") {
      expect(result.right.allowedTools).toEqual([]);
    }
  });

  it("schema does not include id, createdAt, updatedAt fields", () => {
    const invalid = {
      ...SAMPLE_FORM_VALUES,
      id: "agent-001",
      createdAt: 1234567890,
      updatedAt: 1234567890,
    };
    // Should still parse successfully - id/createdAt/updatedAt are ignored
    const result = Schema.decodeUnknownEither(SubAgentFormSchema)(invalid);
    expect(result._tag).toBe("Right");
    if (result._tag === "Right") {
      // These fields should not be present in the parsed result
      expect((result.right as any).id).toBeUndefined();
      expect((result.right as any).createdAt).toBeUndefined();
      expect((result.right as any).updatedAt).toBeUndefined();
    }
  });
});
