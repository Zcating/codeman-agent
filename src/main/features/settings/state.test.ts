import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SettingsState } from "./state.js";
import type { Settings } from "../../settings-schema";

vi.mock("../../settings-schema", () => ({
  sanitize: vi.fn(
    (input: Partial<Settings>) =>
      ({ providers: [], ...(input ?? {}) }) as Settings,
  ),
}));

describe("SettingsState", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "codeman-settings-"));
  });

  it("load() reads empty/nonexistent file and sanitizes to defaults", () => {
    const state = new SettingsState(join(dir, "settings.json"));
    expect(state.load()).toEqual({ providers: [] });
  });

  it("load() returns cached settings on second call (no re-read)", () => {
    const file = join(dir, "settings.json");
    writeFileSync(file, JSON.stringify({ theme: "dark" }));
    const state = new SettingsState(file);
    expect(state.load().theme).toBe("dark");
    writeFileSync(file, JSON.stringify({ theme: "light" }));
    expect(state.load().theme).toBe("dark");
  });

  it("update(patch) merges patch, persists to disk, returns new settings", () => {
    const file = join(dir, "settings.json");
    const state = new SettingsState(file);
    const result = state.update({ theme: "dark" });
    expect(result.theme).toBe("dark");
    expect(JSON.parse(readFileSync(file, "utf-8")).theme).toBe("dark");
  });

  it("deleteProvider(id) removes matching provider and persists", () => {
    const file = join(dir, "settings.json");
    writeFileSync(
      file,
      JSON.stringify({ providers: [{ id: "p1" }, { id: "p2" }] }),
    );
    const state = new SettingsState(file);
    expect(state.deleteProvider("p1")).toEqual([{ id: "p2" }]);
    const saved = JSON.parse(readFileSync(file, "utf-8"));
    expect(saved.providers).toEqual([{ id: "p2" }]);
  });

  it("deleteProvider(id) returns original providers for unknown id", () => {
    const file = join(dir, "settings.json");
    writeFileSync(file, JSON.stringify({ providers: [{ id: "p1" }] }));
    const state = new SettingsState(file);
    expect(state.deleteProvider("nope")).toEqual([{ id: "p1" }]);
  });
});
