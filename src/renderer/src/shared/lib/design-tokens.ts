//! V2.1 Design Tokens
//!
//! 双层设计：
//! - **CSS 颜色**（`@theme` 块，src/index.css）：layout 颜色 token（bg-sidebar / text-sidebar-foreground 等）
//! - **TS 常量**（本文件）：JS 控制的属性（动效时长、keyboard shortcut）
//!
//! **重要**：本文件**不装 layout 尺寸常量**。layout 尺寸（如 sidebar width）走 CSS 变量，
//! JSX 用 `w-[var(--sidebar-width)]`。理由：Tailwind JIT 无法在编译时扫到 template literal
//! `w-[${SIDEBAR_WIDTH}]`，动态拼 className 不能生成 utility。Round 3 hyperplan 决议。

/**
 * Sidebar 折叠/展开动效时长（毫秒）。
 * 适用 transition-duration: var(--transition-duration-sidebar)
 * （CSS 变量映射此值,由具体 CSS 规则决定）。
 */
export const SIDEBAR_TRANSITION_MS = 200;

/**
 * Sidebar 折叠/展开的 keyboard shortcut key。
 * V1 不绑定（V2.2 才接 Command Palette）；保留常量为未来扩展点。
 */
export const SIDEBAR_KEYBOARD_SHORTCUT = "b";
