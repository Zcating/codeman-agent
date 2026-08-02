import shellQuote from "shell-quote";

export type RiskKind = "low" | "high";

export interface RiskReason {
  tag: string;
  message: string;
}

export interface RiskAssessment {
  kind: RiskKind;
  reasons: RiskReason[];
  needsModelFallback: boolean;
}

export interface AssessRiskInput {
  command: string;
  cwd: string;
}

const DANGEROUS_COMMANDS = new Set(["rm", "del", "format", "shutdown", "reg", "diskpart", "dd", "mkfs", "chmod", "chown", "sudo", "iexe", "Invoke-Expression", "Remove-Item"]);

const DESTRUCTIVE_FLAGS = new Set(["-rf", "-fr", "--force", "/s", "/q", "-Recurse", "-Force"]);

export function assessRisk(input: AssessRiskInput): RiskAssessment {
  const reasons: RiskReason[] = [];

  try {
    const parsed = shellQuote.parse(input.command);

    const flagPattern = /^[/-]/;
    let isFirstToken = true;
    for (const token of parsed) {
      if (typeof token !== "string") continue;
      const trimmed = token.trim();
      const lower = trimmed.toLowerCase();
      if (isFirstToken && DANGEROUS_COMMANDS.has(lower)) {
        reasons.push({ tag: "dangerousCommand", message: `Dangerous command: ${trimmed}` });
      }
      isFirstToken = false;
      if (flagPattern.test(trimmed) && DESTRUCTIVE_FLAGS.has(trimmed)) {
        reasons.push({ tag: "destructiveFlag", message: `Destructive flag: ${trimmed}` });
      }
    }
  } catch {
    reasons.push({ tag: "parseFailure", message: "Failed to parse command" });
    return { kind: "high", reasons, needsModelFallback: true };
  }

  return {
    kind: reasons.length > 0 ? "high" : "low",
    reasons,
    needsModelFallback: false,
  };
}
