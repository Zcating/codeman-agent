//! chat.store — workspace auto-select on app startup (regression test for H2 fix)
//!
//! 历史背景(2026-07):用户报告 codeman-agent 的 chat-view + home textarea 都
//! "无法聚焦 / cursor: not-allowed"。诊断后定位 home 一半的根因:
//!
//!   - `home.tsx` 的 `initialWorkspaceId()` = `selectedWorkspaceId$() ?? ""`,
//!     依赖该 signal 在 form 初始化时已反映"用户期望选哪个 workspace"。
//!   - `chat.store.ts` (修复前) 的 `loadWorkspaces` 只写 `workspaces$`,
//!     **不**写 `selectedWorkspaceId$`,导致即使 DB 已有 1 个 workspace,
//!     重启后信号还是 null → form 拿到 "" → `isInputDisabled() = true` →
//!     输入框永久 disabled(`textarea.tsx:18` 的 `disabled:cursor-not-allowed`)。
//!
//! 修复(chat.store.ts::loadWorkspaces 末尾):
//!   if (selectedWorkspaceId() === null && result.length > 0) {
//!     setSelectedWorkspaceIdSignal(result[0].id);
//!   }
//!
//! 此 test 锁住 4 个不变式:
//!   A. 0 workspaces → selectedWorkspaceId$ stays null (HomeAgentForm 永久 disabled, by design)
//!   B. 1 workspace → selectedWorkspaceId$ auto-set to that workspace (HomeAgentForm enabled, by design)
//!   C. 2+ workspaces → selectedWorkspaceId$ stays null (user picks, by design)
//!   D. 已有 selectedWorkspaceId 时 loadWorkspaces 不覆盖(保留用户上次选择)

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

// ─── vi.hoisted mutable mock state(供 vi.mock factory closure 用) ───

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

// Helper:在测试间构造特定 list 数据
const ws = (id: string, label: string, rootPath: string): Workspace => ({
  id,
  label,
  rootPath,
  createdAt: 1,
});

describe("chat.store — loadWorkspaces auto-select invariant (regression for H2 fix)", () => {
  beforeEach(() => {
    // 重置 signal + mock 数据
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
      // 2+ ws case: 不 auto-select,等用户在 HomeAgentForm picker 手动选
      expect(selectedWorkspaceId$()).toBeNull();
      dispose();
    });
  });

  it("D. 已存在的 selectedWorkspaceId$ 不被 loadWorkspaces 覆盖(保留用户上次的选择)", async () => {
    mockList.workspaces = [ws("ws-a", "Alpha", "C:\\a")];
    await createRoot(async (dispose) => {
      // 模拟"用户上次选过 ws-a,signal 已在内存里"
      setSelectedWorkspaceId("ws-a");

      await Effect.runPromiseExit(loadWorkspaces());

      // 即使 list 现在只返 ws-a(用户上次就是它),也不应该重写或破坏 signal
      expect(selectedWorkspaceId$()).toBe("ws-a");
      dispose();
    });
  });
});
