









import {
  NotFound,
  Unauthorized,
  Network,
  InvalidConfig,
  Database,
  ToolCall,
  SandboxViolation,
  Unknown,
  type AppError,
} from "@codeman-frontend/shared/lib/errors";
import { Schema } from "effect";

const AppErrorUnion = Schema.Union(
  NotFound,
  Unauthorized,
  Network,
  InvalidConfig,
  Database,
  ToolCall,
  SandboxViolation,
  Unknown,
);


export const decodeAppError = (u: unknown): AppError => {
  if (u instanceof NotFound) {return u;}
  if (u instanceof Unauthorized) {return u;}
  if (u instanceof Network) {return u;}
  if (u instanceof InvalidConfig) {return u;}
  if (u instanceof Database) {return u;}
  if (u instanceof ToolCall) {return u;}
  if (u instanceof SandboxViolation) {return u;}
  if (u instanceof Unknown) {return u;}

  
  if (u && typeof u === "object" && ("kind" in u || "_tag" in u)) {
    const decoded = Schema.decodeUnknownEither(AppErrorUnion)(u);
    if (decoded._tag === "Right") {
      return decoded.right;
    }
  }

  
  const message = u instanceof Error ? u.message : String(u);
  return new Unknown({ message });
};