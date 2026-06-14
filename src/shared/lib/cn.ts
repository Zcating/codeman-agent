//! cn — 合并 Tailwind 工具类的工具函数。
//! 结合 clsx（条件类名）与 tailwind-merge（冲突解析）。
//! Pattern from solidcn-ui/solidcn (shadcn for Solid)。

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
