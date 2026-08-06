import type { AutomationRule, AutomationSchedule, AutomationAction } from "@codeman-frontend/shared/lib/automation-types";

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatSchedule(schedule: AutomationSchedule): string {
  switch (schedule.kind) {
    case "interval": {
      const s = schedule.everyMs;
      if (s < 60_000) return `Every ${s}ms`;
      if (s < 3_600_000) return `Every ${s / 60_000}min`;
      if (s < 86_400_000) return `Every ${s / 3_600_000}h`;
      return `Every ${s / 86_400_000}d`;
    }
    case "daily": {
      const h = String(schedule.hour).padStart(2, "0");
      const m = String(schedule.minute).padStart(2, "0");
      return `Daily at ${h}:${m}`;
    }
    case "weekly": {
      const h = String(schedule.hour).padStart(2, "0");
      const m = String(schedule.minute).padStart(2, "0");
      return `Every ${WEEKDAY_NAMES[schedule.weekday]} at ${h}:${m}`;
    }
  }
}

export function formatActionKind(action: AutomationAction): string {
  switch (action.kind) {
    case "llm":
      return `LLM`;
    case "script":
      return `Script (${action.language})`;
  }
}

export function formatRuleSummary(rule: AutomationRule): string {
  return `${rule.name} · ${formatSchedule(rule.schedule)} · ${formatActionKind(rule.action)}`;
}
