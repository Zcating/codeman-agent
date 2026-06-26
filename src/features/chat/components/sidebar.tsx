//! Sidebar — 会话列表（无搜索,新对话走 store 的空守卫）。
//!
//! 消费来自 Effect→Solid 桥接层（`../store/conversations`）。
//! 本文件任何位置都**不**导入 'effect'。
//! Polish F3/F7: inline confirm 替代 confirm() + 完整键盘导航 (ArrowUp/Down/Enter/Delete) + aria-label。
//!
//! "新对话" 的"空画布"守卫放在 store (`createConversation`) ——
/*! UI 不再判断 active 是否空,只调 store 入口。 */
//! 这样业务规则单点,未来加 "n 消息内自动跳过" 之类的规则只动 store 不动组件。

import { createSignal, createEffect, For, onMount, Show } from "solid-js";
import { Plus, Trash2 } from "lucide-solid";
import {
  store,
  conversations$,
  activeId$,
  loadConversations,
  createConversation,
  selectConversation,
  deleteConversation,
} from "../stores/conversations.store";
import { Button } from "../../../shared/components/ui/button";

export function Sidebar() {
  // Polish F3: inline confirm — null 表示不在 confirm 模式,string 表示正在 confirm 该会话 id
  const [confirmingId, setConfirmingId] = createSignal<string | null>(null);
  let listRef: HTMLUListElement | undefined;

  onMount(() => {
    void loadConversations(false);
  });

  // Polish F3: 任何其它地方点击或会话变化时,退出 confirm 模式
  createEffect(() => {
    activeId$();
    setConfirmingId(null);
  });

  // Polish F5: 完整键盘导航 — ArrowUp/Down 在会话间移动 focus,Enter 选中,Delete 进入 confirm,Escape 取消 confirm
  const handleListKeyDown = (e: KeyboardEvent) => {
    const items = conversations$();
    if (items.length === 0) {
      return;
    }
    const currentIdx = items.findIndex((c) => c.id === activeId$());

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % items.length;
      selectConversation(items[nextIdx].id);
      focusItemAt(nextIdx);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const nextIdx = currentIdx <= 0 ? items.length - 1 : currentIdx - 1;
      selectConversation(items[nextIdx].id);
      focusItemAt(nextIdx);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (currentIdx >= 0) {
        selectConversation(items[currentIdx].id);
      }
    } else if (e.key === "Delete") {
      if (currentIdx >= 0) {
        e.preventDefault();
        setConfirmingId(items[currentIdx].id);
      }
    } else if (e.key === "Escape") {
      setConfirmingId(null);
    }
  };

  const focusItemAt = (idx: number) => {
    queueMicrotask(() => {
      const el = listRef?.querySelector<HTMLLIElement>(`[data-conv-idx="${idx}"]`);
      el?.focus();
    });
  };

  const handleConfirmDelete = async (id: string) => {
    await deleteConversation(id);
    setConfirmingId(null);
  };

  // 新对话: 直接调 store 入口。
  // "空画布跳过" 守卫在 `createConversation` 内部（看 conversations.store.ts）,
  // UI 不再做这个判断 —— 业务规则单点,不在每个调用方重复实现。
  const handleNewConversation = () => {
    void createConversation("", "新会话");
  };

  return (
    <aside
      class="flex w-60 h-full flex-col bg-card border-r border-border p-2"
      aria-label="会话侧栏"
    >
      <div class="p-2 border-b border-border mb-2">
        <Button
          type="button"
          variant="default"
          class="w-full h-8 justify-start"
          onClick={handleNewConversation}
          aria-label="新建会话"
          title="新建会话"
        >
          <Plus class="h-4 w-4" />
          新对话
        </Button>
      </div>
      <ul
        ref={listRef}
        class="flex-1 overflow-y-auto mt-2 space-y-1 list-none"
        role="navigation"
        aria-label="会话列表"
        onKeyDown={handleListKeyDown}
      >
        <For
          each={conversations$()}
          fallback={
            <li class="p-3 text-sm text-muted-foreground text-center italic" role="status">
              暂无会话
            </li>
          }
        >
          {(c, idx) => (
            <li
              data-conv-idx={idx()}
              tabindex={0}
              role="link"
              aria-current={c.id === activeId$() ? "page" : undefined}
              aria-label={`会话: ${c.title}`}
              class={`p-2 rounded-md cursor-pointer transition-colors flex flex-col outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                c.id === activeId$() ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
              onClick={() => selectConversation(c.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setConfirmingId(c.id);
              }}
            >
              <Show
                when={confirmingId() === c.id}
                fallback={
                  <>
                    <div class="flex items-center gap-1">
                      <span class="text-sm font-medium truncate">{c.title}</span>
                      <Show when={store.byId[c.id]?.streamingMessageId != null}>
                        <span class="text-xs" aria-label="streaming">
                          ⏳
                        </span>
                      </Show>
                    </div>
                    <span class="text-xs text-muted-foreground mt-0.5">
                      {new Date(c.updated_at * 1000).toLocaleDateString("zh-CN")}
                    </span>
                  </>
                }
              >
                {/* Polish F3: inline confirm 替代 confirm() */}
                <div class="flex flex-col gap-2">
                  <span class="text-xs">确定删除「{c.title}」?</span>
                  <div class="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleConfirmDelete(c.id);
                      }}
                      aria-label="确认删除"
                    >
                      <Trash2 class="h-3 w-3" />
                      删除
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmingId(null);
                      }}
                      aria-label="取消删除"
                    >
                      取消
                    </Button>
                  </div>
                </div>
              </Show>
            </li>
          )}
        </For>
      </ul>
    </aside>
  );
}
