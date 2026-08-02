import { dialog } from "electron";
import type { RiskAssessment } from "./risk.js";

export type ConfirmDecision = "allow" | "deny";

export interface ConfirmInput {
  command: string;
  cwd: string;
  risk: RiskAssessment;
}

export async function confirmIfRisky(input: ConfirmInput): Promise<ConfirmDecision> {
  if (input.risk.kind === "low") {
    return "allow";
  }
  // ADR-0048 D5 prose says 3 buttons in illustration: [允许一次] [拒绝] [停止当前任务].
  // The actual implementation uses 2 buttons because "停止当前任务" is handled by the chat
  // runtime's session-level cancel (not a dialog option). The 3-button ASCII art is illustrative.
  const result = await dialog.showMessageBox({
    type: "warning",
    buttons: ["允许一次", "拒绝"],
    defaultId: 1,
    cancelId: 1,
    title: "是否允许执行此命令？",
    message: input.command,
    detail: `工作目录: ${input.cwd}\n风险: ${input.risk.kind}\n原因: ${input.risk.reasons.map((r) => `[${r.tag}] ${r.message}`).join(", ")}`,
  });
  return result.response === 0 ? "allow" : "deny";
}
