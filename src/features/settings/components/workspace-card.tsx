//! WorkspaceCard 鈥?Card-based UI for a single workspace entry (ADR-0015 V1.7+).
//! All writes go through appStore (debounced 500ms auto-flush); no direct invoke for settings.
//! Uses Tailwind v4 utility classes only (ADR-0006). No BEM, no <style> blocks.
//! No `import { Effect }` 鈥?this is a pure Solid UI component.

import { createSignal } from "solid-js";
import { Effect } from "effect";
import type { Workspace } from "../../../shared/lib/types";
import { appStore } from "../../../shared/stores/app.store";
import { settingsSaver } from "../lib/settings-saver";
import { invoke } from "../../../shared/lib/tauri";
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

export function WorkspaceCard(props: WorkspaceCardProps) {
  const [pathInput, setPathInput] = createSignal(props.workspace.root_path);
  const [isPicking, setIsPicking] = createSignal(false);

  const handleEnabledToggle = (checked: boolean) => {
    const workspaces = (appStore.state.value.workspaces ?? []).map((ws) =>
      ws.id === props.workspace.id ? { ...ws, enabled: checked } : ws,
    );
    appStore.set({ workspaces });
    settingsSaver.scheduleSave();
    props.onUpdate({ enabled: checked });
  };

  const handlePathBlur = () => {
    const val = pathInput();
    if (val !== props.workspace.root_path) {
      const workspaces = (appStore.state.value.workspaces ?? []).map((ws) =>
        ws.id === props.workspace.id ? { ...ws, root_path: val } : ws,
      );
      appStore.set({ workspaces });
      settingsSaver.scheduleSave();
      props.onUpdate({ root_path: val });
    }
  };

  const handleBrowse = async () => {
    setIsPicking(true);
    try {
      const picked = await Effect.runPromise(invoke<string | null>("pick_workspace_path"));
      if (picked !== null) {
        setPathInput(picked);
        const workspaces = (appStore.state.value.workspaces ?? []).map((ws) =>
          ws.id === props.workspace.id ? { ...ws, root_path: picked } : ws,
        );
        appStore.set({ workspaces });
        settingsSaver.scheduleSave();
        props.onUpdate({ root_path: picked });
      }
    } finally {
      setIsPicking(false);
    }
  };

  return (
    <Card class="mb-3 overflow-hidden">
      {/* 鈹€鈹€ Header: label + enabled toggle 鈹€鈹€ */}
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

      {/* 鈹€鈹€ Content: root_path input + browse 鈹€鈹€ */}
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

      {/* 鈹€鈹€ Footer: delete 鈹€鈹€ */}
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
