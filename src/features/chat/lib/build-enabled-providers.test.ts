//! buildEnabledProviders unit tests.

import { describe, it, expect } from "vitest";
import { buildEnabledProviders } from "./build-enabled-providers";

describe("buildEnabledProviders", () => {
  it("returns array of providers where enabled && llm is true", () => {
    const providers = [
      {
        id: "minimax",
        label: "MiniMax",
        enabled: true,
        llm: {
          models: [
            { id: "MiniMax-M2.5-highspeed", label: "MiniMax-M2.5-highspeed" },
          ],
        },
      },
      {
        id: "deepseek",
        label: "DeepSeek",
        enabled: true,
        llm: {
          models: [{ id: "deepseek-chat", label: "deepseek-chat" }],
        },
      },
      {
        id: "disabled",
        label: "Disabled Provider",
        enabled: false,
        llm: {
          models: [{ id: "some-model", label: "Some Model" }],
        },
      },
      {
        id: "no-llm",
        label: "No LLM Config",
        enabled: true,
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
    ]);
  });

  it("returns empty array when given empty array", () => {
    const result = buildEnabledProviders([]);
    expect(result).toEqual([]);
  });
});
