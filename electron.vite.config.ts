// electron-vite.config.ts — T2 (per plan agent T2 spec, simplified)
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import type { Plugin } from "vite";

const root = dirname(fileURLToPath(import.meta.url));
const r = (p) => resolve(root, p);

/** Vite plugin: copy .sql migration files to dist-electron/main/db/migrations/. */
function copyMigrationsPlugin(): Plugin {
  return {
    name: "copy-migrations",
    closeBundle() {
      const srcDir = r("src/main/db/migrations");
      const destDir = r("dist-electron/main/db/migrations");
      if (!existsSync(srcDir)) {return;}
      mkdirSync(destDir, { recursive: true });
      for (const f of readdirSync(srcDir)) {
        if (f.endsWith(".sql")) {
          copyFileSync(join(srcDir, f), join(destDir, f));
        }
      }
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyMigrationsPlugin()],
    build: {
      target: "node20",
      outDir: "dist-electron/main",
      lib: { entry: r("src/main/index.ts") },
      rollupOptions: { external: ["electron"] },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      target: "node20",
      outDir: "dist-electron/preload",
      lib: { entry: r("src/preload/index.ts") },
      rollupOptions: { external: ["electron"] },
    },
  },
  renderer: {
    // Vite dev server root MUST point at the renderer source so that the
    // SPA fallback (`/`) can serve `index.html`. With `root: "."` the dev
    // server tried to fall back to the repo root, where no `index.html`
    // exists, so `http://127.0.0.1:1420/` returned 404 and the Electron
    // renderer loaded a blank page (E2E works because it builds first and
    // loads via `app://./`, bypassing vite dev entirely).
    root: "src/renderer",
    build: {
      // outDir is relative to the new root, so go up one level to keep the
      // build artifact at the repo-root `dist/` that E2E's globalSetup
      // expects (`dist-electron/` already lives there).
      outDir: "../dist",
      emptyOutDir: true,
      // rollupOptions.input must be an absolute path. With the relative
      // form `"index.html"`, vite's dependency-scan phase resolves it
      // against its own CWD (the repo root after root change), fails with
      // `failed to resolve rolldownOptions.input value: "index.html"`, and
      // skips pre-bundling — which leaves Solid + pi-ai un-bundled in dev
      // and the renderer renders a blank page.
      rollupOptions: {
        input: { index: r("src/renderer/index.html") },
        // Externalize electron — renderer is browser context, has no `__dirname`,
        // pre-bundling electron would trigger `__dirname is not defined` at runtime.
        // main-listener.ts imports `electron` for historical reasons (ADR-0053 TC);
        // runtime guard makes it a no-op in browser. Architectural fix (move listener
        // to preload + window.codeman bridge) tracked separately.
        external: ["electron"],
      },
    },
    plugins: [solid(), tailwindcss()],
    resolve: {
      // alias must stay absolute — Vite's resolve.alias is a full path
      // substitution, not a root-relative one.
      alias: [{ find: "@codeman-frontend", replacement: r("src/renderer/src") }],
    },
    optimizeDeps: {
      // Skip electron in dev mode pre-bundling — same root cause as build external.
      exclude: ["electron"],
    },
    server: { port: 1420, strictPort: true, host: "127.0.0.1" },
  },
});
