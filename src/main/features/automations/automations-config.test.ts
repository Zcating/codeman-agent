/**
 * src/main/features/automations/automations-config.test.ts
 *
 * PR-γ : 测试走 TestLayer（NodeFileSystemLive + NodePath.layer）。
 *
 * 注：vi.mock 被 hoist 到所有 import 之上。引用顶层 const 即使已经声明也会
 * 触发 vitest 的 "no top level variables inside" 安全检查。解决方案：把
 * mock state 放进 vi.hoisted()（vitest 官方为此场景设计）。
 */
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Effect, Layer } from "effect";
import * as NodePathModule from "@effect/platform-node/NodePath";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { NodeFileSystemLive } from "../../lib/file-system-node.js";
import {
  automationsConfigExists,
  readAutomationsConfig,
  writeAutomationsConfig,
} from "./automations-config.js";

const mocks = vi.hoisted(() => {
  const mockGetPath = vi.fn(() => "");
  return { mockGetPath };
});

vi.mock("electron", () => ({
  app: { getPath: mocks.mockGetPath },
}));

const TestLayer = Layer.mergeAll(NodeFileSystemLive, NodePathModule.layer);
const runWithFs = <A, E, R>(
  eff: Effect.Effect<A, E, R>,
): Promise<A> =>
  Effect.runPromise(eff.pipe(Effect.provide(TestLayer)) as Effect.Effect<A, E, never>);

let tempDir = "";

beforeEach(() => {
  tempDir = join(
    tmpdir(),
    `codeman-automations-test-${Date.now()}-${Math.random()}`,
  );
  mocks.mockGetPath.mockReturnValue(tempDir);
});

afterEach(async () => {
  try {
    await rm(join(tempDir, ".agents"), { recursive: true, force: true });
  } catch {
    // ignore
  }
  vi.restoreAllMocks();
});

describe("automations-config", () => {
  describe("readAutomationsConfig", () => {
    it("returns empty config when file does not exist (ENOENT fallback)", async () => {
      const configPath = join(tempDir, ".agents", "automations.json");
      try {
        await rm(configPath, { force: true });
      } catch {
        // ignore
      }
      const result = await runWithFs(readAutomationsConfig());
      expect(result).toEqual({ version: 1, rules: [] });
    });

    it("rejects with InvalidConfig when file contains invalid JSON", async () => {
      const configPath = join(tempDir, ".agents", "automations.json");
      const { writeFile, mkdir } = await import("node:fs/promises");
      await mkdir(join(tempDir, ".agents"), { recursive: true });
      await writeFile(configPath, "not valid json{{{", "utf-8");
      await expect(runWithFs(readAutomationsConfig())).rejects.toThrow();
    });

    it("roundtrips correctly after writeAutomationsConfig", async () => {
      const config = {
        version: 1 as const,
        rules: [
          {
            id: "0191a123-4567-7890-abcd-ef0123456789",
            name: "Every 5 minutes check",
            enabled: true,
            schedule: { kind: "interval" as const, everyMs: 300_000 },
            action: {
              kind: "llm" as const,
              systemPrompt: "You are a helpful assistant.",
              userPrompt: "Check system status.",
              providerId: "minimax",
              modelId: "claude-opus",
              timeoutMs: 300_000,
            },
            createdAt: 1_725_558_000_000,
            updatedAt: 1_725_558_000_000,
          },
        ],
      };
      await runWithFs(writeAutomationsConfig(config));
      const readBack = await runWithFs(readAutomationsConfig());
      expect(readBack).toEqual(config);
    });
  });

  describe("writeAutomationsConfig", () => {
    it("creates .agents directory if it does not exist (mkdir -p)", async () => {
      const config = { version: 1 as const, rules: [] };
      await runWithFs(writeAutomationsConfig(config));
      const exists = await runWithFs(automationsConfigExists());
      expect(exists).toBe(true);
    });
  });

  describe("automationsConfigExists", () => {
    it("returns false when config file does not exist", async () => {
      const configPath = join(tempDir, ".agents", "automations.json");
      try {
        await rm(configPath, { force: true });
      } catch {
        // ignore
      }
      const result = await runWithFs(automationsConfigExists());
      expect(result).toBe(false);
    });

    it("returns true when config file exists", async () => {
      await runWithFs(writeAutomationsConfig({ version: 1, rules: [] }));
      const result = await runWithFs(automationsConfigExists());
      expect(result).toBe(true);
    });
  });
});