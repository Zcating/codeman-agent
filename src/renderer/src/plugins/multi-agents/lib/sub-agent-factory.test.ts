import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ProviderConfig } from "@codeman-frontend/features/chat/lib/runtime";
import { createSubAgent } from "./sub-agent-factory";

// Capture initialState passed to Agent constructor
let capturedInitialState: {
  systemPrompt: string;
  model: { id: string };
  thinkingLevel: string;
  tools: AgentTool[];
  messages: unknown[];
} | null = null;

vi.mock("@earendil-works/pi-agent-core", () => {
  return {
    Agent: vi.fn().mockImplementation(function _MockAgent(config: {
      initialState: typeof capturedInitialState;
    }) {
      capturedInitialState = config.initialState as typeof capturedInitialState;
      return { state: capturedInitialState };
    }),
  };
});

const SAMPLE_CONFIG = {
  id: "agent-001" as const,
  name: "Researcher",
  description: "Research sub-agent",
  systemPrompt: "You are a helpful research assistant.",
  modelId: "MiniMax-M2.5-highspeed",
  thinkingLevel: "high" as const,
  allowedTools: ["webfetch", "search_files"],
  enabled: true,
  createdAt: 1234567890,
  updatedAt: 1234567890,
};

const SAMPLE_PROVIDER: ProviderConfig = {
  id: "minimax",
  models: [
    { id: "MiniMax-M2.5-highspeed", label: "MiniMax M2.5", contextWindow: 200_000, deprecated: false, thinking: false },
  ],
  apiKey: "test-key",
  baseUrl: "https://api.minimaxi.com/anthropic",
  defaultModel: "MiniMax-M2.5-highspeed",
  systemPrompt: "",
  tools: [],
};

const makeMockTool = (name: string): AgentTool => ({
  name,
  description: `Tool: ${name}`,
  parameters: { type: "object", properties: {} } as AgentTool["parameters"],
  execute: vi.fn(),
});

describe("sub-agent-factory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedInitialState = null;
  });

  it("sets systemPrompt from config", () => {
    const toolRegistry = new Map<string, AgentTool>();
    createSubAgent(SAMPLE_CONFIG, SAMPLE_PROVIDER, toolRegistry);
    expect(capturedInitialState?.systemPrompt).toBe(SAMPLE_CONFIG.systemPrompt);
  });

  it("sets model id from config.modelId", () => {
    const toolRegistry = new Map<string, AgentTool>();
    createSubAgent(SAMPLE_CONFIG, SAMPLE_PROVIDER, toolRegistry);
    expect(capturedInitialState?.model.id).toBe(SAMPLE_CONFIG.modelId);
  });

  it("sets thinkingLevel from config", () => {
    const toolRegistry = new Map<string, AgentTool>();
    createSubAgent(SAMPLE_CONFIG, SAMPLE_PROVIDER, toolRegistry);
    expect(capturedInitialState?.thinkingLevel).toBe(SAMPLE_CONFIG.thinkingLevel);
  });

  it("filters tools to only allowedTools", () => {
    const toolRegistry = new Map<string, AgentTool>([
      ["webfetch", makeMockTool("webfetch")],
      ["search_files", makeMockTool("search_files")],
      ["run_command", makeMockTool("run_command")],
      ["delegate_task", makeMockTool("delegate_task")],
    ]);
    createSubAgent(SAMPLE_CONFIG, SAMPLE_PROVIDER, toolRegistry);
    expect(capturedInitialState?.tools).toHaveLength(SAMPLE_CONFIG.allowedTools.length);
    expect(capturedInitialState?.tools.map((t) => t.name).sort()).toEqual(
      [...SAMPLE_CONFIG.allowedTools].sort(),
    );
  });

  it("does NOT include delegate_task in tools even if allowedTools contains it or registry has it", () => {
    const toolRegistry = new Map<string, AgentTool>([
      ["webfetch", makeMockTool("webfetch")],
      ["delegate_task", makeMockTool("delegate_task")],
    ]);
    const configWithDelegate = { ...SAMPLE_CONFIG, allowedTools: ["webfetch", "delegate_task"] as readonly string[] };
    createSubAgent(configWithDelegate, SAMPLE_PROVIDER, toolRegistry);
    const toolNames = capturedInitialState?.tools.map((t) => t.name) ?? [];
    expect(toolNames).not.toContain("delegate_task");
  });
});
