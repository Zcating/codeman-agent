// ADR-0053 TB — automations-config tests
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";

const fakeApp = { getPath: vi.fn() };
vi.mock("electron", () => ({ app: fakeApp }));

const { readAutomationsConfig, writeAutomationsConfig, automationsConfigExists } = await import("./automations-config");

describe("automations-config", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `codeman-automations-test-${Date.now()}-${Math.random()}`);
    fakeApp.getPath.mockReturnValue(tempDir);
  });

  afterEach(async () => {
    try {
      await rm(join(tempDir, ".agents"), { recursive: true, force: true });
    } catch { /* ignore */ }
    vi.restoreAllMocks();
  });

  describe("readAutomationsConfig", () => {
    it("returns empty config when file does not exist (ENOENT fallback)", async () => {
      const { Effect } = await import("effect");
      const configPath = join(tempDir, ".agents", "automations.json");
      try {
        await rm(configPath, { force: true });
      } catch { /* ignore */ }
      const result = await Effect.runPromise(readAutomationsConfig());
      expect(result).toEqual({ version: 1, rules: [] });
    });

    it("returns Left with InvalidConfig when file exists but contains invalid JSON", async () => {
      const { Effect } = await import("effect");
      const configPath = join(tempDir, ".agents", "automations.json");
      const { writeFile, mkdir } = await import("node:fs/promises");
      await mkdir(join(tempDir, ".agents"), { recursive: true });
      await writeFile(configPath, "not valid json{{{", "utf-8");
      await expect(Effect.runPromise(readAutomationsConfig())).rejects.toThrow();
    });

    it("roundtrips correctly after writeAutomationsConfig", async () => {
      const { Effect } = await import("effect");
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
      await Effect.runPromise(writeAutomationsConfig(config));
      const readBack = await Effect.runPromise(readAutomationsConfig());
      expect(readBack).toEqual(config);
    });
  });

  describe("writeAutomationsConfig", () => {
    it("creates .agents directory if it does not exist (mkdir -p)", async () => {
      const { Effect } = await import("effect");
      const config = { version: 1 as const, rules: [] };
      // Directory does not exist yet — write should succeed
      await Effect.runPromise(writeAutomationsConfig(config));
      const exists = await automationsConfigExists();
      expect(exists).toBe(true);
    });
  });

  describe("automationsConfigExists", () => {
    it("returns false when config file does not exist", async () => {
      const configPath = join(tempDir, ".agents", "automations.json");
      try {
        await rm(configPath, { force: true });
      } catch { /* ignore */ }
      const result = await automationsConfigExists();
      expect(result).toBe(false);
    });

    it("returns true when config file exists", async () => {
      const { Effect } = await import("effect");
      await Effect.runPromise(writeAutomationsConfig({ version: 1 as const, rules: [] }));
      const result = await automationsConfigExists();
      expect(result).toBe(true);
    });
  });
});
