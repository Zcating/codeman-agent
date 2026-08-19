import { describe, expect, it } from "vitest";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { deriveToolSnippets } from "./build-tool-snippets";

describe("deriveToolSnippets", () => {
  it("returns empty array for empty input", () => {
    expect(deriveToolSnippets([])).toEqual([]);
  });

  it("derives name + description for single tool", () => {
    const tools: AgentTool[] = [{
      name: "x",
      label: "x",
      description: "tool x description",
      parameters: {} as AgentTool["parameters"],
      execute: async () => ({ content: [], details: undefined }),
    }];
    expect(deriveToolSnippets(tools)).toEqual([{ name: "x", summary: "tool x description" }]);
  });

  it("preserves order for multiple tools", () => {
    const tools: AgentTool[] = [
      { name: "a", label: "a", description: "first", parameters: {} as AgentTool["parameters"], execute: async () => ({ content: [], details: undefined }) },
      { name: "b", label: "b", description: "second", parameters: {} as AgentTool["parameters"], execute: async () => ({ content: [], details: undefined }) },
    ];
    const result = deriveToolSnippets(tools);
    expect(result.map((s) => s.name)).toEqual(["a", "b"]);
  });

  it("uses empty string for empty description", () => {
    const tools: AgentTool[] = [{
      name: "x",
      label: "x",
      description: "",
      parameters: {} as AgentTool["parameters"],
      execute: async () => ({ content: [], details: undefined }),
    }];
    expect(deriveToolSnippets(tools)).toEqual([{ name: "x", summary: "" }]);
  });
});
