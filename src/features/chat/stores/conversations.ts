//! Effect → Solid 会话桥接层。
//!
//! Effect 依赖（通过 layers 消费，**永不**重新导出）：
//! - ConversationService（来自 src/shared/lib/tauri.ts 的 Effect.Context.Tag）
//!
//! UI 暴露（由 Solid 组件消费）：
//! - conversations: Accessor<Conversation[]> — 当前列表
//! - activeId: Accessor<string | null> — 已选会话 id
//! - createConversation(): Promise<void>
//! - startNewConversation(): Promise<void> — UI 入口,带"空画布"守卫
//! - selectConversation(id: string): void
//! - archiveConversation(id: string): Promise<void>
//! - deleteConversation(id: string): Promise<void>

import { createSignal, type Accessor } from "solid-js";
import { Effect, Exit } from "effect";
import { ConversationService, ConversationServiceLive } from "../../../shared/lib/tauri";
import { messages$ } from "./messages";
import type { Conversation, Message } from "../../../shared/lib/types";

// ConversationService 的 runtime layer。在更完整的实现中，
// 这会与 app-level layer 中的其他服务 layer 组合。
const ConversationLayer = ConversationServiceLive;

// Signals 持有纯数据，绝不是 Effect 实例。
const [conversations, setConversations] = createSignal<Conversation[]>([]);
const [activeId, setActiveId] = createSignal<string | null>(null);

/** 初始加载：从服务获取所有（非归档）会话。 */
export async function loadConversations(includeArchived = false): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* ConversationService;
    return yield* svc.list(includeArchived);
  }).pipe(Effect.provide(ConversationLayer));

  const result = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(result)) {
    setConversations(result.value);
  }
}

/** UI 暴露的访问器。 */
export const conversations$: Accessor<Conversation[]> = conversations;

/** UI 暴露的活跃会话 id 访问器。 */
export const activeId$: Accessor<string | null> = activeId;

/** 创建新会话，成功后刷新列表。 */
export async function createConversation(title: string, systemPrompt?: string): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* ConversationService;
    return yield* svc.create(title, systemPrompt);
  }).pipe(Effect.provide(ConversationLayer));

  const result = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(result)) {
    setActiveId(result.value.id);
    await loadConversations();
  }
}

/**
 * 决定"新建会话"按钮是否应该跳过当前状态。
 *
 * 守卫规则（避免 sidebar 累积空 stub）:
 * - `activeId` 是 `null` → 不跳过（没活跃会话,需要新建）
 * - `activeId` 有值 + `messages` 为空 → 跳过（已经在一个空画布上,新建没意义）
 * - `activeId` 有值 + `messages` 有内容 → 不跳过（开新画布）
 *
 * 提取为纯函数方便 TDD ——
 * 调用方 (`startNewConversation`) 传 signals 当前值进来,
 * 不在纯函数里直接 import signal（保持可测性 + 单一职责）。
 */
export function shouldSkipNewConversation(
  activeId: string | null,
  messages: readonly Message[],
): boolean {
  return activeId !== null && messages.length === 0;
}

/**
 * UI 入口: 开始一个新会话。
 *
 * 与 `createConversation` 的区别: 这个函数有空画布守卫 ——
 * 如果当前活跃会话已经是空的 (没消息), 不会创建新会话,
 * 避免在 sidebar 累积一堆空 stub。
 *
 * 调用方: sidebar 的 "新对话" 按钮。`createConversation` 仍是
 * 低层入口（永远创建），供需要"强制创建"的场景使用。
 */
export async function startNewConversation(title: string, systemPrompt?: string): Promise<void> {
  if (shouldSkipNewConversation(activeId(), messages$())) {
    return;
  }
  await createConversation(title, systemPrompt);
}

/** 选择会话（仅 UI；无 IPC）。 */
export function selectConversation(id: string): void {
  setActiveId(id);
}

/** 归档（软删除）会话。 */
export async function archiveConversation(id: string): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* ConversationService;
    yield* svc.archive(id);
  }).pipe(Effect.provide(ConversationLayer));

  const result = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(result)) {
    if (activeId() === id) setActiveId(null);
    await loadConversations();
  }
}

/** 硬删除会话。 */
export async function deleteConversation(id: string): Promise<void> {
  const program = Effect.gen(function* () {
    const svc = yield* ConversationService;
    yield* svc.delete(id);
  }).pipe(Effect.provide(ConversationLayer));

  const result = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(result)) {
    if (activeId() === id) setActiveId(null);
    await loadConversations();
  }
}
