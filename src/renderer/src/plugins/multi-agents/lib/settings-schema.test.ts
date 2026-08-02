import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import { SubAgentConfigSchema, type SubAgentConfig } from "./sub-agent.types";

const SAMPLE_CONFIG: SubAgentConfig = {
  id: "agent-001" as SubAgentConfig["id"],
  name: "Researcher",
  description: "Web research sub-agent",
  systemPrompt: "You are a helpful research assistant.",
  modelId: "MiniMax-M2.5-highspeed",
  thinkingLevel: "medium",
  allowedTools: ["webfetch", "search_files"],
  enabled: true,
  createdAt: 1234567890,
  updatedAt: 1234567890,
};

describe("SubAgentConfig schema", () => {
  it("decodes a valid SubAgentConfig", () => {
    const result = Schema.decodeUnknownEither(SubAgentConfigSchema)(SAMPLE_CONFIG);
    expect(result._tag).toBe("Right");
    if (result._tag === "Right") {
      expect(result.right).toEqual(SAMPLE_CONFIG);
    }
  });

  it("round-trips through encode then decode", () => {
    const encoded = Schema.encodeEither(SubAgentConfigSchema)(SAMPLE_CONFIG);
    expect(encoded._tag).toBe("Right");
    if (encoded._tag === "Right") {
      const decoded = Schema.decodeUnknownEither(SubAgentConfigSchema)(encoded.right);
      expect(decoded._tag).toBe("Right");
      if (decoded._tag === "Right") {
        expect(decoded.right).toEqual(SAMPLE_CONFIG);
      }
    }
  });

  it("rejects missing required fields", () => {
    const invalid = { name: "test" } as unknown;
    const result = Schema.decodeUnknownEither(SubAgentConfigSchema)(invalid);
    expect(result._tag).toBe("Left");
  });

  it("rejects invalid thinkingLevel", () => {
    const invalid = { ...SAMPLE_CONFIG, thinkingLevel: "superfast" };
    const result = Schema.decodeUnknownEither(SubAgentConfigSchema)(invalid);
    expect(result._tag).toBe("Left");
  });

  it("rejects non-array allowedTools", () => {
    const invalid = { ...SAMPLE_CONFIG, allowedTools: "not-an-array" };
    const result = Schema.decodeUnknownEither(SubAgentConfigSchema)(invalid);
    expect(result._tag).toBe("Left");
  });
});
