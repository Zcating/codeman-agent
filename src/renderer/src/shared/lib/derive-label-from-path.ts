
export function deriveLabelFromPath(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const lastSep = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  const base = lastSep >= 0 ? trimmed.slice(lastSep + 1) : trimmed;
  const result = base.trim();
  
  if (result === "" || /^[A-Za-z]:$/.test(result)) {
    return "Untitled workspace";
  }
  return result;
}
