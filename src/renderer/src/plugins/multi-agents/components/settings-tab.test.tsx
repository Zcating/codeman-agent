import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, within } from "@solidjs/testing-library";
import { Effect } from "effect";
import { SettingsTab } from "./settings-tab";
import type { SubAgentConfig } from "../lib/sub-agent.types";

// Shared mock state
const mockState = {
  byId: {} as Record<string, SubAgentConfig>,
  allIds: [] as string[],
};

// Mock the subAgentsStore for testing
vi.mock("../stores/sub-agents.store", () => ({
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
import { subAgentsStore } from "../stores/sub-agents.store";

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
    vi.clearAllMocks();
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

  describe("SubAgentFormDialog implementation verification", () => {
    it("settings-tab.tsx does not contain ref bindings for form fields", () => {
      const fs = require("fs");
      const path = require("path");
      const settingsTabPath = path.join(__dirname, "./settings-tab.tsx");
      const content = fs.readFileSync(settingsTabPath, "utf-8");

      // These patterns should NOT exist in the file
      expect(content).not.toMatch(/ref=\{\s*nameField\s*\}/);
      expect(content).not.toMatch(/ref=\{\s*descField\s*\}/);
      expect(content).not.toMatch(/ref=\{\s*promptField\s*\}/);
      expect(content).not.toMatch(/ref=\{\s*modelField\s*\}/);
      expect(content).not.toMatch(/ref=\{\s*thinkingField\s*\}/);
    });

    it("settings-tab.tsx does not contain null as unknown as SubAgentFormValues cast at call sites", () => {
      const fs = require("fs");
      const path = require("path");
      const settingsTabPath = path.join(__dirname, "./settings-tab.tsx");
      const content = fs.readFileSync(settingsTabPath, "utf-8");

      expect(content).not.toMatch(/null as unknown as SubAgentFormValues/);
    });

    it("settings-tab.tsx imports createForm from @tanstack/solid-form", () => {
      const fs = require("fs");
      const path = require("path");
      const settingsTabPath = path.join(__dirname, "./settings-tab.tsx");
      const content = fs.readFileSync(settingsTabPath, "utf-8");

      expect(content).toMatch(/import\s+\{\s*createForm\s+\}\s+from\s+["']@tanstack\/solid-form["']/);
    });

    it("settings-tab.tsx uses CodemanInput, CodemanSelect, and CodemanCheckbox components", () => {
      const fs = require("fs");
      const path = require("path");
      const settingsTabPath = path.join(__dirname, "./settings-tab.tsx");
      const content = fs.readFileSync(settingsTabPath, "utf-8");

      expect(content).toMatch(/CodemanInput/);
      expect(content).toMatch(/CodemanSelect/);
      expect(content).toMatch(/CodemanCheckbox/);
    });

    it("settings-tab.tsx imports effectSchema for form validation", () => {
      const fs = require("fs");
      const path = require("path");
      const settingsTabPath = path.join(__dirname, "./settings-tab.tsx");
      const content = fs.readFileSync(settingsTabPath, "utf-8");

      expect(content).toMatch(/effectSchema/);
    });

    it("settings-tab.tsx uses createForm with SubAgentFormSchema validator", () => {
      const fs = require("fs");
      const path = require("path");
      const settingsTabPath = path.join(__dirname, "./settings-tab.tsx");
      const content = fs.readFileSync(settingsTabPath, "utf-8");

      expect(content).toMatch(/createForm/);
      expect(content).toMatch(/SubAgentFormSchema/);
      expect(content).toMatch(/effectSchema\(SubAgentFormSchema\)/);
    });
  });
});
