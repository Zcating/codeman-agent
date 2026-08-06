import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { SubAgentStream } from "./sub-agent-stream";
import type { SubAgentStreamEntry } from "../stores/sub-agents-stream.store";

describe("SubAgentStream", () => {
  describe("status rendering", () => {
    it("shows spinner when status is running", () => {
      const entry: SubAgentStreamEntry = {
        toolCallId: "tc-1",
        subAgentId: "sa-1",
        subAgentName: "Researcher",
        events: [],
        status: "running",
        startedAt: Date.now(),
      };

      render(() => <SubAgentStream entry={entry} />);

      // Should have a spinner
      const spinner = screen.getByTestId("sub-agent-spinner");
      expect(spinner).toBeInTheDocument();

      // Should not show completed or error states
      expect(screen.queryByTestId("sub-agent-completed")).not.toBeInTheDocument();
      expect(screen.queryByTestId("sub-agent-error")).not.toBeInTheDocument();
    });

    it("shows checkmark when status is completed", () => {
      const entry: SubAgentStreamEntry = {
        toolCallId: "tc-1",
        subAgentId: "sa-1",
        subAgentName: "Researcher",
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
      const entry: SubAgentStreamEntry = {
        toolCallId: "tc-1",
        subAgentId: "sa-1",
        subAgentName: "Researcher",
        events: [],
        status: "error",
        startedAt: Date.now(),
        completedAt: Date.now(),
        error: "Something went wrong",
      };

      render(() => <SubAgentStream entry={entry} />);

      // Error badge should be visible
      const errorBadge = screen.getByTestId("sub-agent-error");
      expect(errorBadge).toBeInTheDocument();

      // Error content should show the error message
      const content = screen.getByTestId("sub-agent-content");
      expect(content.textContent).toContain("Something went wrong");
    });
  });

  describe("finalText rendering", () => {
    it("displays finalText as markdown when completed", () => {
      const entry: SubAgentStreamEntry = {
        toolCallId: "tc-1",
        subAgentId: "sa-1",
        subAgentName: "Researcher",
        events: [],
        status: "completed",
        startedAt: Date.now(),
        completedAt: Date.now(),
        finalText: "**Bold** and *italic* text",
      };

      render(() => <SubAgentStream entry={entry} />);

      // finalText should be rendered as markdown (innerHTML)
      const content = screen.getByTestId("sub-agent-content");
      expect(content.innerHTML).toContain("<strong>Bold</strong>");
      expect(content.innerHTML).toContain("<em>italic</em>");
    });
  });

  describe("sub-agent name display", () => {
    it("displays the sub-agent name", () => {
      const entry: SubAgentStreamEntry = {
        toolCallId: "tc-1",
        subAgentId: "sa-1",
        subAgentName: "Coder",
        events: [],
        status: "running",
        startedAt: Date.now(),
      };

      render(() => <SubAgentStream entry={entry} />);

      expect(screen.getByText("Coder")).toBeInTheDocument();
    });
  });
});
