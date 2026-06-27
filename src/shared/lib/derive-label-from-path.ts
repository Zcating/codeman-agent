/**
 * 从文件路径推导显示标签，取最后一个非空路径段。
 * 同时支持 Windows 反斜杠和 Unix 正斜杠路径。
 *
 * @param path - 文件系统路径
 * @returns 路径最后段，空时返回 "Untitled workspace"
 */
export function deriveLabelFromPath(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const lastSep = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  const base = lastSep >= 0 ? trimmed.slice(lastSep + 1) : trimmed;
  const result = base.trim();
  // 处理 Windows drive root (C:) 或空结果
  if (result === "" || /^[A-Za-z]:$/.test(result)) {
    return "Untitled workspace";
  }
  return result;
}
