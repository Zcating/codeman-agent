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
            "message": "renderer must not import 'electron' directly — use the window.codeman bridge exposed by preload . The electron npm package's index.js is a CJS module exporting only the executable path string, not the ipcRenderer named export — see for the dev-mode SyntaxError this avoids."
          }]
        }]
      }
    }
  ]
});
