//! Sidebar — 带搜索的会话列表。
//!
//! 消费来自 Effect→Solid 桥接层（`../store/conversations`）。
//! 本文件任何位置都**不**导入 'effect'。

import { createSignal, createEffect, For, onMount, onCleanup } from "solid-js";
import { Plus } from "lucide-solid";
import {
  conversations$,
  activeId$,
  loadConversations,
  createConversation,
  selectConversation,
  deleteConversation,
} from "../store/conversations";
import type { Conversation } from "../../../shared/types";

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

  // 防抖搜索输入（200ms）。
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
    <aside class="flex w-60 h-full flex-col bg-white dark:bg-zinc-800 border-r border-zinc-200 dark:border-zinc-700 p-2">
      <div class="flex gap-2 p-2 border-b border-zinc-200 dark:border-zinc-700 mb-2">
        <input
          type="search"
          class="flex-1 px-2 py-1 text-sm rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 focus:border-primary-500 focus:outline-none"
          placeholder="Search…"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
        <button
          type="button"
          class="w-8 h-8 rounded-md bg-primary-500 text-white font-bold text-lg hover:bg-primary-600 flex items-center justify-center"
          onClick={() => {
            void createConversation("New conversation");
          }}
          title="New conversation"
        >
          <Plus class="h-4 w-4" />
        </button>
      </div>
      <ul class="flex-1 overflow-y-auto mt-2 space-y-1 list-none">
        <For each={filtered()} fallback={<li class="p-3 text-sm text-zinc-500 text-center italic">No conversations</li>}>
          {(c) => (
            <li
              class={`p-2 rounded-md cursor-pointer transition-colors flex flex-col ${
                c.id === activeId$()
                  ? "bg-primary-500 text-white hover:bg-primary-600"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-700"
              }`}
              onClick={() => selectConversation(c.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (confirm(`Delete conversation "${c.title}"?`)) {
                  void deleteConversation(c.id);
                }
              }}
            >
              <span class="text-sm font-medium truncate">{c.title}</span>
              <span class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {new Date(c.updated_at * 1000).toLocaleDateString()}
              </span>
            </li>
          )}
        </For>
      </ul>
    </aside>
  );
}
