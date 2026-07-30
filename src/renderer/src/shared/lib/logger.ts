
































export type LogLevel = "debug" | "info" | "warn" | "error";


function emit(level: LogLevel, args: readonly unknown[]): void {
  const first = args[0];
  
  
  
  
  switch (level) {
    case "debug":
      if (typeof first === "string") {
        console.debug(`[DEBUG] ${first}`, ...args.slice(1));
      } else {
        console.debug("[DEBUG]", ...args);
      }
      return;
    case "info":
      if (typeof first === "string") {
        console.info(`[INFO] ${first}`, ...args.slice(1));
      } else {
        console.info("[INFO]", ...args);
      }
      return;
    case "warn":
      if (typeof first === "string") {
        console.warn(`[WARN] ${first}`, ...args.slice(1));
      } else {
        console.warn("[WARN]", ...args);
      }
      return;
    case "error":
      if (typeof first === "string") {
        console.error(`[ERROR] ${first}`, ...args.slice(1));
      } else {
        console.error("[ERROR]", ...args);
      }
      return;
  }
}


export const logger = {
  debug(...args: readonly unknown[]): void {
    emit("debug", args);
  },
  info(...args: readonly unknown[]): void {
    emit("info", args);
  },
  warn(...args: readonly unknown[]): void {
    emit("warn", args);
  },
  error(...args: readonly unknown[]): void {
    emit("error", args);
  },
};
