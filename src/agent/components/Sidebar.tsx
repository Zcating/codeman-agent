//! Sidebar — conversation list with search.
//!
//! Consumes from the Effect→Solid bridge (`agent/store/conversations`).
//! Does NOT import 'effect' anywhere in this file.

import { createSignal, createEffect, For, onMount, onCleanup } from "solid-js";
import {
  conversations$,
  activeId$,
  loadConversations,
  createConversation,
  selectConversation,
  deleteConversation,
} from "../store/conversations";
import type { Conversation } from "../../lib/types";

export function Sidebar() {
  const [query, setQuery] = createSignal("");
  const [debouncedQuery, setDebouncedQuery] = createSignal("");
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    void loadConversations(false);
  });

  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  // Debounce search input (200ms).
  createEffect(() => {
    const q = query();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => setDebouncedQuery(q), 200);
  });

  const filtered = (): Conversation[] => {
    const all = conversations$();
    const q = debouncedQuery().trim().toLowerCase();
    if (!q) return all;
    return all.filter((c) => c.title.toLowerCase().includes(q));
  };

  return (
    <>
      <style>{`
        .sidebar {
          display: flex;
          flex-direction: column;
          width: 240px;
          height: 100%;
          background: #1a1a2e;
          border-right: 2px solid #16213e;
          font-family: "Courier New", Courier, monospace;
          color: #e0e0e0;
        }
        .sidebar__header {
          display: flex;
          gap: 6px;
          padding: 10px 8px;
          border-bottom: 2px solid #16213e;
        }
        .sidebar__search {
          flex: 1;
          padding: 4px 8px;
          background: #0f0f23;
          border: 2px solid #16213e;
          border-radius: 2px;
          color: #e0e0e0;
          font-family: inherit;
          font-size: 11px;
          outline: none;
        }
        .sidebar__search:focus {
          border-color: #4a4ae0;
        }
        .sidebar__search::placeholder {
          color: #666;
        }
        .sidebar__new {
          width: 28px;
          height: 28px;
          background: #4a4ae0;
          border: 2px solid #6a6af0;
          border-radius: 2px;
          color: #fff;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          line-height: 1;
        }
        .sidebar__new:hover {
          background: #6a6af0;
        }
        .sidebar__new:active {
          background: #3a3ad0;
        }
        .sidebar__list {
          flex: 1;
          overflow-y: auto;
          list-style: none;
          margin: 0;
          padding: 4px 0;
        }
        .sidebar__list::-webkit-scrollbar {
          width: 6px;
        }
        .sidebar__list::-webkit-scrollbar-track {
          background: #0f0f23;
        }
        .sidebar__list::-webkit-scrollbar-thumb {
          background: #16213e;
          border-radius: 2px;
        }
        .sidebar__empty {
          padding: 12px 8px;
          color: #666;
          font-size: 11px;
          text-align: center;
        }
        .sidebar__item {
          display: flex;
          flex-direction: column;
          padding: 8px 10px;
          cursor: pointer;
          border-bottom: 1px solid #16213e;
          transition: background 0.1s;
        }
        .sidebar__item:hover {
          background: #16213e;
        }
        .sidebar__item--active {
          background: #4a4ae0;
        }
        .sidebar__item--active:hover {
          background: #5a5af0;
        }
        .sidebar__title {
          font-size: 12px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sidebar__date {
          font-size: 9px;
          color: #888;
          margin-top: 3px;
        }
        .sidebar__item--active .sidebar__date {
          color: #ccc;
        }
      `}</style>
      <aside class="sidebar">
        <div class="sidebar__header">
          <input
            type="search"
            class="sidebar__search"
            placeholder="Search…"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          <button
            type="button"
            class="sidebar__new"
            onClick={() => {
              void createConversation("New conversation");
            }}
            title="New conversation"
          >
            +
          </button>
        </div>
        <ul class="sidebar__list">
          <For each={filtered()} fallback={<li class="sidebar__empty">No conversations</li>}>
            {(c) => (
              <li
                classList={{
                  "sidebar__item": true,
                  "sidebar__item--active": c.id === activeId$(),
                }}
                onClick={() => selectConversation(c.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (confirm(`Delete conversation "${c.title}"?`)) {
                    void deleteConversation(c.id);
                  }
                }}
              >
                <span class="sidebar__title">{c.title}</span>
                <span class="sidebar__date">
                  {new Date(c.updated_at * 1000).toLocaleDateString()}
                </span>
              </li>
            )}
          </For>
        </ul>
      </aside>
    </>
  );
}