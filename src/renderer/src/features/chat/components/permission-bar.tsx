import { Show } from "solid-js";
import { ShieldAlert } from "lucide-solid";
import type { JSX } from "solid-js";

export interface PermissionRequest {
  requestID: string;
  tool: string;
  command: string;
  cwd: string;
  risk: {
    kind: "low" | "high";
    reasons: Array<{ tag: string; message: string }>;
  };
}

export function PermissionBar(props: {
  pending: PermissionRequest | null;
  onDecision: (requestID: string, decision: "once" | "always" | "reject") => void;
}): JSX.Element {
  return (
    <Show when={props.pending}>
      {(p) => (
        <div
          data-testid="permission-bar"
          class="mx-4 mb-2 rounded-lg border border-warning/40 bg-warning/10 p-3"
        >
          <div class="flex items-start gap-2">
            <ShieldAlert class="h-5 w-5 flex-shrink-0 text-warning" />
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium">是否允许执行此命令？</div>
              <div class="mt-1 font-mono text-xs break-all">{p().command}</div>
              <div class="mt-1 text-xs text-muted-foreground">
                工作目录: {p().cwd} · 风险: {p().risk.kind}
              </div>
              <Show when={p().risk.reasons.length > 0}>
                <ul class="mt-1 list-disc pl-4 text-xs">
                  {p().risk.reasons.map((r) => <li>{r.message}</li>)}
                </ul>
              </Show>
              <div class="mt-2 flex gap-2 justify-end">
                <button
                  data-testid="permission-bar-reject"
                  class="rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-destructive/10"
                  onClick={() => props.onDecision(p().requestID, "reject")}
                >
                  拒绝
                </button>
                <button
                  data-testid="permission-bar-always"
                  class="rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-primary/10"
                  onClick={() => props.onDecision(p().requestID, "always")}
                >
                  总是允许
                </button>
                <button
                  data-testid="permission-bar-once"
                  class="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90"
                  onClick={() => props.onDecision(p().requestID, "once")}
                >
                  允许一次
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}
