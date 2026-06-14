/// <reference types="vitest" />
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [solid(), tailwindcss()],

  // `vp staged` runs on `git commit` (see `.vite-hooks/pre-commit`, installed
  // by `vp config`). The wrapper script consumes vp-staged's positional file
  // args so the typecheck stays full-project and runs `pnpm test` (the
  // project is on vitest 2.1.x which has no `--related` flag, and the full
  // suite is <5s). We intentionally do not use `vp check --fix` here: it
  // would invoke oxfmt/oxlint and reformat the entire codebase, conflicting
  // with the existing Tailwind v4 utility style (see ADR-0006). The `.mjs`
  // extension is included so edits to `scripts/precommit.mjs` itself also
  // re-trigger the hook. Add a new entry here when introducing additional
  // staged checks (e.g. a Rust check on `*.rs` would go in
  // scripts/precommit.mjs).
  staged: {
    "*.{ts,tsx,mjs}": "node scripts/precommit.mjs",
  },
  resolve: {
    conditions: ["browser", "development"],
    alias: [
      { find: /^solid-js$/, replacement: resolve(__dirname, "node_modules/solid-js/dist/solid.js") },
      { find: "solid-js/web", replacement: resolve(__dirname, "node_modules/solid-js/web/dist/web.js") },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    passWithNoTests: true,
    server: {
      deps: {
        inline: [/solid-js/, /@solidjs/],
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));