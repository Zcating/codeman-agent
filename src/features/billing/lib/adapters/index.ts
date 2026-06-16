//! 适配器注册表（V1.5+）。
//!
//! 提供中心化 registry 用于获取和注册 BillingAdapter 实例。
//! 初始预注册 DeepSeek 和 MiniMax 适配器。

import type { BillingAdapter } from "./types";
import { deepseekAdapter } from "./deepseek";
import { minimaxAdapter } from "./minimax";

/** 适配器注册表：id → BillingAdapter */
export const adapterRegistry: Map<string, BillingAdapter> = new Map([
  ["deepseek", deepseekAdapter],
  ["minimax", minimaxAdapter],
]);

/**
 * 根据 provider id 获取适配器。
 * @param id 适配器标识符
 * @returns 适配器实例，不存在则返回 null（不抛异常）
 */
export function getAdapter(id: string): BillingAdapter | null {
  return adapterRegistry.get(id) ?? null;
}

/**
 * 注册新适配器（供后续扩展）。
 * @param id 适配器标识符
 * @param adapter 适配器实例
 */
export function registerAdapter(id: string, adapter: BillingAdapter): void {
  adapterRegistry.set(id, adapter);
}
