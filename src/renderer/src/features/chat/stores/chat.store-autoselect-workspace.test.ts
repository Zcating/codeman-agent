
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRoot } from "solid-js";
import { Effect, Layer } from "effect";
import type { Workspace } from "@codeman-frontend/shared/lib/types";
import {
  workspaces$,
  selectedWorkspaceId$,
  setSelectedWorkspaceId,
  loadWorkspaces,
} from "@codeman-frontend/features/chat/stores/chat.store";


const mockList = vi.hoisted(() => ({ workspaces: [] as Workspace[] }));

vi.mock("../../../shared/lib/workspace-service", async () => {
  const { Effect: E } = await import("effect");
  const actual = await vi.importActual<typeof import("../../../shared/lib/workspace-service")>(
    "../../../shared/lib/workspace-service",
  );
  return {
    WorkspaceService: actual.WorkspaceService,
    WorkspaceServiceLive: Layer.succeed(actual.WorkspaceService, {
      list: () => E.succeed(mockList.workspaces),
      add: (_label: string, _rootPath: string) =>
        E.succeed({
          id: "ws-new",
          label: _label,
          rootPath: _rootPath,
          createdAt: 99,
          updatedAt: 99,
        } as Workspace),
      rename: () => E.void,
      remove: () => E.void,
      pickPath: () => E.succeed("/picked/path"),
    }),
  };
});

const ws = (id: string, label: string, rootPath: string): Workspace => ({
  id,
  label,
  rootPath,
  createdAt: 1,
});

describe("chat.store — loadWorkspaces auto-select invariant (regression for H2 fix)", () => {
  beforeEach(() => {
    setSelectedWorkspaceId(null);
    mockList.workspaces = [];
  });

  it("A. 0 workspaces → selectedWorkspaceId$ stays null (HomeAgentForm disabled, by design)", async () => {
    mockList.workspaces = [];
    await createRoot(async (dispose) => {
      await Effect.runPromiseExit(loadWorkspaces());

      expect(workspaces$().length).toBe(0);
      expect(selectedWorkspaceId$()).toBeNull();
      dispose();
    });
  });

  it("B. 1 workspace → selectedWorkspaceId$ auto-set to that workspace (HomeAgentForm enabled, by design)", async () => {
    mockList.workspaces = [ws("ws-only", "MyProject", "C:\\projects\\myproj")];
    await createRoot(async (dispose) => {
      await Effect.runPromiseExit(loadWorkspaces());

      expect(workspaces$().length).toBe(1);
      expect(selectedWorkspaceId$()).toBe("ws-only");
      dispose();
    });
  });

  it("C. 2+ workspaces → selectedWorkspaceId$ stays null (HomeAgentForm disabled until user picks)", async () => {
    mockList.workspaces = [
      ws("ws-a", "Alpha", "C:\\a"),
      ws("ws-b", "Beta", "C:\\b"),
    ];
    await createRoot(async (dispose) => {
      await Effect.runPromiseExit(loadWorkspaces());

      expect(workspaces$().length).toBe(2);
      expect(selectedWorkspaceId$()).toBeNull();
      dispose();
    });
  });

  it("D. 已存在的 selectedWorkspaceId$ 不被 loadWorkspaces 覆盖(保留用户上次的选择)", async () => {
    mockList.workspaces = [ws("ws-a", "Alpha", "C:\\a")];
    await createRoot(async (dispose) => {
      setSelectedWorkspaceId("ws-a");

      await Effect.runPromiseExit(loadWorkspaces());

      expect(selectedWorkspaceId$()).toBe("ws-a");
      dispose();
    });
  });
});
