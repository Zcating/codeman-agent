import { defineConfig } from "oxlint";

export default defineConfig({
  categories: {
    correctness: "warn",
  },
  ignorePatterns: ["**/dist/**", "**/node_modules/**", "**/playwright-report/**"],
  plugins: [],
  rules: {
    "eslint/no-unused-vars": "error",
    curly: ["error", "all"]
  },
  overrides: [
    {
      // ADR-0003 D7: renderer/preload must not pull in Node.js-specific packages.
      // Split per-layer because the `electron` rule below applies to renderer only
      // — preload legitimately owns the `electron` import (contextBridge bridge owner).
      files: ["src/preload/**"],
      rules: {
        "no-restricted-imports": ["error", {
          "paths": ["@effect/platform-node", "@effect/sql", "@effect/sql-sqlite-node", "better-sqlite3"],
          "patterns": []
        }]
      }
    },
    {
      // ADR-0060 D1: renderer must NEVER `import ... from "electron"`.
      // The electron npm package's index.js exports only the executable path string
      // (no `ipcRenderer` named export) — see ADR-0060. Renderer accesses electron
      // APIs exclusively via `window.codeman.<method>` exposed by preload.
      // A regression here surfaces as the dev-mode SyntaxError fixed in commit ebbfb38.
      files: ["src/renderer/**"],
      rules: {
        "no-restricted-imports": ["error", {
          "paths": ["@effect/platform-node", "@effect/sql", "@effect/sql-sqlite-node", "better-sqlite3"],
          "patterns": [{
            "group": ["electron"],
            "message": "renderer must not import 'electron' directly — use the window.codeman bridge exposed by preload (ADR-0060 D1). The electron npm package's index.js is a CJS module exporting only the executable path string, not the ipcRenderer named export — see ADR-0060 for the dev-mode SyntaxError this avoids."
          }]
        }]
      }
    }
  ]
});
