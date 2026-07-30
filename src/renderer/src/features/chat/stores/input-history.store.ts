






import { createSignal, type Accessor } from "solid-js";
import {
  INPUT_HISTORY_MAX_ENTRIES,
  loadHistory,
  saveHistory,
} from "@codeman-frontend/features/chat/lib/input-history";



const [history, setHistory] = createSignal<string[]>(loadHistory());
const [cursor, setCursor] = createSignal<number>(-1);

export const inputHistory$: Accessor<string[]> = history;
export const inputHistoryCursor$: Accessor<number> = cursor;




export function recordInputEntry(content: string): void {
  const trimmed = content.trim();
  if (trimmed === "") {
    setCursor(-1);
    return;
  }
  const current = inputHistory$();
  
  if (current.length > 0 && current[0] === trimmed) {
    setCursor(-1);
    return;
  }
  const next = [trimmed, ...current];
  if (next.length > INPUT_HISTORY_MAX_ENTRIES) {
    next.length = INPUT_HISTORY_MAX_ENTRIES;
  }
  setHistory(next);
  saveHistory(next);
  setCursor(-1);
}




export interface NavResult {
  readonly value: string;
}


export function navigateInputHistoryPrev(): NavResult | null {
  const e = inputHistory$();
  if (e.length === 0) {return null;}
  const c = inputHistoryCursor$();
  if (c === e.length - 1) {return null;}
  const next = c + 1;
  setCursor(next);
  return { value: e[next]! };
}


export function navigateInputHistoryNext(): NavResult | null {
  const e = inputHistory$();
  if (e.length === 0) {return null;}
  const c = inputHistoryCursor$();
  if (c === -1) {return null;}
  if (c === 0) {
    setCursor(-1);
    return { value: "" };
  }
  const next = c - 1;
  setCursor(next);
  return { value: e[next]! };
}


export function _resetInputHistoryForTest(): void {
  setHistory([]);
  setCursor(-1);
}




export function handleArrowUp(
  getInput: () => string,
  setInput: (value: string) => void,
): boolean {
  const cursorVal = inputHistoryCursor$();
  if (cursorVal === -1) {
    if (getInput().trim() !== "") {return false;}
    if (inputHistory$().length === 0) {return false;}
  }
  const result = navigateInputHistoryPrev();
  if (result !== null) {setInput(result.value);}
  return true;
}


export function handleArrowDown(setInput: (value: string) => void): boolean {
  if (inputHistoryCursor$() === -1) {return false;}
  const result = navigateInputHistoryNext();
  if (result !== null) {setInput(result.value);}
  return true;
}








export interface FieldAccessor {
  readonly state: { readonly value: string };
  handleChange(value: string): void;
}


export function handleArrowUpField(field: () => FieldAccessor): boolean {
  return handleArrowUp(
    () => field().state.value,
    (v) => field().handleChange(v),
  );
}


export function handleArrowDownField(field: () => FieldAccessor): boolean {
  return handleArrowDown((v) => field().handleChange(v));
}
