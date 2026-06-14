//! cn — utility for merging Tailwind utility classes.
//! Combines clsx (conditional classnames) with tailwind-merge (conflict resolution).
//! Pattern from solidcn-ui/solidcn (shadcn for Solid).

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
