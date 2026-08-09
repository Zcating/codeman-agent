/**
 * src/main/features/skills/ipc.test.ts
 *
 * Regression for IPC structured-clone error:
 *   "Error invoking remote method 'skillsScan': Error: An object could not be cloned."
 *
 * Root cause: listSkills() / readSkillFile() are Effect-returning (post-ADR-0058
 * PR-δ ed90e6f). The IPC handler at ipc.ts used `await listSkills()` which is a
 * no-op for Effect values — `await` only unwraps Promises. The Effect
 * description object (with internal Symbols / closures / fiber state) is
 * returned directly to the renderer. Electron's structured clone algorithm
 * refuses to copy it, surfacing as "An object could not be cloned".
 *
 * Fix: wrap with `runMain(...)` (mirrors the pattern in
 * src/main/features/automations/ipc.ts + workspaces/ipc.ts).
 *
 * These tests assert the handler's resolved value is a plain cloneable value
 * (array for skillsScan, string for skillsLoad), NOT the Effect description.
 *
 * The mocks below isolate the IPC contract (call site pattern) from runtime
 * concerns (better-sqlite3 ABI mismatch in CI, full MainLive layer setup):
 * - listSkills / readSkillFile return trivial R=never Effects (no fs/path needed)
 * - runMain just runs the Effect synchronously via runPromise
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { Effect } from "effect";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testSkillsDir = mkdtempSync(join(tmpdir(), "skills-ipc-test-"));

const fakeIpcMain = { handle: vi.fn() };
const fakeApp = { getPath: vi.fn().mockReturnValue(testSkillsDir) };

vi.mock("electron", () => ({
  ipcMain: fakeIpcMain,
  app: fakeApp,
}));

// Trivial R=never Effects — the bug is in the call site pattern, not the
// Effect body. With R=never, Effect.runPromise works without any Layer.
vi.mock("./skills-host.js", () => ({
  listSkills: vi.fn(() => Effect.succeed([] as const)),
  readSkillFile: vi.fn((name: string) =>
    Effect.succeed(`# ${name}\nbody content`),
  ),
}));

// Mock runMain to skip the real MainLive runtime (better-sqlite3 ABI mismatch
// in this CI env would otherwise abort the handler). The contract under test
// is "does the handler pass the Effect to runMain?" — which runPromise
// faithfully verifies for any R=never Effect.
vi.mock("../../runtime.js", () => ({
  runMain: vi.fn((eff: Effect.Effect<unknown, unknown, never>) =>
    Effect.runPromise(eff),
  ),
}));

describe("skills/ipc.ts", () => {
  beforeEach(() => {
    fakeIpcMain.handle.mockClear();
  });

  it("skillsScan handler returns a plain array (cloneable), not an Effect description", async () => {
    const { registerSkillsIpc } = await import("./ipc.js");
    registerSkillsIpc();

    const call = fakeIpcMain.handle.mock.calls.find((c) => c[0] === "skillsScan");
    expect(call, "skillsScan channel should be registered").toBeDefined();
    const handler = call![1] as (event: unknown) => Promise<unknown>;

    const result = await handler({});

    // Tightest assertion: the resolved value must be a plain array.
    // Before fix: result is the Effect description object (Array.isArray = false).
    // After fix:  result is SkillManifest[] (Array.isArray = true).
    expect(Array.isArray(result)).toBe(true);
  });

  it("skillsLoad handler returns a plain string (cloneable), not an Effect description", async () => {
    const { registerSkillsIpc } = await import("./ipc.js");
    registerSkillsIpc();

    const call = fakeIpcMain.handle.mock.calls.find((c) => c[0] === "skillsLoad");
    expect(call, "skillsLoad channel should be registered").toBeDefined();
    const handler = call![1] as (
      _event: unknown,
      args: { name: string },
    ) => Promise<unknown>;

    const result = await handler({}, { name: "test-skill" });

    // Before fix: result is the Effect description (typeof === "object", not string).
    // After fix:  result is the resolved string.
    expect(typeof result).toBe("string");
    expect(result).toContain("test-skill");
  });
});

afterAll(() => {
  rmSync(testSkillsDir, { recursive: true, force: true });
});