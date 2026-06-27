//! CodemanSidebar — Layer 2 business composition (per ADR-0022 D3).
//! Consumes Layer 1 (`ui/sidebar.tsx`), adds chat-aware layout.
//! Strictly prop-driven. ZERO business logic, ZERO feature/store imports.

import { createSignal, For, Show, type JSX } from "solid-js";
import { Folder, MessageSquare, Loader2, Plus, FolderPlus } from "lucide-solid";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuBadge,
} from "../ui/sidebar";
import { cn } from "../../lib/cn";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CodemanSidebarWorkspace {
  id: string;
  label: string;
  rootPath: string; // Display path, e.g., "C:\\Users\\foo\\projects\\bar"
}

export interface CodemanSidebarItem {
  id: string;
  label: string;
  subLabel?: string; // e.g., "2024-01-15" formatted date
  isStreaming?: boolean; // Show streaming badge
  isDisabled?: boolean; // e.g., for "Needs workspace" V1.x convs
  disabledReason?: string;
}

export interface CodemanSidebarProps {
  // Workspace group
  workspaces: CodemanSidebarWorkspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;

  // Items (conversations filtered by parent)
  items: CodemanSidebarItem[];
  selectedItemId: string | null;
  onSelectItem: (id: string) => void;
  onDeleteItem?: (id: string) => void;
  onCreateItem?: () => void;
  onAddWorkspace?: () => void;

  // Customization
  createLabel?: string; // default: "新对话"
  addWorkspaceLabel?: string; // default: "Add workspace"
  emptyText?: string; // default: "暂无会话"
  workspacesEmptyText?: string; // default: "No workspaces"
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CodemanSidebar(props: CodemanSidebarProps): JSX.Element {
  // Internal UI state for inline delete confirm — NOT data state
  const [confirmingId, setConfirmingId] = createSignal<string | null>(null);

  return (
    <Sidebar>
      {/* Create button — only when onCreateItem provided */}
      <Show when={props.onCreateItem}>
        <SidebarHeader>
          <button
            type="button"
            class={cn(
              "flex h-8 w-full items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary-600 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            )}
            onClick={() => props.onCreateItem?.()}
            aria-label={props.createLabel ?? "新对话"}
          >
            <Plus class="h-4 w-4" />
            {props.createLabel ?? "新对话"}
          </button>
        </SidebarHeader>
      </Show>

      <SidebarContent>
        {/* Workspace group */}
        <SidebarGroup>
          <SidebarGroupLabel>Workspaces</SidebarGroupLabel>
          <SidebarGroupContent>
            <Show
              when={props.workspaces.length > 0}
              fallback={
                <div class="p-3 text-sm text-muted-foreground">
                  <p>{props.workspacesEmptyText ?? "No workspaces"}</p>
                  <Show when={props.onAddWorkspace}>
                    <button
                      type="button"
                      class="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                      onClick={() => props.onAddWorkspace?.()}
                      aria-label={props.addWorkspaceLabel ?? "Add workspace"}
                    >
                      <FolderPlus class="h-4 w-4" />
                      {props.addWorkspaceLabel ?? "Add workspace"}
                    </button>
                  </Show>
                </div>
              }
            >
              <SidebarMenu>
                <For each={props.workspaces}>
                  {(ws) => (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={ws.id === props.selectedWorkspaceId}
                        onClick={() => props.onSelectWorkspace(ws.id)}
                        aria-label={`Workspace: ${ws.label}`}
                      >
                        <Folder class="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span class="truncate">{ws.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </For>
              </SidebarMenu>
            </Show>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Conversations group */}
        <SidebarGroup>
          <SidebarGroupLabel>Conversations</SidebarGroupLabel>
          <SidebarGroupContent>
            <Show
              when={props.items.length > 0}
              fallback={
                <p class="p-3 text-sm italic text-muted-foreground text-center">
                  {props.emptyText ?? "暂无会话"}
                </p>
              }
            >
              <SidebarMenu>
                <For each={props.items}>
                  {(item) => (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={item.id === props.selectedItemId}
                        onClick={() => {
                          setConfirmingId(null);
                          props.onSelectItem(item.id);
                        }}
                        class={item.isDisabled ? "opacity-60" : undefined}
                        aria-label={`会话: ${item.label}`}
                      >
                        <MessageSquare class="h-4 w-4 shrink-0" aria-hidden="true" />
                        <div class="flex min-w-0 flex-1 flex-col">
                          <span class="truncate text-sm">{item.label}</span>
                          <Show when={item.subLabel}>
                            <span class="truncate text-xs text-muted-foreground">{item.subLabel}</span>
                          </Show>
                        </div>
                      </SidebarMenuButton>

                      {/* Streaming badge */}
                      <Show when={item.isStreaming}>
                        <SidebarMenuBadge>
                          <Loader2
                            class="h-3 w-3 animate-spin"
                            aria-label="streaming"
                          />
                        </SidebarMenuBadge>
                      </Show>

                      {/* Delete action — only when onDeleteItem provided */}
                      <Show when={props.onDeleteItem && !item.isDisabled}>
                        <Show
                          when={confirmingId() === item.id}
                          fallback={
                            <SidebarMenuAction
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmingId(item.id);
                              }}
                              aria-label="Delete"
                            >
                              <span aria-hidden="true">×</span>
                            </SidebarMenuAction>
                          }
                        >
                          {/* Inline confirm UI */}
                          <div class="ml-auto flex gap-1">
                            <button
                              type="button"
                              class="h-7 px-2 text-xs bg-destructive text-destructive-foreground rounded-md hover:bg-destructive-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                props.onDeleteItem?.(item.id);
                                setConfirmingId(null);
                              }}
                              aria-label="确认删除"
                            >
                              删除
                            </button>
                            <button
                              type="button"
                              class="h-7 px-2 text-xs rounded-md border border-input hover:bg-accent"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmingId(null);
                              }}
                              aria-label="取消删除"
                            >
                              取消
                            </button>
                          </div>
                        </Show>
                      </Show>
                    </SidebarMenuItem>
                  )}
                </For>
              </SidebarMenu>
            </Show>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
