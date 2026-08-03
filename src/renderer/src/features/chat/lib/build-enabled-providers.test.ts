
import { describe, it, expect } from "vitest";
import { buildEnabledProviders } from "@codeman-frontend/features/chat/lib/build-enabled-providers";

describe("buildEnabledProviders", () => {
  it("returns array of providers with llm config", () => {
    const providers = [
      {
        id: "minimax",
        label: "MiniMax",
        llm: {
          models: [
            { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed" },
          ],
        },
      },
      {
        id: "deepseek",
        label: "DeepSeek",
        llm: {
          models: [{ id: "deepseek-chat", label: "deepseek-chat" }],
        },
      },
      {
        id: "disabled",
        label: "Disabled Provider",
        llm: {
          models: [{ id: "some-model", label: "Some Model" }],
        },
      },
      {
        id: "no-llm",
        label: "No LLM Config",
        llm: undefined,
      },
    ];
    const result = buildEnabledProviders(providers);
    expect(result).toEqual([
      {
        id: "minimax",
        label: "MiniMax",
        models: [{ id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed" }],
      },
      {
        id: "deepseek",
        label: "DeepSeek",
        models: [{ id: "deepseek-chat", label: "deepseek-chat" }],
      },
      {
        id: "disabled",
        label: "Disabled Provider",
        models: [{ id: "some-model", label: "Some Model" }],
      },
    ]);
  });

  it("returns empty array when given empty array", () => {
    const result = buildEnabledProviders([]);
    expect(result).toEqual([]);
  });

  it("falls back to model id when label is missing, empty, or whitespace-only", () => {
    const providers = [
      {
        id: "minimax",
        label: "MiniMax",
        llm: {
          models: [
            { id: "MiniMax-M3", label: "" },
            { id: "MiniMax-M2.7", label: "   " },
            { id: "MiniMax-M2.5-highspeed"  } as {
              id: string;
              label: string;
            },
            { id: "MiniMax-M2.1", label: "M2.1 (Legacy Name)" },
          ],
        },
      },
    ];
    const result = buildEnabledProviders(providers);
    expect(result[0].models).toEqual([
      { id: "MiniMax-M3", label: "MiniMax-M3" },
      { id: "MiniMax-M2.7", label: "MiniMax-M2.7" },
      { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed" },
      { id: "MiniMax-M2.1", label: "M2.1 (Legacy Name)" },
    ]);
  });
});
