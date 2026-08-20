import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { ParallelPanel } from "./parallel-panel";
import type { DelegateStreamEntry } from "../stores/delegate-streams.store";

function makeEntry(
  toolCallId: string,
  agentName: string,
  status: "running" | "completed" | "error",
): DelegateStreamEntry {
  return {
    toolCallId,
    agentId: `sa-${toolCallId}`,
    agentName,
    events: [],
    status,
    startedAt: Date.now(),
    ...(status === "completed"
      ? { completedAt: Date.now(), finalText: "Done!" }
      : status === "error"
        ? { completedAt: Date.now(), error: "Failed" }
        : {}),
  };
}

describe("ParallelPanel", () => {
  describe("grid layout", () => {
    it("renders 1 column when given 1 entry", () => {
      const entries: DelegateStreamEntry[] = [makeEntry("tc-1", "Researcher", "running")];

      render(() => <ParallelPanel entries={entries} />);

      const panel = screen.getByTestId("parallel-panel");
      expect(panel).toBeInTheDocument();

      const columns = screen.getAllByTestId(/^sub-agent-stream-/);
      expect(columns).toHaveLength(1);
    });

    it("renders 3 columns when given 3 entries", () => {
      const entries: DelegateStreamEntry[] = [
        makeEntry("tc-1", "Researcher", "running"),
        makeEntry("tc-2", "Coder", "running"),
        makeEntry("tc-3", "Reviewer", "running"),
      ];

      render(() => <ParallelPanel entries={entries} />);

      const columns = screen.getAllByTestId(/^sub-agent-stream-/);
      expect(columns).toHaveLength(3);
    });
  });

  describe("renders correct entry statuses", () => {
    it("shows running spinner for running entries", () => {
      const entries: DelegateStreamEntry[] = [makeEntry("tc-1", "Researcher", "running")];

      render(() => <ParallelPanel entries={entries} />);

      expect(screen.getByTestId("sub-agent-spinner")).toBeInTheDocument();
    });

    it("shows completed badge for completed entries", () => {
      const entries: DelegateStreamEntry[] = [makeEntry("tc-1", "Researcher", "completed")];

      render(() => <ParallelPanel entries={entries} />);

      expect(screen.getByTestId("sub-agent-completed")).toBeInTheDocument();
    });
  });
});
