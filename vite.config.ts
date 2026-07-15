/// <reference types="vitest" />
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

const isVitest = !!process.env.VITEST;
const solidOptions = isVitest ? { hot: false } : undefined;

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [solid(solidOptions), tailwindcss()],
  staged: {
    "*.{ts,tsx,mjs}": "node scripts/precommit.mjs"
  },
  resolve: {
    conditions: ["browser", "development"],
    alias: [
      {
        find: /^solid-js$/,
        replacement: resolve(__dirname, "node_modules/solid-js/dist/dev.js"),
      },
      {
        find: "solid-js/web",
        replacement: resolve(__dirname, "node_modules/solid-js/web/dist/web.js"),
      },
    ],
  },
  test: {
    dangerouslyIgnoreUnhandledErrors: true,
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: "web",
          environment: "jsdom",
          include: ["src/**/*.{test,spec}.{ts,tsx}"],
          server: {
            deps: { inline: [/solid-js/, /solidjs/] },
          },
        },
      },
      {
        extends: true,
        test: {
          name: "main",
          environment: "node",
          include: ["electron/main/**/*.{test,spec}.{ts,tsx}"],
        },
      },
    ],
    exclude: ["node_modules", "dist", "e2e", "playwright-report"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.spec.{ts,tsx}",
        "src/**/*.test-d.ts",
        "src/**/__tests__/**",
        "src/__mocks__/**",
        "src/index.tsx",
        "src/router.tsx",
        "src/features/**/routes/index.tsx",
        "e2e/**",
        "*.config.ts",
        "electron/main/index.ts",
        "electron/main/ipc.ts",
        "electron/main/db/mod.ts",
        "electron/main/file-sandbox.ts",
        "electron/preload/index.ts",
        "src/shared/lib/ipc.ts",
        "src/shared/lib/tauri.ts",
      ],
      reporter: ["text", "html", "json-summary"],
      thresholds: {
        statements: 80,
        perFile: false,
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1421,
      }
      : undefined,
  },
}));
