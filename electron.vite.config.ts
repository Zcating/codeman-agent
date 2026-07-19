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
      const srcDir = r("electron/main/db/migrations");
      const destDir = r("dist-electron/main/db/migrations");
      if (!existsSync(srcDir)) return;
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
      lib: { entry: r("electron/main/index.ts") },
      rollupOptions: { external: ["electron"] },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      target: "node20",
      outDir: "dist-electron/preload",
      lib: { entry: r("electron/preload/index.ts") },
      rollupOptions: { external: ["electron"] },
    },
  },
  renderer: {
    root: ".",
    build: {
      outDir: "dist",
      rollupOptions: { input: { index: r("index.html") } },
    },
    plugins: [solid(), tailwindcss()],
    resolve: {
      alias: [{ find: "@", replacement: r("src") }],
    },
    server: { port: 1420, strictPort: true, host: "127.0.0.1" },
  },
});
