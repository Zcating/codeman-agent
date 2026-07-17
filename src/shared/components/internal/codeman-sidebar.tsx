//! CodemanSidebar — Layer 2 business composition (per ADR-0022 D3 + ADR-0023 D7-CS)。
//! Consumes Layer 1 (`ui/sidebar.tsx`), adds chat-aware layout.
//! Strictly prop-driven. ZERO business logic, ZERO feature/store imports。
//!
//! Cascade accordion 由 @ark-ui/solid Accordion 承载（D7-CS8）：
//! - Ark UI 自动处理 ARIA / 键盘导航 / 折叠-展开状态机
//! - 我们仅叠加语义 data 属性（data-workspace-id / data-conv-id）供 e2e 选择
//! - 展开状态完全由 Ark UI 内部管理（uncontrolled via defaultValue）
//!   符合 ADR-0023 D7-CS2「组件内部 signal，不持久化、不耦合 appStore」。

import { createSignal, For, Show, type JSX } from "solid-js";
import { ChevronRight, Folder, MessageSquare, Loader2, Plus, Pencil, Trash2 } from "lucide-solid";
import { Accordion } from "@ark-ui/solid";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConvNode {
  kind: "conv";
  id: string;
  label: string;
  subLabel?: string; // e.g., "2024-01-15" formatted date
  isStreaming?: boolean; // Show streaming badge
  isDisabled?: boolean; // e.g. for "Needs workspace" V1.x convs (filtered out upstream per D7-CS7)
  disabledReason?: string;
}

export interface WorkspaceNode {
  kind: "workspace";
  id: string;
  label: string;
  rootPath: string; // Display path, e.g., "C:\\Users\\foo\\projects\\bar"
  children: ConvNode[]; // Sorted by updated_at desc (parent responsibility)
}

export interface CodemanSidebarProps {
  // Cascade tree: WorkspaceNode[] with nested ConvNode[]
  nodes: WorkspaceNode[];
  selectedItemId: string | null; // Currently active conv id
  onSelectItem: (id: string) => void;
  onDeleteItem?: (id: string) => void;
  onCreateItem?: () => void;
  onEmptyWorkspaceClick?: (workspaceId: string) => void; // D7-CS6
  onRenameWorkspace?: (workspaceId: string, currentLabel: string) => void;
  onDeleteWorkspace?: (workspaceId: string, label: string) => void;

  // Customization
  createLabel?: string; // default: "新对话"
  workspacesEmptyText?: string; // default: "No workspaces"
  emptyConvText?: string; // default: "该 workspace 暂无会话"

  // Additional styling
  class?: string;

  // Optional footer slot — caller renders arbitrary content (e.g. settings link).
  // Rendered inside <SidebarFooter> at the bottom of the sidebar.
  settingsSlot?: JSX.Element;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CodemanSidebar(props: CodemanSidebarProps): JSX.Element {
  // Inline delete confirm UI state — NOT data state, only transient UI flag
  // for showing the "确认 / 取消" inline confirm UI on a conv item.
  // Cascade accordion state is owned by Ark UI Accordion internally.
  // We pass a render-prop handler for conv click to clear it.
  // NOTE: Ark UI Accordion's uncontrolled mode means we don't track item open
  // state here; only the inline-confirm transient state lives in this component.
  const [confirmingId, setConfirmingId] = createSignal<string | null>(null);

  return (
    <Sidebar class={props.class}>
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
        <SidebarGroup>
          <SidebarGroupLabel>Workspaces</SidebarGroupLabel>
          <SidebarGroupContent>
            <Show
              when={props.nodes.length > 0}
              fallback={
                <div class="p-3 text-sm text-muted-foreground">
                  <p>{props.workspacesEmptyText ?? "No workspaces"}</p>
                </div>
              }
            >
              {/* Ark UI Accordion: cascade with single-expand + collapsible (D7-CS1) */}
              <Accordion.Root
                multiple={false}
                collapsible={true}
                // Expand the first workspace by default so convs are immediately visible
                defaultValue={props.nodes.length > 0 ? [props.nodes[0]!.id] : []}
                data-testid="sidebar-accordion"
              >
                <For each={props.nodes}>
                  {(ws) => (
                    <Accordion.Item
                      value={ws.id}
                      data-workspace-id={ws.id}
                      class="group/item"
                    >
                      <Accordion.ItemTrigger
                        aria-label={`Workspace: ${ws.label}`}
                        class={cn(
                          "flex h-7 w-full items-center gap-2 rounded-md px-2 text-sm",
                          "hover:bg-accent hover:text-accent-foreground",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                        )}
                      >
                        <ChevronRight
                          class="h-4 w-4 shrink-0 transition-transform group-data-[state=open]/item:rotate-90"
                          aria-hidden="true"
                        />
                        <Folder class="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span class="truncate flex-1">{ws.label}</span>
                        <Show when={props.onRenameWorkspace || props.onDeleteWorkspace}>
                          <span
                            class="pointer-events-auto flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Show when={props.onRenameWorkspace}>
                              <button
                                type="button"
                                class="flex h-4 w-4 items-center justify-center rounded-md hover:bg-accent"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  props.onRenameWorkspace?.(ws.id, ws.label);
                                }}
                                aria-label={`Rename ${ws.label}`}
                              >
                                <Pencil class="h-3 w-3" aria-hidden="true" />
                              </button>
                            </Show>
                            <Show when={props.onDeleteWorkspace}>
                              <button
                                type="button"
                                class="flex h-4 w-4 items-center justify-center rounded-md hover:bg-accent hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  props.onDeleteWorkspace?.(ws.id, ws.label);
                                }}
                                aria-label={`Delete ${ws.label}`}
                              >
                                <Trash2 class="h-3 w-3" aria-hidden="true" />
                              </button>
                            </Show>
                          </span>
                        </Show>
                      </Accordion.ItemTrigger>

