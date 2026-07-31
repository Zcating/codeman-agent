export type SerializedAppError = { kind: string; message: string };

export function sandboxHandler<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
): (_event: unknown, ...args: TArgs) => Promise<TResult | SerializedAppError> {
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
