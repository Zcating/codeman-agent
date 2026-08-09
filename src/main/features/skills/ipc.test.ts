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
 * Fix: route through the registerEffectHandler helper
 * (src/main/lib/ipc-handler.ts). The bug class — `await someEffect()` —
 * is structurally easy to write; the helper enforces fn must return Effect
 * and routes through runMain before handing the resolved value to Electron's
 * structured-clone layer.
 *
 * Layered test strategy:
 *  - This file locks the call-site pattern (does the handler pass the
 *    Effect to runMain?) — mocks runMain with Effect.runPromise, asserts
 *    runMain is called with an Effect AND the resolved value is cloneable.
 *  - src/main/runtime.test.ts locks the real runMain / MainLive path
 *    (does the runtime actually resolve Effects with the expected
 *    service stack?).
 *  - Combined: a regression in either layer is caught.
 *
 * Mocks below isolate from better-sqlite3 ABI mismatch in CI:
 * - listSkills / readSkillFile return trivial R=never Effects
 * - runMain is mocked to call Effect.runPromise directly
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

// Track call args + run any Effect passed in. The contract under test is
// "the handler passes the Effect to runMain" — verified by the call-arg
// assertion below. Effect.runPromise suffices for the resolved-value type
// assertion; the real runMain / MainLive path is locked in runtime.test.ts.
const runMainMock = vi.fn((eff: Effect.Effect<unknown, unknown, never>) =>
  Effect.runPromise(eff),
);
vi.mock("../../runtime.js", () => ({
  runMain: runMainMock,
}));

describe("skills/ipc.ts", () => {
  beforeEach(() => {
    fakeIpcMain.handle.mockClear();
    runMainMock.mockClear();
  });

  it("skillsScan handler passes the listSkills() Effect to runMain, not await it", async () => {
    const { registerSkillsIpc } = await import("./ipc.js");
    registerSkillsIpc();

    const call = fakeIpcMain.handle.mock.calls.find((c) => c[0] === "skillsScan");
    expect(call, "skillsScan channel should be registered").toBeDefined();
    const handler = call![1] as (event: unknown) => Promise<unknown>;

    const result = await handler({});

    // Layer 1: call-site pattern — handler routed through runMain.
    expect(runMainMock).toHaveBeenCalledTimes(1);
    expect(Effect.isEffect(runMainMock.mock.calls[0][0])).toBe(true);

    // Layer 2: cloneable resolution — result is a plain array, NOT the
    // Effect description (which would have Array.isArray === false).
    expect(Array.isArray(result)).toBe(true);
  });

  it("skillsLoad handler passes the readSkillFile() Effect to runMain, not await it", async () => {
    const { registerSkillsIpc } = await import("./ipc.js");
    registerSkillsIpc();

    const call = fakeIpcMain.handle.mock.calls.find((c) => c[0] === "skillsLoad");
    expect(call, "skillsLoad channel should be registered").toBeDefined();
    const handler = call![1] as (
      _event: unknown,
      args: { name: string },
    ) => Promise<unknown>;

    const result = await handler({}, { name: "test-skill" });

    // Layer 1: call-site pattern — handler routed through runMain.
    expect(runMainMock).toHaveBeenCalledTimes(1);
    expect(Effect.isEffect(runMainMock.mock.calls[0][0])).toBe(true);

    // Layer 2: cloneable resolution — result is a plain string.
    expect(typeof result).toBe("string");
    expect(result).toContain("test-skill");
  });
});

afterAll(() => {
  rmSync(testSkillsDir, { recursive: true, force: true });
});