


const STORAGE_KEY = "codeman.input-history.v1";
const MAX_ENTRIES = 100;


export function loadHistory(): string[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {return [];}
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {return [];}
    const filtered = parsed.filter((x): x is string => typeof x === "string");
    return filtered.slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}


export function saveHistory(entries: string[]): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    
    
  }
}


export function recordEntry(
  entries: readonly string[],
  content: string,
): string[] {
  const trimmed = content.trim();
  if (trimmed === "") {return entries.slice();}
  if (entries.length > 0 && entries[0] === trimmed) {return entries.slice();}
  const next = [trimmed, ...entries];
  if (next.length > MAX_ENTRIES) {next.length = MAX_ENTRIES;}
  return next;
}


export const INPUT_HISTORY_STORAGE_KEY = STORAGE_KEY;
export const INPUT_HISTORY_MAX_ENTRIES = MAX_ENTRIES;
