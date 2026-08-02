import shellQuote from "shell-quote";
import { resolve, normalize, sep } from "node:path";

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

function checkUnclosedQuotes(cmd: string): boolean {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    }
  }
  return inSingle || inDouble;
}

// Returns true if token contains `/`, `\`, or starts with `.` — broad enough to
// include URLs, flags with paths, and hidden files like `.gitignore` which are valid non-escaping paths.
function containsPathIndicator(token: string): boolean {
  return token.includes("/") || token.includes("\\") || token.startsWith(".");
}

function checkPathEscape(token: string, cwd: string): boolean {
  // Resolve the path relative to cwd
  const resolved = resolve(cwd, token);
  const normalized = normalize(resolved);
  // Escape if resolved path is not within cwd
  if (!normalized.startsWith(normalize(cwd) + sep) && normalized !== normalize(cwd)) {
    return true;
  }
  // Also flag if the normalized path contains .. after normalization
  // (resolve already normalizes, but check original token has .. segments)
  const parts = normalized.split(sep);
  return parts.some((p) => p === "..");
}

function analyzeParsedTokens(tokens: (string | object)[], cwd: string): RiskReason[] {
  const reasons: RiskReason[] = [];
  const flagPattern = /^[/-]/;
  let isFirstToken = true;
  for (const token of tokens) {
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
    if (containsPathIndicator(trimmed) && checkPathEscape(trimmed, cwd)) {
      reasons.push({ tag: "pathEscape", message: `Path escapes working directory: ${trimmed}` });
    }
  }
  return reasons;
}

export function assessRisk(input: AssessRiskInput): RiskAssessment {
  if (checkUnclosedQuotes(input.command)) {
    return { kind: "high", reasons: [{ tag: "parseFailure", message: "Failed to parse command" }], needsModelFallback: true };
  }

  let reasons: RiskReason[] = [];
  try {
    const parsed = shellQuote.parse(input.command);
    reasons = analyzeParsedTokens(parsed, input.cwd);
  } catch {
    return { kind: "high", reasons: [{ tag: "parseFailure", message: "Failed to parse command" }], needsModelFallback: true };
  }

  return {
    kind: reasons.length > 0 ? "high" : "low",
    reasons,
    needsModelFallback: false,
  };
}
