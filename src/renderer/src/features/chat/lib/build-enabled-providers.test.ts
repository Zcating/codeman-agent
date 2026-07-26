//! buildEnabledProviders unit tests.

import { describe, it, expect } from "vitest";
import { buildEnabledProviders } from "@codeman-frontend/features/chat/lib/build-enabled-providers";

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

  // Regression: providers persisted via legacy settings.json or seeded without
  // `label` would previously render as empty <Select.ItemText> spans in the
  // dropdown. UI must always have a non-empty label to show.
  it("falls back to model id when label is missing, empty, or whitespace-only", () => {
    const providers = [
      {
        id: "minimax",
        label: "MiniMax",
        enabled: true,
        llm: {
          models: [
            { id: "MiniMax-M3", label: "" },
            { id: "MiniMax-M2.7", label: "   " },
            { id: "MiniMax-M2.5-highspeed" /* label missing entirely */ } as {
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
