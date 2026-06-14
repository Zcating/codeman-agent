//! /  — Chat layout: Sidebar + ChatView + bottom Settings link.

import { Sidebar } from "../agent/components/sidebar";
import { ChatView } from "../agent/components/chat-view";
import { Link } from "@tanstack/solid-router";

export function ChatLayout() {
  return (
    <main class="flex h-screen w-full bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
      <Sidebar />
      <section class="flex-1 flex flex-col overflow-hidden">
        <div class="flex-1 overflow-hidden">
          <ChatView />
        </div>
        <footer class="flex items-center justify-between px-4 py-2 border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
          <span>codeman-agent</span>
          <Link
            to="/settings"
            activeProps={{ class: "text-primary-500 font-medium" }}
            inactiveProps={{ class: "hover:text-zinc-900 dark:hover:text-zinc-100" }}
          >
            ⚙ Settings
          </Link>
        </footer>
      </section>
    </main>
  );
}
