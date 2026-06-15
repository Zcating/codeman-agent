//! /  — Chat 布局：Sidebar + ChatView + 底部 Settings 链接。
//! Polish C1: footer 中文,Settings 链接可点击区域更大。

import { Sidebar } from "../components/sidebar";
import { ChatView } from "../components/chat-view";
import { Link } from "@tanstack/solid-router";
import { Settings as SettingsIcon } from "lucide-solid";

export function ChatLayout() {
  return (
    <main class="flex h-screen w-full bg-background text-foreground">
      <Sidebar />
      <section class="flex-1 flex flex-col overflow-hidden">
        <div class="flex-1 overflow-hidden">
          <ChatView />
        </div>
        <footer class="flex items-center justify-between px-4 py-2 border-t border-border bg-card text-xs text-muted-foreground">
          <span>codeman-agent</span>
          <Link
            to="/settings"
            activeProps={{ class: "text-primary font-medium" }}
            inactiveProps={{
              class:
                "hover:text-foreground transition-colors flex items-center gap-1 px-2 py-1 -mx-2 -my-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            }}
          >
            <SettingsIcon class="h-3.5 w-3.5" aria-hidden="true" />
            <span>设置</span>
          </Link>
        </footer>
      </section>
    </main>
  );
}
