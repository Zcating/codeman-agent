//! WorkspaceCard — Card-based UI for a single workspace entry.
//! Uses Tailwind v4 utility classes only (ADR-0006). No BEM, no <style> blocks.
//! No `import { Effect }` — this is a pure Solid UI component.

import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import type { Workspace } from "../../../shared/lib/types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../../../shared/components/ui/card";

export interface WorkspaceCardProps {
  workspace: Workspace;
  /** Called when workspace enabled/disabled or root_path changes */
  onUpdate: (patch: Partial<Workspace>) => void;
  /** Called when workspace delete button is clicked */
  onRemove: () => void;
}

/**
 * Pick a folder path via Tauri dialog plugin.
 * Falls back to null if the Tauri command is not yet implemented.
 */
async function pickWorkspacePath(): Promise<string | null> {
  try {
    // pick_workspace_path Tauri command (src-tauri/src/commands/mod.rs)
    // uses tauri-plugin-dialog to open a folder picker
    const path = await invoke<string | null>("pick_workspace_path");
    return path;
  } catch {
    return null;
  }
}

export function WorkspaceCard(props: WorkspaceCardProps) {
  const [pathInput, setPathInput] = createSignal(props.workspace.root_path);
  const [isPicking, setIsPicking] = createSignal(false);

  const handleEnabledToggle = (checked: boolean) => {
    props.onUpdate({ enabled: checked });
  };

  const handlePathBlur = () => {
    const val = pathInput();
    if (val !== props.workspace.root_path) {
      props.onUpdate({ root_path: val });
    }
  };

  const handleBrowse = async () => {
    setIsPicking(true);
    try {
      const picked = await pickWorkspacePath();
      if (picked !== null) {
        setPathInput(picked);
        props.onUpdate({ root_path: picked });
      }
    } finally {
      setIsPicking(false);
    }
  };

  return (
    <Card class="mb-3 overflow-hidden">
      {/* ── Header: label + enabled toggle ── */}
      <CardHeader class="flex flex-row items-center justify-between p-4 pb-3">
        <div class="flex flex-col gap-0.5 min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={props.workspace.enabled}
              onChange={(e) => handleEnabledToggle(e.currentTarget.checked)}
              class="h-4 w-4 rounded border-input text-primary-500 focus:ring-primary-500"
            />
            <CardTitle class="text-base font-semibold truncate">{props.workspace.label}</CardTitle>
          </div>
          <CardDescription class="text-xs font-mono text-muted-foreground truncate">
            {props.workspace.id}
          </CardDescription>
        </div>
        <span class="text-xs text-muted-foreground ml-2 shrink-0">
          {props.workspace.enabled ? "Enabled" : "Disabled"}
        </span>
      </CardHeader>

      {/* ── Content: root_path input + browse ── */}
      <CardContent class="space-y-2 p-4 pt-0">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-muted-foreground font-medium">Root path</label>
          <div class="flex gap-2">
            <input
              type="text"
              class="flex-1 h-9 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={pathInput()}
              onInput={(e) => setPathInput(e.currentTarget.value)}
              onBlur={handlePathBlur}
              placeholder="C:\path\to\workspace"
            />
            <button
              type="button"
              class="h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              onClick={handleBrowse}
              disabled={isPicking()}
              title="Browse for folder"
            >
              {isPicking() ? "…" : "Browse…"}
            </button>
          </div>
        </div>
      </CardContent>

      {/* ── Footer: delete ── */}
      <CardFooter class="flex justify-end p-4 pt-0">
        <button
          type="button"
          class="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-md hover:bg-red-50 dark:hover:bg-red-950 dark:border-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
          onClick={props.onRemove}
          title="Delete workspace"
        >
          Delete
        </button>
      </CardFooter>
    </Card>
  );
}
