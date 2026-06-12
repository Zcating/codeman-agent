//! Settings window root. Renders the section navigation on the left
//! and the active section on the right, plus a first-launch empty
//! state when no API keys are configured.

import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { listProviders } from "../lib/tauri";
import { ApiKeys } from "./settings/ApiKeys";
import { Intervals } from "./settings/Intervals";
import { Thresholds } from "./settings/Thresholds";
import { Hotkeys } from "./settings/Hotkeys";
import { General } from "./settings/General";
import type { JSX } from "solid-js";

interface Section {
  id: string;
  label: string;
  render: () => JSX.Element;
}

const SECTIONS: Section[] = [
  { id: "keys", label: "API keys", render: () => <ApiKeys /> },
  { id: "intervals", label: "Refresh & stale", render: () => <Intervals /> },
  { id: "thresholds", label: "Low-threshold alerts", render: () => <Thresholds /> },
  { id: "hotkeys", label: "Hotkeys", render: () => <Hotkeys /> },
  { id: "general", label: "General", render: () => <General /> },
];

export function SettingsApp() {
  const [active, setActive] = createSignal<string>(SECTIONS[0].id);
  const [providers] = createResource(listProviders);

  const hasAnyKey = createMemo(() =>
    (providers() ?? []).some((p) => p.hasKey),
  );

  return (
    <div class="settings-root">
      <aside class="settings-nav">
        <h1 class="settings-title">codeman-agent</h1>
        <nav>
          <ul>
            <For each={SECTIONS}>
              {(s) => (
                <li>
                  <button
                    type="button"
                    class={`nav-item ${active() === s.id ? "is-active" : ""}`}
                    onClick={() => setActive(s.id)}
                  >
                    {s.label}
                  </button>
                </li>
              )}
            </For>
          </ul>
        </nav>
      </aside>
      <main class="settings-main">
        <Show when={!hasAnyKey()}>
          <div class="first-launch" role="status">
            <strong>Welcome.</strong> Add an API key below to start polling a
            provider. Keys are stored in Windows Credential Manager and never
            leave the local machine.
          </div>
        </Show>
        <For each={SECTIONS}>
          {(s) => (
            <Show when={active() === s.id}>
              {s.render()}
            </Show>
          )}
        </For>
      </main>
    </div>
  );
}
