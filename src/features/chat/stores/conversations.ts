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
import { Effect, Exit, Layer } from "effect";
import { ConversationService, ConversationServiceLive } from "../../../shared/lib/tauri";
import { AgentRuntime, AgentRuntimeLive } from "../lib/runtime";
import { messages$ } from "./messages";
import type { AppError, Conversation, Message } from "../../../shared/lib/types";

// ConversationService 的 runtime layer。R = never,适合不需要 AgentRuntime 的函数
// (loadConversations / createConversation / selectConversation)。
// 在更完整的实现中,这会与 app-level layer 中的其他服务 layer 组合。
const ConversationLayer = ConversationServiceLive;

// V1.6+ per ADR-0014 D7:archive / delete 在调 DB 删之前需 AgentRuntime.cancel +
// destroy 清理 SSE 连接,ConversationLayer 必须提供 AgentRuntime。
// AgentRuntimeLive 的 R = MessageService | SettingsService | LLMProviderService,
// 这个 layer 仅供 archiveConversationEffect / deleteConversationEffect 用。
const DestructiveLayer = Layer.merge(AgentRuntimeLive, ConversationServiceLive);

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

/**
 * 归档（软删除）会话。
 *
 * V1.6+ per ADR-0014 D7:删除前必须先 `AgentRuntime.cancel(convId)` 清理 SSE
 * 连接,再 `AgentRuntime.destroy(convId)` 释放 Agent 实例,最后才调 DB 删。
 * 调用顺序不可调换 ——
 *   cancel 在前:防止 in-flight fetch 还在向已不存在的 conv 写数据;
 *   destroy 居中:从 Map 移除引用,避免 JS GC 不可预测;
 *   svc.archive 在后:DB 是 source of truth,删完不回来。
 */
export const archiveConversationEffect = (id: string) =>
  Effect.gen(function* () {
    const runtime = yield* AgentRuntime;
    yield* runtime.cancel(id);
    yield* runtime.destroy(id);
    const svc = yield* ConversationService;
    yield* svc.archive(id);
  });

export async function archiveConversation(id: string): Promise<void> {
  // Explicit type annotation:Effect.provide 后 R 应该 = never (Layer 提供所有 service),
  // 但 TS 推断保留 R 让 runPromiseExit 拒绝。显式标注强制窄化。
  const program: Effect.Effect<void, AppError, never> = archiveConversationEffect(id).pipe(
    Effect.provide(DestructiveLayer),
  ) as Effect.Effect<void, AppError, never>;

  const result = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(result)) {
    if (activeId() === id) {
      setActiveId(null);
    }
    await loadConversations();
  }
}

/**
 * 硬删除会话。
 *
 * V1.6+ per ADR-0014 D7:同 archiveConversation 顺序 (cancel → destroy → svc.delete)。
 */
export const deleteConversationEffect = (id: string) =>
  Effect.gen(function* () {
    const runtime = yield* AgentRuntime;
    yield* runtime.cancel(id);
    yield* runtime.destroy(id);
    const svc = yield* ConversationService;
    yield* svc.delete(id);
  });

/** 硬删除会话。 */
export async function deleteConversation(id: string): Promise<void> {
  const program: Effect.Effect<void, AppError, never> = deleteConversationEffect(id).pipe(
    Effect.provide(DestructiveLayer),
  ) as Effect.Effect<void, AppError, never>;

  const result = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(result)) {
    if (activeId() === id) {
      setActiveId(null);
    }
    await loadConversations();
  }
}