                      <Accordion.ItemContent>
                        <Show
                          when={ws.children.length > 0}
                          fallback={
                            <div class="pl-6 pr-3 pb-2">
                              <button
                                type="button"
                                class="w-full text-left px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                                onClick={() => props.onEmptyWorkspaceClick?.(ws.id)}
                                aria-label={`${ws.label}: ${props.emptyConvText ?? "该 workspace 暂无会话"}`}
                                data-empty-workspace-id={ws.id}
                              >
                                {props.emptyConvText ?? "该 workspace 暂无会话"}
                              </button>
                            </div>
                          }
                        >
                          <SidebarMenu>
                            <For each={ws.children}>
                              {(c) => (
                                <SidebarMenuItem class="group relative">
                                  <SidebarMenuButton
                                    isActive={c.id === props.selectedItemId}
                                    onClick={() => {
                                      setConfirmingId(null);
                                      props.onSelectItem(c.id);
                                    }}
                                    class={c.isDisabled ? "opacity-60" : undefined}
                                    aria-label={`会话: ${c.label}`}
                                    aria-current={c.id === props.selectedItemId ? "page" : undefined}
                                    data-conv-id={c.id}
                                  >
                                    <MessageSquare class="h-4 w-4 shrink-0" aria-hidden="true" />
                                    <div class="flex min-w-0 flex-1 flex-col">
                                      <span class="truncate text-sm">{c.label}</span>
                                      <Show when={c.subLabel}>
                                        <span class="truncate text-xs text-muted-foreground">{c.subLabel}</span>
                                      </Show>
                                    </div>
                                  </SidebarMenuButton>

                                  {/* Streaming badge */}
                                  <Show when={c.isStreaming}>
                                    <SidebarMenuBadge>
                                      <Loader2
                                        class="h-3 w-3 animate-spin"
                                        aria-label="streaming"
                                      />
                                    </SidebarMenuBadge>
                                  </Show>

                                  {/* Delete action — only when onDeleteItem provided */}
                                  <Show when={props.onDeleteItem && !c.isDisabled}>
                                    <Show
                                      when={confirmingId() === c.id}
                                      fallback={
                                        <SidebarMenuAction
                                          showOnHover={true}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setConfirmingId(c.id);
                                          }}
                                          aria-label="Delete"
                                        >
                                          <span aria-hidden="true">×</span>
                                        </SidebarMenuAction>
                                      }
                                    >
                                      {/* Confirm overlay — covers the entire row so the
                                          buttons aren't crammed at the row's end. */}
                                      <div class="absolute inset-0 z-10 flex items-center justify-end gap-1 rounded-md bg-sidebar pr-2">
                                        <button
                                          type="button"
                                          class="h-7 px-2 text-xs bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            props.onDeleteItem?.(c.id);
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
                      </Accordion.ItemContent>
                    </Accordion.Item>
                  )}
                </For>
              </Accordion.Root>
            </Show>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <Show when={props.settingsSlot}>
        <SidebarFooter>{props.settingsSlot}</SidebarFooter>
      </Show>
    </Sidebar>
  );
}
