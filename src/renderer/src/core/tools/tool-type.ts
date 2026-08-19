export type ToolType =
  | { readonly kind: "file-ops" }
  | { readonly kind: "webfetch" }
  | { readonly kind: "run-command" }
  | { readonly kind: "load-skill" }
  | { readonly kind: "mcp"; readonly count: number }
  | { readonly kind: "delegate-task"; readonly agentCount: number };
