import { defineConfig } from "oxlint";

export default defineConfig({
  categories: {
    correctness: "warn",
  },
  ignorePatterns: ["**/dist/**", "**/node_modules/**", "**/playwright-report/**"],
  rules: {
    "eslint/no-unused-vars": "error",
    curly: ["error", "all"],
    // ADR-0023 D4-S: forbid raw <select> in features; use codeman-select / codeman-group-select from shared/components/ui
    "no-restricted-syntax": [
      "warn",
      {
        selector: "JSXOpeningElement[name.name='select']",
        message:
          "Use codeman-select or codeman-group-select from shared/components/ui instead of raw <select>. Per ADR-0023 D4-S.",
      },
    ],
  },
});
