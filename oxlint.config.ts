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
});
