//! Skills store — Solid signal bridge layer (ADR-0031 Wave A2/A5)。
//!
//! 暴露给 UI:
//!   - `skillsManifests$` — SkillManifest[] reactive accessor (默认 [])
//!   - `setManifests(list)` — 替换整个 manifest 列表
//!   - `resetManifests()` — 清空列表
//!   - `refreshManifests(): Effect<...>` — Wave A5: 调 IPC `skillsScan` 拉磁盘列表 + 写 store

import { createSignal, type Accessor } from "solid-js";
import { Effect } from "effect";
import { SkillsService, SkillsServiceLive } from "../../../shared/lib/ipc";
import type { SkillManifest } from "../../../shared/lib/types";

// ─── Signal ─────────────────────────────────────────────

const [manifests, setManifestsInternal] = createSignal<SkillManifest[]>([]);

/** 当前扫描到的全部 skill manifest (含 preinstalled + user, 含 enabled + disabled)。 */
export const skillsManifests$: Accessor<SkillManifest[]> = manifests;

// ─── Actions ────────────────────────────────────────────

/** 替换整个 manifest 列表。Wave A3 IPC handler 间接调用 (via refreshManifests)。 */
export function setManifests(next: SkillManifest[]): void {
  setManifestsInternal(next);
}

/** 清空 manifest 列表。用于退出登录 / IPC 失败回退 / 测试。 */
export function resetManifests(): void {
  setManifestsInternal([]);
}

/** Wave A5: 从 main process 拉最新 manifest 列表 + 写 store。
 *  IPC 失败时 store 不变 (load 不阻塞), 错误抛回 caller。 */
export const refreshManifests = Effect.fnUntraced(function* () {
  const svc = yield* SkillsService;
  const fresh = yield* svc.scan();
  setManifestsInternal(fresh);
  return fresh;
}, Effect.provide(SkillsServiceLive));

/** 测试用 — 重置为初始空状态。 */
export function _resetSkillsStoreForTest(): void {
  setManifestsInternal([]);
}