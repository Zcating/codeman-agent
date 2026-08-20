import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { SubAgentStream } from "./sub-agent-stream";
import type { DelegateStreamEntry } from "../stores/delegate-streams.store";

describe("SubAgentStream", () => {
  describe("status rendering", () => {
    it("shows spinner when status is running", () => {
      const entry: DelegateStreamEntry = {
        toolCallId: "tc-1",
        agentId: "sa-1",
        agentName: "Researcher",
        events: [],
        status: "running",
        startedAt: Date.now(),
      };

      render(() => <SubAgentStream entry={entry} />);

      const spinner = screen.getByTestId("sub-agent-spinner");
      expect(spinner).toBeInTheDocument();

      expect(screen.queryByTestId("sub-agent-completed")).not.toBeInTheDocument();
      expect(screen.queryByTestId("sub-agent-error")).not.toBeInTheDocument();
    });

    it("shows checkmark when status is completed", () => {
      const entry: DelegateStreamEntry = {
        toolCallId: "tc-1",
        agentId: "sa-1",
        agentName: "Researcher",
        events: [],
        status: "completed",
        startedAt: Date.now(),
        completedAt: Date.now(),
        finalText: "Research done!",
      };

      render(() => <SubAgentStream entry={entry} />);

      const completed = screen.getByTestId("sub-agent-completed");
      expect(completed).toBeInTheDocument();
    });

    it("shows error message when status is error", () => {
      const entry: DelegateStreamEntry = {
        toolCallId: "tc-1",
        agentId: "sa-1",
        agentName: "Researcher",
        events: [],
        status: "error",
        startedAt: Date.now(),
        completedAt: Date.now(),
        error: "Something went wrong",
      };

      render(() => <SubAgentStream entry={entry} />);

      const errorBadge = screen.getByTestId("sub-agent-error");
      expect(errorBadge).toBeInTheDocument();

      const content = screen.getByTestId("sub-agent-content");
      expect(content.textContent).toContain("Something went wrong");
    });
  });

  describe("finalText rendering", () => {
    it("displays finalText as markdown when completed", () => {
      const entry: DelegateStreamEntry = {
        toolCallId: "tc-1",
        agentId: "sa-1",
        agentName: "Researcher",
        events: [],
        status: "completed",
        startedAt: Date.now(),
        completedAt: Date.now(),
        finalText: "**Bold** and *italic* text",
      };

      render(() => <SubAgentStream entry={entry} />);

      const content = screen.getByTestId("sub-agent-content");
      expect(content.innerHTML).toContain("<strong>Bold</strong>");
      expect(content.innerHTML).toContain("<em>italic</em>");
    });
  });

  describe("sub-agent name display", () => {
    it("displays the sub-agent name", () => {
      const entry: DelegateStreamEntry = {
        toolCallId: "tc-1",
        agentId: "sa-1",
        agentName: "Coder",
        events: [],
        status: "running",
        startedAt: Date.now(),
      };

      render(() => <SubAgentStream entry={entry} />);

      expect(screen.getByText("Coder")).toBeInTheDocument();
    });
  });
});
