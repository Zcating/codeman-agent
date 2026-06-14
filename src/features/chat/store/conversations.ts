//! Effect → Solid 会话桥接层。
//!
//! Effect 依赖（通过 layers 消费，**永不**重新导出）：
//! - ConversationService（来自 src/shared/lib/tauri.ts 的 Effect.Context.Tag）
//!
//! UI 暴露（由 Solid 组件消费）：
//! - conversations: Accessor<Conversation[]> — 当前列表
//! - activeId: Accessor<string | null> — 已选会话 id
//! - createConversation(): Promise<void>
//! - selectConversation(id: string): void
//! - archiveConversation(id: string): Promise<void>
//! - deleteConversation(id: string): Promise<void>

import { createSignal, type Accessor } from "solid-js";
import { Effect, Exit } from "effect";
import { ConversationService, ConversationServiceLive } from "../../../shared/lib/tauri";
import type { Conversation } from "../../../shared/types";

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
