import { describe, it, expect } from "vitest";
import pkg from "../../package.json" with { type: "json" };

type DepMap = Record<string, string>;

const deps = pkg.dependencies as DepMap | undefined;
const devDeps = pkg.devDependencies as DepMap | undefined;
const scripts = pkg.scripts as Record<string, string> | undefined;

describe("T1 — package.json V3 state (D2 + D5 + D6 amendments)", () => {
  describe("removed deps", () => {
    it("no @tauri-apps/plugin-* in dependencies (replaced by electron equivalents)", () => {
      const pluginKeys = Object.keys(deps ?? {}).filter((k) =>
        k.startsWith("@tauri-apps/plugin-"),
      );
      expect(pluginKeys).toEqual([]);
    });

    it("no @tauri-apps/cli in devDependencies (electron-builder takes over)", () => {
      expect(devDeps?.["@tauri-apps/cli"]).toBeUndefined();
    });

    it("no vite-plus in devDependencies (electron-vite replaces it)", () => {
      expect(devDeps?.["vite-plus"]).toBeUndefined();
    });

    it("@tauri-apps/api core REMAINS until T5 source migration", () => {
      // Per consensus 1.3 shim: tauri.ts re-exports from ipc.ts, but
      // tauri.ts body still imports from @tauri-apps/api/core until T5.
      // Removal is T5's responsibility.
      expect(deps?.["@tauri-apps/api"]).toBeDefined();
    });
  });

  describe("added deps — main stack", () => {
    it("electron in devDependencies", () => {
      expect(devDeps?.["electron"]).toBeDefined();
      expect(devDeps?.["electron"]).toMatch(/^\^?\d/);
    });

    it("electron-vite in devDependencies", () => {
      expect(devDeps?.["electron-vite"]).toBeDefined();
    });

    it("electron-builder in devDependencies", () => {
      expect(devDeps?.["electron-builder"]).toBeDefined();
    });

    it("@electron/rebuild in devDependencies (for native ABI)", () => {
      expect(devDeps?.["@electron/rebuild"]).toBeDefined();
    });
  });

  describe("added deps — runtime", () => {
    it("better-sqlite3 in dependencies", () => {
      expect(deps?.["better-sqlite3"]).toBeDefined();
    });

    it("electron-store in dependencies", () => {
      expect(deps?.["electron-store"]).toBeDefined();
    });

    it("electron-log in dependencies", () => {
      expect(deps?.["electron-log"]).toBeDefined();
    });

    it("electron-window-state in dependencies", () => {
      expect(deps?.["electron-window-state"]).toBeDefined();
    });
  });

  describe("scripts rewrite", () => {
    it("tauri:* scripts are removed", () => {
      const tauriScripts = Object.keys(scripts ?? {}).filter((k) =>
        k.startsWith("tauri:"),
      );
      expect(tauriScripts).toEqual([]);
    });

    it("dev script uses electron-vite", () => {
      expect(scripts?.["dev"]).toContain("electron-vite");
    });

    it("build script uses electron-vite", () => {
      expect(scripts?.["build"]).toContain("electron-vite");
    });

    it("test:main script exists (vitest main project per T8)", () => {
      expect(scripts?.["test:main"]).toBeDefined();
      expect(scripts?.["test:main"]).toContain("vitest");
    });

    it("postinstall runs electron-builder install-app-deps", () => {
      expect(scripts?.["postinstall"]).toBe(
        "electron-builder install-app-deps",
      );
    });

    it("build:win emits MSI+NSIS via electron-builder", () => {
      expect(scripts?.["build:win"]).toBeDefined();
      expect(scripts?.["build:win"]).toContain("electron-builder");
      expect(scripts?.["build:win"]).toContain("nsis");
    });
  });

  describe("type field preserved (electron-store ESM)", () => {
    it('package.json keeps "type": "module"', () => {
      expect(pkg.type).toBe("module");
    });
  });
});