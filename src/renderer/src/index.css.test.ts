//! index.css.test.ts — 锁定 @layer base 的全局 element 默认 cursor 规则。
//!
//! 2026-07-26 用户反馈 SidebarMenu 内 <span> 标签 hover 时显示 text cursor
//! (预期 default)。修复路径不是给 SidebarMenu 加局部 utility,而是在
//! @layer base 全局锁定 <span> 的默认 cursor,这样未来任何 span 都不会被
//! 任何 ancestor 继承改成 text。
//!
//! jsdom 不一定完整实现 @layer CSSOM 解析 + Vite `?raw` 在 vitest jsdom 项目
//! 里返回空字符串,所以用 Node fs 同步读文件 (vitest jsdom 跑在 Node 上,
//! fs 全局可用) 做文件原文字符匹配锁住规则形状。视觉真伪验证走 e2e
//! (Playwright + 真 Electron, getComputedStyle)。

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const indexCssPath = resolve(here, "./index.css");
const indexCssRaw = readFileSync(indexCssPath, "utf8");

describe("index.css @layer base — span cursor default", () => {
  it("declares span { cursor: default } inside @layer base (per user 2026-07-26)", () => {
    // 匹配形式: @layer base { ... span { cursor: default ... } ... }
    // whitespace 可变,允许 nested rules 之间有任意内容。
    expect(indexCssRaw).toMatch(
      /@layer\s+base\s*\{[\s\S]*?\bspan\s*\{[^}]*cursor:\s*default[^}]*\}[\s\S]*?\}/,
    );
  });

  it("the span cursor rule lives inside @layer base (not at top level)", () => {
    // 提取 @layer base 块内容,验证 span { cursor: default } 在内部。
    const baseMatch = indexCssRaw.match(/@layer\s+base\s*\{[\s\S]*?\n\}/);
    expect(baseMatch).toBeTruthy();
    expect(baseMatch![0]).toMatch(/\bspan\s*\{[^}]*cursor:\s*default[^}]*\}/);
  });
});
