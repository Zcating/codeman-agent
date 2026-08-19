import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentTool, AgentEvent } from "@earendil-works/pi-agent-core";
import type { ProviderConfig } from "@codeman-frontend/core/llm/runtime";
import type { SubAgentConfig } from "@codeman-frontend/shared/lib/sub-agent-schema";
import { buildDelegateTaskTool } from "./delegate-task-tool";

// Mock Agent from pi-agent-core
let capturedAgentConfig: {
  initialState: {
    systemPrompt: string;
    model: unknown;
    thinkingLevel: string;
    tools: AgentTool[];
    messages: unknown[];
  };
} | null = null;

vi.mock("@earendil-works/pi-agent-core", () => ({
  Agent: vi.fn().mockImplementation(function _MockAgent(config: typeof capturedAgentConfig) {
    capturedAgentConfig = config as typeof capturedAgentConfig;
    return {
      state: capturedAgentConfig!.initialState,
      prompt: vi.fn().mockImplementation(async () => ({
        stopReason: "stop" as const,
        content: [{ type: "text" as const, text: "Research result: AI is great." }],
        usage: { inputTokens: 100, outputTokens: 50 },
        errorMessage: null,
      })),
      subscribe: vi.fn(() => vi.fn()),
      abort: vi.fn(),
    };
  }),
}));

const SAMPLE_CONFIG: SubAgentConfig = {
  id: "agent-001" as SubAgentConfig["id"],
  name: "Researcher",
  description: "Research sub-agent",
  systemPrompt: "You are a helpful research assistant.",
  modelId: "MiniMax-M2.5-highspeed",
  thinkingLevel: "medium",
  allowedTools: ["webfetch", "search_files"],
  enabled: true,
  createdAt: 1234567890,
  updatedAt: 1234567890,
};

const SAMPLE_PROVIDER: ProviderConfig = {
  id: "minimax",
  models: [
    { id: "MiniMax-M2.5-highspeed", label: "MiniMax M2.5", contextWindow: 200_000, thinking: false },
  ],
  apiKey: "test-key",
  baseUrl: "https://api.minimaxi.com/anthropic",
  defaultModel: "MiniMax-M2.5-highspeed",
  systemPrompt: "",
  tools: [],
};

const makeMockTool = (name: string): AgentTool => ({
  label: name,
  name,
  description: `Tool: ${name}`,
  parameters: { type: "object", properties: {} } as AgentTool["parameters"],
  execute: vi.fn(),
});

const SAMPLE_TOOL_REGISTRY = new Map<string, AgentTool>([
  ["webfetch", makeMockTool("webfetch")],
  ["search_files", makeMockTool("search_files")],
  ["delegate_task", makeMockTool("delegate_task")],
]);

const NOOP_STREAM = (_evt: AgentEvent, _toolCallId: string, _subAgentId: string) => {};

describe("delegate-task-tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedAgentConfig = null;
  });

  it("tool name is delegate_task", () => {
    const tool = buildDelegateTaskTool([], SAMPLE_PROVIDER, SAMPLE_TOOL_REGISTRY, NOOP_STREAM);
    expect(tool.name).toBe("delegate_task");
  });

  it("description embeds enabled sub-agent names", () => {
    const tool = buildDelegateTaskTool([SAMPLE_CONFIG], SAMPLE_PROVIDER, SAMPLE_TOOL_REGISTRY, NOOP_STREAM);
    expect(tool.description).toContain("Researcher");
    expect(tool.description).toContain("Research sub-agent");
  });

  it("parameters includes agent_name and task fields", () => {
    const tool = buildDelegateTaskTool([SAMPLE_CONFIG], SAMPLE_PROVIDER, SAMPLE_TOOL_REGISTRY, NOOP_STREAM);
    expect(tool.parameters).toBeDefined();
    const params = tool.parameters as { type: string; properties: Record<string, unknown> };
    expect(params.properties.agent_name).toBeDefined();
    expect(params.properties.task).toBeDefined();
  });

  it("execute throws for unknown agent_name", async () => {
    const tool = buildDelegateTaskTool([SAMPLE_CONFIG], SAMPLE_PROVIDER, SAMPLE_TOOL_REGISTRY, NOOP_STREAM);
    await expect(
      tool.execute("call-1", { agent_name: "UnknownAgent", task: "do something" }, new AbortController().signal),
    ).rejects.toThrow();
  });

  it("execute returns text content with details for valid agent", async () => {
    const tool = buildDelegateTaskTool([SAMPLE_CONFIG], SAMPLE_PROVIDER, SAMPLE_TOOL_REGISTRY, NOOP_STREAM);
    const result = await tool.execute(
      "call-1",
      { agent_name: "Researcher", task: "research AI" },
      new AbortController().signal,
    );
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: "text", text: "Research result: AI is great." });
    expect(result.details).toMatchObject({
      subAgentId: "agent-001",
      subAgentName: "Researcher",
      model: "MiniMax-M2.5-highspeed",
    });
  });

  it("sub-agent is created WITHOUT delegate_task in tools", async () => {
    const tool = buildDelegateTaskTool([SAMPLE_CONFIG], SAMPLE_PROVIDER, SAMPLE_TOOL_REGISTRY, NOOP_STREAM);
    await tool.execute(
      "call-1",
      { agent_name: "Researcher", task: "research AI" },
      new AbortController().signal,
    );
    // Verify the Agent constructor was called (via capturedAgentConfig)
    expect(capturedAgentConfig).not.toBeNull();
    // Check that captured config has no delegate_task
    expect(capturedAgentConfig?.initialState.tools.map((t: AgentTool) => t.name)).not.toContain("delegate_task");
  });
});
