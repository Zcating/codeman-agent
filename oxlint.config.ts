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
      files: ["src/renderer/**", "src/preload/**"],
      rules: {
        // D7: ADR-0003 import boundary - 禁止 renderer/preload 使用 Node.js 特定包
        "no-restricted-imports": ["error", {
          "paths": ["@effect/platform-node", "@effect/sql", "@effect/sql-sqlite-node", "better-sqlite3"],
          "patterns": []
        }]
      }
    }
  ]
});
