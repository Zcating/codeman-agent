// SerializedAppError 曾用于 IPC return 协议,实际实现走 throw 路径;保留仅为向后兼容。
export type SerializedAppError = { kind: string; message: string };

export function sandboxHandler<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
): (_event: unknown, ...args: TArgs) => Promise<TResult> {
  return async (_event, ...args) => {
    try {
      return await fn(...args);
    } catch (e: unknown) {
      if (e && typeof e === "object") {
        if ("kind" in e) {
          const ae = e as { kind: string; message?: string };
          throw new Error(JSON.stringify({ kind: ae.kind, message: ae.message ?? String(e) }));
        }
        if ("_tag" in e) {
          const ae = e as { _tag: string; message?: string };
          throw new Error(JSON.stringify({ kind: ae._tag, message: ae.message ?? String(e) }));
        }
      }
      throw e;
    }
  };
}
