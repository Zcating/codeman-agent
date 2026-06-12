//! Top-level floating widget. Renders the active provider's snapshot
//! and exposes a click-to-switch / right-click context menu.

import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import {
  currentEnvelope,
  startSnapshotStore,
  switchActive,
} from "../stores/snapshot";
import { settings } from "../stores/settings";
import {
  forceRefresh,
  hideWidgetWindow,
  showSettingsWindow,
} from "../lib/tauri";
import {
  type ProviderId,
  nextProvider,
} from "../lib/types";
import { PROVIDER_LABEL, balanceOf, planQuotaOf } from "../lib/format";
import { BalanceView } from "./balance-view";
import { PlanQuotaView } from "./plan-quota-view";
import { StaleBadge } from "./stale-badge";
import { Switcher } from "./switcher";

interface MenuItem {
  id: string;
  label: string;
  run: () => void;
}

export function Widget() {
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [menuPos, setMenuPos] = createSignal<{ x: number; y: number } | null>(null);

  onMount(() => {
    void startSnapshotStore();
  });

  const env = createMemo(() => currentEnvelope());
  const balance = createMemo(() => balanceOf(env().snapshot ?? null));
  const quota = createMemo(() => planQuotaOf(env().snapshot ?? null));
  const providerLabel = createMemo(() => PROVIDER_LABEL[env().provider as ProviderId]);

  const closeMenu = () => {
    setMenuOpen(false);
    setMenuPos(null);
  };

  const onBodyClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest(".widget-header")) return;
    if ((e.target as HTMLElement).closest(".widget-menu")) return;
    void switchActive();
  };

  const onBodyContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  };

  const menu = (): MenuItem[] => [
    { id: "settings", label: "Settings…", run: () => void showSettingsWindow() },
    { id: "refresh", label: "Refresh now", run: () => void forceRefresh() },
    { id: "hide", label: "Hide widget", run: () => void hideWidgetWindow() },
  ];

  return (
    <div class="widget-root" onContextMenu={onBodyContextMenu}>
      <div class="widget" onClick={onBodyClick} role="button" tabindex="0" aria-label={`${providerLabel()} balance widget, click to switch`}>
        <header class="widget-header" data-tauri-drag-region>
          <span class="provider-label" data-tauri-drag-region>
            {providerLabel()}
          </span>
          <span class="widget-header-right" data-tauri-drag-region>
            <StaleBadge
              fetchedAt={env().fetched_at}
              staleAfterSecs={settings().stale_after_secs}
            />
            <Switcher
              active={env().provider as ProviderId}
              onSwitch={(_id) => void switchActive()}
            />
          </span>
        </header>
        <main class="widget-body">
          <Show when={balance()}>
            {(s) => <BalanceView snapshot={s()} />}
          </Show>
          <Show when={quota()}>
            {(s) => <PlanQuotaView snapshot={s()} />}
          </Show>
          <Show when={!balance() && !quota()}>
            <div class="empty">
              <Show
                when={env().error}
                fallback={<span class="empty-hint">no snapshot yet</span>}
              >
                <span class="empty-error">{env().error}</span>
              </Show>
            </div>
          </Show>
        </main>
        <footer class="widget-footer">
          <span class="last-updated">
            updated {env().fetched_at ? new Date(env().fetched_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}
          </span>
        </footer>
      </div>
      <Show when={menuOpen() && menuPos()}>
        {(p) => (
          <ul
            class="widget-menu"
            role="menu"
            style={{ left: `${p().x}px`, top: `${p().y}px` }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => {
              e.preventDefault();
              closeMenu();
            }}
          >
            <For each={menu()}>
              {(item) => (
                <li>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      closeMenu();
                      item.run();
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              )}
            </For>
          </ul>
        )}
      </Show>
      <Show when={menuOpen()}>
        <div class="widget-menu-scrim" onClick={closeMenu} />
      </Show>
    </div>
  );
}

// Re-export the helper so a future test can drive the next-provider cycle.
export { nextProvider };
