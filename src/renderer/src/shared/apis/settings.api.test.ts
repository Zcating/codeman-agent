// settings Service IPC 测试，搬迁自 shared/lib/ipc.test.ts
import { it, expect } from "@effect/vitest";
import { describe } from "vitest";
import { Effect } from "effect";
import {
  SettingsService,
  SettingsServiceLive,
  getSettingsBridge,
  updateSettingsBridge,
  clearAllHistoryBridge,
} from "./settings.api";

describe("SettingsService", () => {
  it.effect("getSettings reads from IPC", () =>
    Effect.gen(function* () {
      const svc = yield* SettingsService;
      const settings = yield* svc.getSettings();
      expect(settings.schemaVersion).toBe("1.5");
    }).pipe(Effect.provide(SettingsServiceLive)),
  );
});

describe("Bridge Functions", () => {
  it("getSettingsBridge returns current settings", async () => {
    const settings = await getSettingsBridge();
    expect(settings.schemaVersion).toBe("1.5");
  });

  it("updateSettingsBridge patches settings", async () => {
    const updated = await updateSettingsBridge({ theme: "dark" });
    expect(updated.theme).toBe("dark");
  });

  it("clearAllHistoryBridge completes", async () => {
    await expect(clearAllHistoryBridge()).resolves.toBeUndefined();
  });
});
