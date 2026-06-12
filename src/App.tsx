//! Root app. Picks the Widget or Settings view based on the URL hash
//! and runs the shared stores once on mount.
//!
//! `tauri.conf.json` opens the settings window at `index.html#/settings`
//! and the widget window at `index.html`, so a tiny hash router is all
//! the chrome we need — no need for a heavier SPA router.

import { createSignal, onMount, Show } from "solid-js";
import { Widget } from "./components/Widget";
import { SettingsApp } from "./components/SettingsApp";
import { startSnapshotStore } from "./stores/snapshot";
import { loadSettings } from "./stores/settings";
import { getActiveProvider } from "./lib/tauri";
import { setActiveId } from "./stores/snapshot";
import type { View } from "./lib/types";
import "./styles/widget.css";
import "./styles/settings.css";

function currentView(): View {
  return window.location.hash.startsWith("#/settings") ? "settings" : "widget";
}

export default function App() {
  const [view, setView] = createSignal<View>(currentView());

  onMount(() => {
    void (async () => {
      try {
        const id = await getActiveProvider();
        setActiveId(id);
      } catch {
        // ignore
      }
      await Promise.all([loadSettings(), startSnapshotStore()]);
    })();
    window.addEventListener("hashchange", () => setView(currentView()));
  });

  return (
    <Show when={view() === "settings"} fallback={<Widget />}>
      <SettingsApp />
    </Show>
  );
}
