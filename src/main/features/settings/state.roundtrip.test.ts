import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SettingsState } from "./state.js";

describe("SettingsState round-trip (ADR-0047 D1)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "codeman-settings-"));
  });

  it("write camelCase Settings → load returns camelCase", () => {
    const file = join(dir, "settings.json");
    const state = new SettingsState(file);
    state.update({ theme: "dark" as const });
    const loaded = state.load();
    expect(loaded).toHaveProperty("theme", "dark");
  });

  it("write snake_case JSON to file → load returns camelCase (snakeToCamel wired)", () => {
    const file = join(dir, "settings.json");
    // Pre-write a complete valid snake_case JSON (old disk format)
    writeFileSync(file, JSON.stringify({
      providers: [],
      schema_version: "1.5",
      user_language: "auto",
      theme: "dark",
      start_at_login: true,
      window: {
        remember_position: true,
        remember_size: true,
        default_size: { width: 800, height: 600 },
        min_size: { width: 400, height: 300 },
      },
      system_prompt: { default: "", user_can_edit: true },
      conversations: { auto_archive_after_days: 30, max_history: 1000 },
    }));
    const state = new SettingsState(file);
    const loaded = state.load();
    expect(loaded).toHaveProperty("theme", "dark");
    expect(loaded).toHaveProperty("startAtLogin", true);
  });

  it("write camelCase Settings → on-disk JSON is snake_case (camelToSnake wired)", () => {
    const file = join(dir, "settings.json");
    const state = new SettingsState(file);
    state.update({ theme: "dark" as const, startAtLogin: true });
    const onDisk = JSON.parse(readFileSync(file, "utf-8"));
    expect(onDisk).toHaveProperty("theme", "dark");
    expect(onDisk).toHaveProperty("start_at_login", true);
    expect(onDisk).not.toHaveProperty("startAtLogin");
  });
});
