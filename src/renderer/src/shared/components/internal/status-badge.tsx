import type { JSX } from "solid-js";

export type StatusBadgeTone = "neutral" | "info" | "success" | "warning" | "destructive";

export interface StatusBadgeProps {
  tone: StatusBadgeTone;
  label?: string;
  dot?: boolean;
  size?: "sm" | "md";
  class?: string;
  "data-testid"?: string;
}

const TONE_CLASSES: Record<StatusBadgeTone, { fg: string; bg: string; dot: string }> = {
  neutral: {
    fg: "text-zinc-600 dark:text-zinc-400",
    bg: "bg-zinc-100 dark:bg-zinc-800",
    dot: "bg-zinc-400",
  },
  info: {
    fg: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-100 dark:bg-blue-900/40",
    dot: "bg-blue-500",
  },
  success: {
    fg: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    dot: "bg-emerald-500",
  },
  warning: {
    fg: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-100 dark:bg-amber-900/40",
    dot: "bg-amber-500",
  },
  destructive: {
    fg: "text-destructive",
    bg: "bg-destructive/10",
    dot: "bg-destructive",
  },
};

const SIZE_CLASSES = {
  sm: "text-[10px] px-1.5 py-0.5 rounded",
  md: "text-xs px-2 py-0.5 rounded",
} as const;

export function StatusBadge(props: StatusBadgeProps): JSX.Element {
  const tone = () => props.tone;
  const label = () => props.label;
  const dot = () => props.dot ?? false;
  const size = () => props.size ?? "md";
  const toneClasses = () => TONE_CLASSES[tone()];

  const displayLabel = (): string => label() || "—";

  return (
    <span
      class={`inline-flex items-center gap-1 ${SIZE_CLASSES[size()]} ${toneClasses().fg} ${toneClasses().bg} ${props.class ?? ""}`}
      data-testid={props["data-testid"]}
      aria-label={`${tone()}: ${displayLabel()}`}
    >
      {dot() ? (
        <span
          class={`inline-block h-1.5 w-1.5 rounded-full ${toneClasses().dot}`}
          aria-hidden="true"
        />
      ) : null}
      <span>{displayLabel()}</span>
    </span>
  );
}
