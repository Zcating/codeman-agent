import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, within } from "@solidjs/testing-library";
import { Effect } from "effect";
import { SettingsTab } from "../settings-tab";
import type { SubAgentConfig } from "../../lib/sub-agent.types";

// Shared mock state
const mockState = {
  byId: {} as Record<string, SubAgentConfig>,
  allIds: [] as string[],
};

// Mock the subAgentsStore for testing
vi.mock("../../stores/sub-agents.store", () => ({
  subAgentsStore: {
    get state() { return mockState; },
    actions: {
      add: vi.fn().mockReturnValue(Effect.succeed({} as SubAgentConfig)),
      update: vi.fn().mockReturnValue(Effect.succeed({} as SubAgentConfig)),
      delete: vi.fn().mockReturnValue(Effect.succeed(undefined)),
      setEnabled: vi.fn().mockReturnValue(Effect.succeed({} as SubAgentConfig)),
    },
    _resetForTest: () => {
      mockState.byId = {};
      mockState.allIds = [];
    },
  },
}));

// Re-import after mocking
import { subAgentsStore } from "../../stores/sub-agents.store";

const SAMPLE_SUB_AGENTS: SubAgentConfig[] = [
  {
    id: "agent-001",
    name: "Researcher",
    description: "Research sub-agent for web search",
    systemPrompt: "You are a research assistant.",
    modelId: "MiniMax-M2.5-highspeed",
    thinkingLevel: "medium",
    allowedTools: ["webfetch", "read_file"],
    enabled: true,
    createdAt: 1234567890,
    updatedAt: 1234567890,
  },
  {
    id: "agent-002",
    name: "Coder",
    description: "Coding assistant sub-agent",
    systemPrompt: "You are a coding assistant.",
    modelId: "claude-3-5-sonnet",
    thinkingLevel: "high",
    allowedTools: ["read_file", "write_file", "grep"],
    enabled: false,
    createdAt: 1234567891,
    updatedAt: 1234567891,
  },
];

describe("SettingsTab", () => {
  beforeEach(() => {
    subAgentsStore._resetForTest();
  });

  it("renders list of sub-agents with name, description, model, tool count, and enabled toggle", () => {
    // Populate store
    for (const agent of SAMPLE_SUB_AGENTS) {
      subAgentsStore.state.byId[agent.id] = agent;
      subAgentsStore.state.allIds.push(agent.id);
    }

    render(() => <SettingsTab />);

    // Check first sub-agent
    const researcherRow = screen.getByTestId("sub-agent-row-agent-001");
    expect(within(researcherRow).getByText("Researcher")).toBeInTheDocument();
    expect(within(researcherRow).getByText("Research sub-agent for web search")).toBeInTheDocument();
    expect(within(researcherRow).getByText("MiniMax-M2.5-highspeed")).toBeInTheDocument();
    expect(within(researcherRow).getByText("2 tools")).toBeInTheDocument();

    // Check enabled toggle exists (checkbox role)
    const researcherToggle = within(researcherRow).getByRole("checkbox");
    expect(researcherToggle).toBeChecked();

    // Check second sub-agent
    const coderRow = screen.getByTestId("sub-agent-row-agent-002");
    expect(within(coderRow).getByText("Coder")).toBeInTheDocument();
    expect(within(coderRow).getByText("Coding assistant sub-agent")).toBeInTheDocument();
    expect(within(coderRow).getByText("claude-3-5-sonnet")).toBeInTheDocument();
    expect(within(coderRow).getByText("3 tools")).toBeInTheDocument();

    const coderToggle = within(coderRow).getByRole("checkbox");
    expect(coderToggle).not.toBeChecked();
  });

  it('has "+ Add sub-agent" button', () => {
    render(() => <SettingsTab />);
    expect(screen.getByTestId("add-sub-agent-button")).toBeInTheDocument();
  });

  it("each sub-agent row has edit and delete buttons", () => {
    for (const agent of SAMPLE_SUB_AGENTS) {
      subAgentsStore.state.byId[agent.id] = agent;
      subAgentsStore.state.allIds.push(agent.id);
    }

    render(() => <SettingsTab />);

    const researcherRow = screen.getByTestId("sub-agent-row-agent-001");
    expect(within(researcherRow).getByTestId("edit-sub-agent-agent-001")).toBeInTheDocument();
    expect(within(researcherRow).getByTestId("delete-sub-agent-agent-001")).toBeInTheDocument();

    const coderRow = screen.getByTestId("sub-agent-row-agent-002");
    expect(within(coderRow).getByTestId("edit-sub-agent-agent-002")).toBeInTheDocument();
    expect(within(coderRow).getByTestId("delete-sub-agent-agent-002")).toBeInTheDocument();
  });

  it("shows empty state when no sub-agents configured", () => {
    render(() => <SettingsTab />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByText("No sub-agents configured.")).toBeInTheDocument();
  });
});
